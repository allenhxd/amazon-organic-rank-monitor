import { z } from "zod";

export const asinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{10}$/, "ASIN 必须是 10 位字母或数字");

export const zipCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{5}$/, "请输入 5 位美国邮编");

export const monitorItemInputSchema = z.object({
  category: z.string().trim().min(1, "类目不能为空").transform((value) => value === "仿粘帽" ? "仿毡帽" : value),
  productType: z.enum(["自有", "竞品"]),
  childAsin: asinSchema,
  parentAsin: z.union([asinSchema, z.literal(""), z.null()]).optional().transform((value) => value || null),
  productName: z.string().trim().min(1, "产品简称不能为空"),
  keyword: z.string().trim().min(1, "关键词不能为空"),
  sameParentMatch: z.boolean().default(false),
  notes: z.string().trim().max(500).default(""),
});

export const projectConfigSchema = z.object({
  name: z.string().trim().min(1).max(80),
  zipCode: zipCodeSchema,
  scanDepth: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

export const walletAdjustmentSchema = z.object({
  userId: z.string().min(1),
  amount: z.number().int().refine((value) => value !== 0, "调整点数不能为 0"),
  reason: z.string().trim().min(2).max(200),
});

export const runRequestSchema = z.object({
  projectId: z.string().min(1),
});
