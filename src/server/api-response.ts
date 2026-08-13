import { NextResponse } from "next/server";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : "请求失败";
  return NextResponse.json({ ok: false, error: message }, { status });
}
