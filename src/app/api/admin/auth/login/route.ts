import { NextResponse } from "next/server";
import { z } from "zod";
import { ADMIN_SESSION_COOKIE, authenticateAdmin } from "@/server/auth";

export async function POST(request: Request) {
  try {
    const parsed = z.object({
      username: z.string().trim().min(3).max(64),
      password: z.string().min(12).max(256),
    }).safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ ok: false, error: "请输入正确的管理员账号和密码" }, { status: 400 });
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
    const { account, token } = await authenticateAdmin(parsed.data.username, parsed.data.password, ip);
    const response = NextResponse.json({ ok: true, data: { id: account.id, name: account.name, role: account.role } });
    response.cookies.set(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 8 * 60 * 60,
    });
    return response;
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "管理员登录失败" }, { status: 400 });
  }
}
