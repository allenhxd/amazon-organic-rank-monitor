import { getSnapshot } from "@/server/store";
import { ok } from "@/server/api-response";
import { assertUser } from "@/server/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await assertUser();
  return ok(await getSnapshot(actor));
}
