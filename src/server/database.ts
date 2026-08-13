import "server-only";

import { Pool, type PoolClient } from "pg";

declare global {
  var __rankMonitorPool: Pool | undefined;
}

export function databasePool() {
  if (!process.env.DATABASE_URL) throw new Error("生产数据模式必须配置 DATABASE_URL");
  globalThis.__rankMonitorPool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
  });
  return globalThis.__rankMonitorPool;
}

export async function transaction<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await databasePool().connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => null);
    throw error;
  } finally {
    client.release();
  }
}
