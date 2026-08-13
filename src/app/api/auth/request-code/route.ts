import { z } from "zod";
import { fail, ok } from "@/server/api-response";
import { issueOtp } from "@/server/auth";

export async function POST(request: Request) {
  try {
    const parsed = z.object({ email: z.email("请输入正确邮箱") }).safeParse(await request.json());
    if (!parsed.success) return fail(parsed.error);
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
    return ok(await issueOtp(parsed.data.email, ip));
  } catch (error) { return fail(error); }
}
