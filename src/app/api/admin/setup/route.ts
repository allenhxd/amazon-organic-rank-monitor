import { NextResponse } from "next/server";
import { z } from "zod";
import { ADMIN_SESSION_COOKIE, assertInitialAdminBootstrap, setupInitialAdminCredential } from "@/server/auth";
import { hasAdminCredential } from "@/server/store";

const credentialSchema = z.object({
  username: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_-]{4,31}$/, "账号需为 5–32 位，以字母开头，可使用字母、数字、下划线和短横线"),
  password: z.string().min(12, "密码至少 12 位").max(128, "密码不能超过 128 位")
    .regex(/[a-z]/, "密码至少包含一个小写字母")
    .regex(/[A-Z]/, "密码至少包含一个大写字母")
    .regex(/[0-9]/, "密码至少包含一个数字")
    .regex(/[^A-Za-z0-9]/, "密码至少包含一个特殊字符"),
});

export async function GET() {
  return NextResponse.json({ ok: true, data: { available: !(await hasAdminCredential()) } });
}

export async function POST(request: Request) {
  try {
    if (await hasAdminCredential()) return NextResponse.json({ ok: false, error: "管理员账号已经设置，请直接登录管理后台" }, { status: 409 });
    const actor = await assertInitialAdminBootstrap();
    const parsed = credentialSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message || "账号或密码格式错误" }, { status: 400 });
    const { account, token } = await setupInitialAdminCredential(actor, parsed.data.username, parsed.data.password);
    const response = NextResponse.json({ ok: true, data: { id: account.id, name: account.name, role: account.role } });
    response.cookies.set(ADMIN_SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 8 * 60 * 60 });
    return response;
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "管理员账号设置失败" }, { status: 400 });
  }
}
