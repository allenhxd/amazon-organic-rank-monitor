import { z } from "zod";
import { NextResponse } from "next/server";
import { consumeOtp, SESSION_COOKIE } from "@/server/auth";

export async function POST(request: Request) {
  try {
    const parsed = z.object({ email: z.email(), code: z.string().regex(/^\d{6}$/) }).safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ ok: false, error: "邮箱或验证码格式错误" }, { status: 400 });
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
    const { account, token } = await consumeOtp(parsed.data.email, parsed.data.code, ip);
    const response = NextResponse.json({ ok: true, data: { id: account.id, name: account.name, role: "USER" } });
    response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 30 * 24 * 60 * 60 });
    return response;
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "登录失败" }, { status: 400 }); }
}
