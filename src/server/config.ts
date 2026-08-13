import { z } from "zod";
import { resolveMeteringMode } from "@/domain/metering";

type Environment = Record<string, string | undefined>;
const smtpPort = z.coerce.number().int().min(1).max(65_535);

export function smtpConfig(env: Environment = process.env) {
  const host = env.SMTP_HOST?.trim();
  const from = env.SMTP_FROM?.trim();
  if (!host) throw new Error("SMTP_HOST 未配置");
  if (!from || !from.includes("@")) throw new Error("SMTP_FROM 未配置或格式无效");
  if (!env.SMTP_USER?.trim() || !env.SMTP_PASSWORD) throw new Error("SMTP_USER 或 SMTP_PASSWORD 未配置");
  if (!["true", "false"].includes(env.SMTP_SECURE || "")) throw new Error("SMTP_SECURE 只能是 true 或 false");
  const port = smtpPort.safeParse(env.SMTP_PORT);
  if (!port.success) throw new Error("SMTP_PORT 必须是 1–65535 的端口号");
  return {
    host,
    port: port.data,
    secure: env.SMTP_SECURE === "true",
    auth: { user: env.SMTP_USER.trim(), pass: env.SMTP_PASSWORD },
    from,
  };
}

export function validateProductionEnvironment(env: Environment = process.env) {
  const required = ["DATABASE_URL", "REDIS_URL", "AUTH_SECRET", "APP_ORIGIN", "APP_DOMAIN", "INITIAL_ADMIN_EMAIL"] as const;
  const missing = required.filter((key) => !env[key]?.trim());
  if (missing.length) throw new Error(`缺少生产环境变量：${missing.join("、")}`);
  if ((env.AUTH_SECRET?.length || 0) < 32) throw new Error("AUTH_SECRET 至少需要 32 个字符");
  const origin = z.string().url().safeParse(env.APP_ORIGIN);
  if (!origin.success) throw new Error("APP_ORIGIN 必须是完整 URL");
  if (new URL(origin.data).hostname !== env.APP_DOMAIN) throw new Error("APP_ORIGIN 与 APP_DOMAIN 不一致");
  if (!/^[a-z0-9.-]+$/i.test(env.APP_DOMAIN || "") || (env.APP_DOMAIN || "").includes("..")) throw new Error("APP_DOMAIN 格式无效");
  if (!z.string().email().safeParse(env.INITIAL_ADMIN_EMAIL).success) throw new Error("INITIAL_ADMIN_EMAIL 格式无效");
  if (env.METERING_MODE && !["disabled", "wallet"].includes(env.METERING_MODE)) throw new Error("METERING_MODE 只能是 disabled 或 wallet");
  return {
    origin: origin.data,
    domain: env.APP_DOMAIN,
    meteringMode: resolveMeteringMode(env.METERING_MODE),
    smtp: smtpConfig(env),
  };
}
