import { NextResponse } from "next/server";
import IORedis from "ioredis";
import { databasePool } from "@/server/database";
import { validateProductionEnvironment } from "@/server/config";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.DATA_MODE !== "postgres") return NextResponse.json({ ok: true, mode: "demo" });
  let redis: IORedis | null = null;
  try {
    validateProductionEnvironment();
    await databasePool().query("SELECT 1");
    if (!process.env.REDIS_URL) throw new Error("REDIS_URL missing");
    redis = new IORedis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 2_000 });
    await redis.connect(); await redis.ping();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  } finally { await redis?.quit().catch(() => null); }
}
