import { z } from "zod";
import { monitorItemInputSchema } from "@/domain/schemas";
import { fail, ok } from "@/server/api-response";
import { importProjectItems } from "@/server/store";
import { assertUser } from "@/server/auth";

const schema = z.object({
  projectId: z.string().min(1),
  mode: z.enum(["append", "replace"]),
  rows: z.array(monitorItemInputSchema).max(10_000),
});

export async function POST(request: Request) {
  try {
    const actor = await assertUser();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return fail(parsed.error);
    return ok(await importProjectItems(actor, parsed.data.projectId, parsed.data.rows, parsed.data.mode));
  } catch (error) {
    return fail(error);
  }
}
