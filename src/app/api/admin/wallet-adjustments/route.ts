import { walletAdjustmentSchema } from "@/domain/schemas";
import { fail, ok } from "@/server/api-response";
import { adjustWallet } from "@/server/store";
import { assertAdmin } from "@/server/auth";

export async function POST(request: Request) {
  try {
    const actor = await assertAdmin();
    const parsed = walletAdjustmentSchema.safeParse(await request.json());
    if (!parsed.success) return fail(parsed.error);
    return ok(await adjustWallet(actor, parsed.data.userId, parsed.data.amount, parsed.data.reason));
  } catch (error) {
    return fail(error);
  }
}
