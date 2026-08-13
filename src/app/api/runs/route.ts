import { runRequestSchema } from "@/domain/schemas";
import { fail, ok } from "@/server/api-response";
import { startRun } from "@/server/store";
import { assertUser } from "@/server/auth";

export async function POST(request: Request) {
  try {
    const actor = await assertUser();
    const parsed = runRequestSchema.safeParse(await request.json());
    if (!parsed.success) return fail(parsed.error);
    return ok(await startRun(actor, parsed.data.projectId), { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
