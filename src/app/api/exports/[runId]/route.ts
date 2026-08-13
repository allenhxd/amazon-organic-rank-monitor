import * as XLSX from "xlsx";
import { assertUser } from "@/server/auth";
import { getProject, getRun } from "@/server/store";

type Context = { params: Promise<{ runId: string }> };

export const runtime = "nodejs";

export async function GET(_request: Request, context: Context) {
  const actor = await assertUser();
  const { runId } = await context.params;
  const run = await getRun(actor, runId);
  if (!run) return new Response("任务不存在", { status: 404 });
  if (!run.results.length) return new Response("任务尚未产生可导出结果", { status: 409 });
  const project = await getProject(actor, run.projectId);

  const workbook = XLSX.utils.book_new();
  const receipt = [
    ["字段", "值"],
    ["项目名称", project?.name || run.projectId],
    ["任务ID", run.id],
    ["任务状态", run.status],
    ["创建时间", run.requestedAt],
    ["开始时间", run.startedAt || ""],
    ["完成时间", run.completedAt || ""],
    ["站点", "Amazon.com（美国站）"],
    ["邮编", run.receipt.zipCode],
    ["扫描深度", `${run.receipt.scanDepth} 页`],
    ["排名口径", run.receipt.rankingPolicy],
    ["固定环境", `${run.receipt.viewport} / ${run.receipt.zoom} / DPR ${run.receipt.dpr}`],
    ["会话状态", "未登录、隔离"],
    ["协议版本", run.receipt.protocolVersion],
    ["Worker版本", run.receipt.workerVersion],
    ["计量模式", run.receipt.meteringMode],
    ["费率版本", run.receipt.rateVersion],
    ["预计点数", run.estimatedPoints],
    ["实际消耗", run.consumedPoints],
    ["退回点数", run.refundedPoints],
  ];
  const resultRows = run.results.map((result) => ({
    类目: result.category,
    类型: result.productType,
    子ASIN: result.childAsin,
    关键词: result.keyword,
    自然状态: result.state,
    自然页: result.naturalPage ?? "",
    自然排: result.naturalRow ?? "",
    自然列: result.naturalColumn ?? "",
    自然商品序号: result.naturalOrdinal ?? "",
    实际展示ASIN: result.displayedAsin ?? "",
    命中类型: result.matchType ?? "",
    售价USD: result.priceUsd ?? "",
    Coupon: result.coupon ?? "",
    月销标识: result.monthlySales ?? "",
    库存: result.stock ?? "",
    卖家: result.seller ?? "",
    评分: result.rating ?? "",
    评分总数: result.ratingCount ?? "",
    星级分布: result.ratingDistribution ?? "",
    采集时间: result.observedAt ?? "",
    备注: result.note,
  }));

  const receiptSheet = XLSX.utils.aoa_to_sheet(receipt);
  receiptSheet["!cols"] = [{ wch: 20 }, { wch: 54 }];
  const resultSheet = XLSX.utils.json_to_sheet(resultRows);
  resultSheet["!cols"] = [12, 8, 14, 24, 12, 8, 8, 8, 14, 16, 14, 12, 16, 16, 14, 18, 10, 14, 44, 24, 42].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(workbook, receiptSheet, "运行信息");
  XLSX.utils.book_append_sheet(workbook, resultSheet, "自然排名与详情");
  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx", compression: true });
  const filename = encodeURIComponent(`自然排名监控结果_${run.id}.xlsx`);
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      "Cache-Control": "no-store",
    },
  });
}
