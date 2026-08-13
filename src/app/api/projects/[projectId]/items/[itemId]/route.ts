import { fail, ok } from "@/server/api-response";
import { removeProjectItem } from "@/server/store";
import { assertUser } from "@/server/auth";

type Context = { params: Promise<{ projectId: string; itemId: string }> };

export async function DELETE(_request: Request, context: Context) {
  try {
    const actor = await assertUser();
    const { projectId, itemId } = await context.params;
    return ok(await removeProjectItem(actor, projectId, itemId));
  } catch (error) {
    return fail(error);
  }
}
