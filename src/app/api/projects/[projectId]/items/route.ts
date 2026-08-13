import { monitorItemInputSchema } from "@/domain/schemas";
import { fail, ok } from "@/server/api-response";
import { addProjectItem } from "@/server/store";
import { assertUser } from "@/server/auth";

type Context = { params: Promise<{ projectId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const actor = await assertUser();
    const { projectId } = await context.params;
    const parsed = monitorItemInputSchema.safeParse(await request.json());
    if (!parsed.success) return fail(parsed.error);
    return ok(await addProjectItem(actor, projectId, parsed.data), { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
