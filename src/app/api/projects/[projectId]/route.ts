import { fail, ok } from "@/server/api-response";
import { getProject, saveProject } from "@/server/store";
import { projectConfigSchema } from "@/domain/schemas";
import type { CollectionDimensions } from "@/domain/types";
import { assertUser } from "@/server/auth";

type Context = { params: Promise<{ projectId: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await assertUser();
    const { projectId } = await context.params;
    const existing = await getProject(actor, projectId);
    if (!existing) return fail(new Error("项目不存在"), 404);
    const body = await request.json();
    const parsed = projectConfigSchema.partial().safeParse(body);
    if (!parsed.success) return fail(parsed.error);
    const dimensions = body.dimensions as Partial<CollectionDimensions> | undefined;
    return ok(await saveProject(actor, {
      ...existing,
      ...parsed.data,
      dimensions: dimensions ? { ...existing.dimensions, ...dimensions } : existing.dimensions,
    }));
  } catch (error) {
    return fail(error);
  }
}
