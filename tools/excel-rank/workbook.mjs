import { randomUUID } from "node:crypto";
import XLSX from "xlsx";
import { rankTarget } from "./ranking.mjs";
import { checkPackage, withTables } from "./workbook-package.mjs";
import { analysisTables } from "./analytics.mjs";

const watch = "监控清单";
const extra = "CLI补充清单";
const inputHeaders = ["启用", "类目", "类型", "子ASIN", "父ASIN（可选）", "产品简称", "关键词", "同父体匹配", "SKU名称", "Seller SKU"];
const required = ["启用", "类目", "类型", "子ASIN", "产品简称", "关键词"];
const text = value => String(value ?? "").trim();
const norm = keyword => text(keyword).toLowerCase().replace(/\s+/g, " ");
const targetKey = row => JSON.stringify([row.childAsin, norm(row.keyword)]);
const validAsin = /^[A-Z0-9]{10}$/;

export function makeTemplate() {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([inputHeaders,
    ["是", "示例", "自有", "B000DEMO01", "", "示例商品", "demo keyword", "否", "", ""],
  ]);
  sheet["!cols"] = inputHeaders.map(() => ({ wch: 19 }));
  XLSX.utils.book_append_sheet(book, sheet, watch);
  return XLSX.write(book, { type: "buffer", bookType: "xlsx", compression: true });
}

function load(bytes, sheets) {
  return XLSX.read(checkPackage(bytes), { type: "buffer", sheets, cellHTML: false, cellStyles: false });
}

function rowsOf(sheet, maxRows) {
  if (!sheet?.["!ref"]) return [];
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  if (range.e.r - range.s.r + 1 > maxRows || range.e.c > 255) throw new Error("工作表行列数超出读取限制");
  return XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: null });
}

function flag(value, label) {
  const token = text(value).toLowerCase();
  if (["1", "是", "启用", "yes", "true", "y"].includes(token)) return true;
  if (["", "0", "否", "停用", "禁用", "no", "false", "n"].includes(token)) return false;
  throw new Error(label + " 应填写“是”或“否”");
}

function parseWatch(sheet) {
  const rows = rowsOf(sheet, 10_040);
  const start = rows.slice(0, 40).findIndex(row => required.every(header => row.some(cell => text(cell) === header)));
  if (start < 0) throw new Error("监控清单缺少表头，需要 " + required.join("、"));
  if (rows.length - start - 1 > 10_000) throw new Error("监控清单最多 10,000 行");
  const headings = rows[start].map(text);
  const result = [];
  for (const row of rows.slice(start + 1)) {
    const get = (...names) => text(row[headings.findIndex(heading => names.includes(heading))]);
    const childAsin = get("子ASIN").toUpperCase();
    const keyword = get("关键词");
    if (!childAsin && !keyword && !get("启用")) continue;
    const enabled = flag(get("启用"), "启用");
    if (!enabled && (!childAsin || !keyword)) continue;
    const parentAsin = get("父ASIN（可选）", "父ASIN", "父ASIN(可选)").toUpperCase();
    const type = get("类型");
    const name = get("产品简称");
    const category = get("类目");
    if (!validAsin.test(childAsin) || (parentAsin && !validAsin.test(parentAsin)) || !keyword || !category || !name || !["自有", "竞品"].includes(type)) {
      throw new Error("监控清单存在无效 ASIN、关键词、类目、类型或产品简称");
    }
    result.push({ enabled, childAsin, keyword, parentAsin: parentAsin || null,
      sameParentMatch: flag(get("同父体匹配"), "同父体匹配"), category, type, name,
      skuName: get("SKU名称"), sellerSku: type === "自有" ? get("Seller SKU") : "" });
  }
  return result;
}

export function readTargets(bytes, { includeDisabled = false } = {}) {
  const book = load(bytes, [watch, extra]);
  if (!book.Sheets[watch]) throw new Error("未找到“监控清单”");
  const unique = new Map();
  for (const name of [watch, extra]) {
    if (!book.Sheets[name]) continue;
    for (const target of parseWatch(book.Sheets[name])) {
      if (!unique.has(targetKey(target))) unique.set(targetKey(target), target);
    }
  }
  if (unique.size > 10_000) throw new Error("监控组合总数超过 10,000");
  return [...unique.values()].filter(target => includeDisabled || target.enabled);
}

function watchRow(target) {
  return [target.enabled === false ? "否" : "是", target.category, target.type, target.childAsin, target.parentAsin,
    target.name, target.keyword, target.sameParentMatch ? "是" : "否", target.skuName, target.type === "自有" ? target.sellerSku : ""];
}

export function expandWatchlist(bytes, extraTargets) {
  const existing = readTargets(bytes, { includeDisabled: true });
  const known = new Set(existing.map(targetKey));
  const book = load(bytes, [extra]);
  const rows = [inputHeaders, ...(book.Sheets[extra] ? parseWatch(book.Sheets[extra]).map(watchRow) : [])];
  let changed = false;
  for (const target of extraTargets) {
    const key = targetKey(target);
    if (known.has(key)) continue;
    known.add(key);
    rows.push(watchRow(target));
    changed = true;
  }
  if (!changed) return Buffer.from(bytes);
  const result = withTables(bytes, book.SheetNames, [{ name: extra, slug: "targets", rows }]);
  readTargets(result, { includeDisabled: true });
  return result;
}

const tables = {
  rank: { name: "CLI排名历史", headers: ["监测日期", "子ASIN", "关键词", "类目", "类型", "产品简称", "Seller SKU",
    "自然状态", "自然页", "自然排", "自然列", "自然展示ASIN", "广告状态", "广告页", "广告视觉排", "广告列", "广告展示ASIN", "自然与广告靠近", "不同变体", "运行ID",
    "自然命中类型", "广告命中类型", "靠近证据页", "靠近自然视觉排", "靠近广告视觉排", "靠近自然展示ASIN", "靠近广告展示ASIN", "完成搜索页数"] },
  price: { name: "CLI价格历史", headers: ["监测日期", "子ASIN", "采集状态", "售价（USD）", "Coupon", "月销标识", "库存", "卖家", "运行ID"] },
  rating: { name: "CLI评分历史", headers: ["监测日期", "评分主体ASIN", "采集状态", "星级", "评分总数", "5星占比(%)", "4星占比(%)", "3星占比(%)", "2星占比(%)", "1星占比(%)", "运行ID"] },
  audit: { name: "CLI运行审计", headers: ["监测日期", "运行ID", "站点", "邮编", "关键词", "请求页", "状态", "可见商品卡", "原因", "来源"] },
};
const reportNames = Object.values(tables).map(table => table.name);

function history(book, table) {
  const rows = rowsOf(book.Sheets[table.name], 150_001);
  if (!rows.length) return [];
  if (JSON.stringify(rows[0]) !== JSON.stringify(table.headers)) throw new Error(table.name + " 表头无法识别");
  return rows.slice(1);
}

function effectiveRows(old, fresh, keyOf, accept) {
  const index = new Map(old.map(row => [keyOf(row), row]));
  for (const row of fresh) {
    const key = keyOf(row);
    if (!index.has(key) || accept(index.get(key), row)) index.set(key, row);
  }
  return [...index.values()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
}

export function buildReport(bytes, targets, evidence, date = evidence.date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
    throw new Error("监测日期应为 YYYY-MM-DD");
  }
  const book = load(bytes, reportNames);
  const runId = text(evidence.runId) || randomUUID();
  const rank = [], price = [], rating = [];
  const asins = new Set(), subjects = new Set();
  for (const target of targets) {
    const { organic, sponsored, overlap, differentVariants, pair, pagesCompleted } = rankTarget(target, evidence);
    rank.push([date, target.childAsin, target.keyword, target.category, target.type, target.name, target.sellerSku,
      organic.state, organic.page, organic.row, organic.column, organic.asin, sponsored.state, sponsored.page, sponsored.row,
      sponsored.column, sponsored.asin, overlap, differentVariants == null ? null : differentVariants ? "是" : "否", runId,
      organic.matchType, sponsored.matchType, pair?.page, pair?.organicRow, pair?.sponsoredRow, pair?.organicAsin, pair?.sponsoredAsin, pagesCompleted]);
    const detail = evidence.details?.[target.childAsin];
    if (!asins.has(target.childAsin)) {
      asins.add(target.childAsin);
      const value = detail?.completed ? detail : {};
      price.push([date, target.childAsin, detail?.completed ? "已完成" : "未完成", value.price, value.coupon, value.monthlySales, value.stock, value.seller, runId]);
    }
    const verifiedFamily = target.parentAsin && detail?.completed && detail.verifiedParentAsin === target.parentAsin &&
      detail.siblingAsins?.includes(target.childAsin);
    const subject = verifiedFamily ? target.parentAsin : target.childAsin;
    if (!subjects.has(subject)) {
      subjects.add(subject);
      const reading = evidence.ratings?.[subject];
      const value = reading?.completed ? reading : {};
      rating.push([date, subject, reading?.completed ? "已完成" : "未完成", value.rating, value.ratingCount,
        ...[5, 4, 3, 2, 1].map(star => value.histogram?.[star]), runId]);
    }
  }
  const source = evidence.source === "synthetic" ? "合成示例" : "输入证据";
  const audit = [[date, runId, evidence.marketplace, evidence.zip, null, null, evidence.stopped ? "已停止" : "批次结束", null, evidence.reason ?? null, source]];
  for (const page of evidence.pages || []) audit.push([date, runId, evidence.marketplace, evidence.zip, page.keyword, page.page,
    page.completed ? "已完成" : "未完成", page.completed ? page.cards.length : null, page.reason ?? null, source]);
  const key = row => JSON.stringify(row.slice(0, 2));
  const keepObservation = (previous, next) => previous[2] !== "已完成" || (!evidence.stopped && next[2] === "已完成");
  const keepRank = (previous, next) => [7, 12, 17].every(i =>
    previous[i] === "未完成" || (!evidence.stopped && next[i] !== "未完成"));
  const results = {
    rank: effectiveRows(history(book, tables.rank), rank, row => JSON.stringify([row[0], row[1], norm(row[2])]), keepRank),
    price: effectiveRows(history(book, tables.price), price, key, keepObservation),
    rating: effectiveRows(history(book, tables.rating), rating, key, keepObservation),
    audit: [...history(book, tables.audit).filter(row => row[0] !== date || row[1] !== runId), ...audit],
  };
  const historyTables = Object.entries(tables).map(([slug, table]) => ({
    name: table.name, slug, rows: [table.headers, ...results[slug]],
  }));
  return withTables(bytes, book.SheetNames, [...historyTables, ...analysisTables(results)]);
}
