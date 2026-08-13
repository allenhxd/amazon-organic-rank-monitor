import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, SESSION_COOKIE } from "@/domain/constants";

const publicPaths = ["/", "/welcome", "/guide", "/login", "/admin/login", "/api/health", "/api/auth", "/api/admin/auth"];

export function proxy(request: NextRequest) {
  if (process.env.AUTH_MODE !== "production") return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const expectedOrigin = process.env.APP_ORIGIN;
    if (!expectedOrigin || request.headers.get("origin") !== expectedOrigin) {
      return NextResponse.json({ ok: false, error: "请求来源校验失败" }, { status: 403 });
    }
  }
  if (publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return NextResponse.next();
  const isAdminSetup = pathname === "/admin/setup" || pathname === "/api/admin/setup";
  if (isAdminSetup) {
    if (request.cookies.has(SESSION_COOKIE) || request.cookies.has(ADMIN_SESSION_COOKIE)) return NextResponse.next();
    if (pathname.startsWith("/api/")) return NextResponse.json({ ok: false, error: "请先通过初始管理员邮箱确认身份" }, { status: 401 });
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname)}`, request.url));
  }
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin/");
  if (isAdminRoute && !request.cookies.has(ADMIN_SESSION_COOKIE)) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ ok: false, error: "请使用管理员账号登录" }, { status: 401 });
    return NextResponse.redirect(new URL(`/admin/login?next=${encodeURIComponent(pathname)}`, request.url));
  }
  if (!request.cookies.has(SESSION_COOKIE) && !request.cookies.has(ADMIN_SESSION_COOKIE)) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname)}`, request.url));
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|xlsx)$).*)"] };
