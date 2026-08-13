import { fail, ok } from "@/server/api-response";
import { parseImportWorkbook } from "@/server/imports";
import { assertUser } from "@/server/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await assertUser();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail(new Error("请选择 Excel 文件"));
    if (file.size === 0) return fail(new Error("文件不能为空"));
    if (file.size > 5 * 1024 * 1024) return fail(new Error("文件不能超过 5MB"));
    if (!file.name.toLocaleLowerCase("en-US").endsWith(".xlsx")) return fail(new Error("仅支持 .xlsx 文件"));
    return ok(parseImportWorkbook(await file.arrayBuffer()));
  } catch (error) {
    return fail(error);
  }
}
