import "server-only";

import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";
import IORedis from "ioredis";
import { cookies } from "next/headers";
import type { UserAccount } from "@/domain/types";
import { ADMIN_SESSION_COOKIE, SESSION_COOKIE } from "@/domain/constants";
import { createInitialAdminCredential, getAccountByEmail, getAccountById, getAdminCredentialByUsername, registerTrialAccount } from "@/server/store";
import { hashAdminPassword, verifyAdminPassword } from "@/server/password";
import { smtpConfig } from "@/server/config";

export { ADMIN_SESSION_COOKIE, SESSION_COOKIE };
const TEN_MINUTES = 10 * 60 * 1000;
const SESSION_LENGTH = 30 * 24 * 60 * 60 * 1000;
const ADMIN_SESSION_LENGTH = 8 * 60 * 60 * 1000;
const DUMMY_ADMIN_PASSWORD_HASH = hashAdminPassword("not-a-real-admin-password");

type SessionPayload = { userId: string; role: UserAccount["role"]; purpose: "user" | "admin"; expiresAt: number };
type OtpRecord = { digest: string; expiresAt: number; used: boolean };

declare global {
  var __rankMonitorOtps: Map<string, OtpRecord> | undefined;
}

const otpStore = () => (globalThis.__rankMonitorOtps ??= new Map());
const secret = () => process.env.AUTH_SECRET || "development-only-change-before-production";
const digest = (value: string) => createHash("sha256").update(`${secret()}:${value}`).digest("hex");
const base64url = (value: string) => Buffer.from(value).toString("base64url");

declare global {
  var __rankMonitorAuthRedis: IORedis | undefined;
}

function authRedis() {
  if (!process.env.REDIS_URL) throw new Error("生产登录必须配置 REDIS_URL");
  globalThis.__rankMonitorAuthRedis ??= new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: 2 });
  return globalThis.__rankMonitorAuthRedis;
}

async function rateLimit(key: string, limit: number, seconds: number) {
  const redis = authRedis();
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, seconds);
  if (count > limit) throw new Error("操作过于频繁，请稍后再试");
}

export function signSession(payload: SessionPayload) {
  const encoded = base64url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifySession(token: string | undefined, purpose: SessionPayload["purpose"]): SessionPayload | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = createHmac("sha256", secret()).update(encoded).digest("base64url");
  const left = Buffer.from(signature); const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    const purposeMatches = payload.purpose === purpose || (purpose === "user" && !payload.purpose);
    return purposeMatches && payload.expiresAt > Date.now() ? payload : null;
  } catch { return null; }
}

async function getUserSession() {
  if (process.env.AUTH_MODE !== "production") return { userId: "user-demo", role: "ADMIN" as const, purpose: "user" as const, expiresAt: Date.now() + SESSION_LENGTH };
  if (!process.env.AUTH_SECRET) throw new Error("生产环境必须配置 AUTH_SECRET");
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value, "user");
}

async function getAdminSession() {
  if (process.env.AUTH_MODE !== "production") return { userId: "user-demo", role: "ADMIN" as const, purpose: "admin" as const, expiresAt: Date.now() + ADMIN_SESSION_LENGTH };
  if (!process.env.AUTH_SECRET) throw new Error("生产环境必须配置 AUTH_SECRET");
  return verifySession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value, "admin");
}

export async function assertUser() {
  const adminSession = await getAdminSession();
  const session = adminSession || await getUserSession();
  if (!session) throw new Error("请先登录");
  if (process.env.AUTH_MODE !== "production") return session;
  const account = await getAccountById(session.userId);
  if (!account) throw new Error("账户不存在或已停用");
  if (account.membershipStatus === "已到期") throw new Error("工具使用权限已到期，请联系管理员");
  if (account.membershipStatus === "试用" && !account.trialApproved) throw new Error("试用申请尚未审批");
  return { userId: account.id, role: adminSession ? account.role : "USER" as const, expiresAt: session.expiresAt };
}

export async function getOptionalActor() {
  try { return await assertUser(); }
  catch { return null; }
}

export async function assertAdmin() {
  const session = await getAdminSession();
  if (!session || session.role !== "ADMIN") throw new Error("请使用管理员账号登录");
  const account = await getAccountById(session.userId);
  if (!account || account.role !== "ADMIN") throw new Error("管理员账户不存在或已停用");
  return { userId: account.id, role: "ADMIN" as const, expiresAt: session.expiresAt };
}

export async function getOptionalAdminActor() {
  try { return await assertAdmin(); }
  catch { return null; }
}

export async function assertInitialAdminBootstrap() {
  const session = await getUserSession();
  if (!session) throw new Error("请先通过初始管理员邮箱确认身份");
  const account = await getAccountById(session.userId);
  if (!account || account.role !== "ADMIN") throw new Error("只有初始管理员可以设置管理账号");
  return { userId: account.id, role: "ADMIN" as const, expiresAt: session.expiresAt };
}

export async function authenticateAdmin(usernameValue: string, password: string, ipValue = "unknown") {
  if (process.env.AUTH_MODE !== "production") throw new Error("本地模式无需管理员密码登录");
  const username = usernameValue.trim().toLocaleLowerCase("en-US");
  const usernameKey = createHash("sha256").update(username.toLocaleLowerCase("en-US")).digest("hex").slice(0, 24);
  const ipKey = createHash("sha256").update(ipValue).digest("hex").slice(0, 24);
  await rateLimit(`auth:admin:username:${usernameKey}`, 8, 15 * 60);
  await rateLimit(`auth:admin:ip:${ipKey}`, 20, 15 * 60);
  const credential = await getAdminCredentialByUsername(username);
  const passwordMatches = verifyAdminPassword(password, credential?.password_hash || DUMMY_ADMIN_PASSWORD_HASH);
  if (!credential || !passwordMatches) throw new Error("账号或密码错误");
  const account = await getAccountById(credential.user_id);
  if (!account || account.role !== "ADMIN") throw new Error("管理员账户不存在或已停用");
  await authRedis().del(`auth:admin:username:${usernameKey}`, `auth:admin:ip:${ipKey}`);
  return { account, token: signSession({ userId: account.id, role: "ADMIN", purpose: "admin", expiresAt: Date.now() + ADMIN_SESSION_LENGTH }) };
}

export async function setupInitialAdminCredential(actor: { userId: string; role: UserAccount["role"] }, username: string, password: string) {
  if (actor.role !== "ADMIN") throw new Error("需要管理员权限");
  const created = await createInitialAdminCredential({ userId: actor.userId, role: "ADMIN" }, username, hashAdminPassword(password));
  const account = await getAccountById(created.userId);
  if (!account || account.role !== "ADMIN") throw new Error("管理员账户不存在或已停用");
  return { account, token: signSession({ userId: account.id, role: "ADMIN", purpose: "admin", expiresAt: Date.now() + ADMIN_SESSION_LENGTH }) };
}

export async function issueOtp(emailValue: string, ipValue = "unknown") {
  const email = emailValue.trim().toLocaleLowerCase("en-US");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  if (process.env.AUTH_MODE === "production") {
    const emailKey = createHash("sha256").update(email).digest("hex").slice(0, 24);
    const ipKey = createHash("sha256").update(ipValue).digest("hex").slice(0, 24);
    await rateLimit(`auth:send:email:${emailKey}`, 3, 15 * 60);
    await rateLimit(`auth:send:ip:${ipKey}`, 10, 15 * 60);
    await authRedis().set(`auth:otp:${emailKey}`, digest(code), "PX", TEN_MINUTES);
  } else {
    otpStore().set(email, { digest: digest(code), expiresAt: Date.now() + TEN_MINUTES, used: false });
  }

  if (process.env.SMTP_HOST) {
    const config = smtpConfig();
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
    });
    await transporter.sendMail({
      from: config.from,
      to: email,
      subject: "自然排名监控工具登录或注册验证码",
      text: `您的验证码是 ${code}，10 分钟内有效且只能使用一次。新邮箱验证成功后将自动创建试用账号。`,
    });
  } else if (process.env.NODE_ENV === "production") {
    throw new Error("邮件服务尚未配置");
  }
  return { email, devCode: process.env.NODE_ENV === "production" ? null : code };
}

export async function consumeOtp(emailValue: string, code: string, ipValue = "unknown") {
  const email = emailValue.trim().toLocaleLowerCase("en-US");
  if (process.env.AUTH_MODE === "production") {
    const emailKey = createHash("sha256").update(email).digest("hex").slice(0, 24);
    const ipKey = createHash("sha256").update(ipValue).digest("hex").slice(0, 24);
    await rateLimit(`auth:verify:email:${emailKey}`, 8, 10 * 60);
    await rateLimit(`auth:verify:ip:${ipKey}`, 20, 10 * 60);
    const consumed = await authRedis().eval(`
      local value = redis.call('GET', KEYS[1])
      if not value then return 0 end
      if value ~= ARGV[1] then return -1 end
      redis.call('DEL', KEYS[1])
      return 1
    `, 1, `auth:otp:${emailKey}`, digest(code.trim()));
    if (Number(consumed) === 0) throw new Error("验证码无效或已过期");
    if (Number(consumed) === -1) throw new Error("验证码错误");
  } else {
    const record = otpStore().get(email);
    if (!record || record.used || record.expiresAt <= Date.now()) throw new Error("验证码无效或已过期");
    if (record.digest !== digest(code.trim())) throw new Error("验证码错误");
    record.used = true;
  }
  const account = await getAccountByEmail(email) || await registerTrialAccount(email);
  return { account, token: signSession({ userId: account.id, role: "USER", purpose: "user", expiresAt: Date.now() + SESSION_LENGTH }) };
}
