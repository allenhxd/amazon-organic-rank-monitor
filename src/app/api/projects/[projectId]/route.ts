import { fail, ok } from "@/server/api-response";
import { getProject, saveProject } from "@/server/store";
import { projectConfigSchema } from "@/domain/schemas";
import { enabledMarketplaces } from "@/domain/marketplaces";
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
    const parsed = projectConfigSchema.safeParse({
      name: body.name ?? existing.name,
      marketplace: body.marketplace ?? existing.marketplace,
      zipCode: body.zipCode ?? existing.zipCode,
      scanDepth: body.scanDepth ?? existing.scanDepth,
    });
    if (!parsed.success) return fail(parsed.error);
    if (!enabledMarketplaces().includes(parsed.data.marketplace)) return fail(new Error("所选站点尚未完成真实回归，当前实例未开放"));
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
