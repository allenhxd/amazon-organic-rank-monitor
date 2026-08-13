import { cancelRun, getRun } from "@/server/store";
import { fail, ok } from "@/server/api-response";
import { assertUser } from "@/server/auth";

type Context = { params: Promise<{ runId: string }> };

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: Context) {
  const actor = await assertUser();
  const { runId } = await context.params;
  const run = await getRun(actor, runId);
  return run ? ok(run) : fail(new Error("任务不存在"), 404);
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const actor = await assertUser();
    const { runId } = await context.params;
    return ok(await cancelRun(actor, runId));
  } catch (error) {
    return fail(error);
  }
}
