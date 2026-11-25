import assert from "node:assert/strict";
import test from "node:test";
import XLSX from "xlsx";
import { buildReport, expandWatchlist, makeTemplate, readTargets } from "./workbook.mjs";

const read = bytes => XLSX.read(bytes, { type: "buffer" });
const write = book => XLSX.write(book, { type: "buffer", bookType: "xlsx", bookSST: true, compression: true });
const objects = (bytes, name) => XLSX.utils.sheet_to_json(read(bytes).Sheets[name], { defval: null });
const fixture = makeTemplate();
const [item] = readTargets(fixture);
const card = { asin: item.childAsin, sponsored: false, naturalRow: 1, naturalOrdinal: 1, visualRow: 1, visualColumn: 1 };
const evidence = {
  date: "2026-01-15", source: "synthetic", marketplace: "amazon.com", zip: "96038", stopped: false,
  pages: [1, 2, 3].map(page => ({ keyword: item.keyword, page, completed: true, cards: [
    card, { ...card, sponsored: true, visualColumn: 2, naturalRow: null, naturalOrdinal: null },
  ] })),
  details: { [item.childAsin]: { completed: true, price: 10, monthlySales: "50+" } },
  ratings: { [item.childAsin]: { completed: true, rating: 4.5, ratingCount: 20, histogram: { 1: 0 } } },
};

test("legacy watchlist accepts a fifth-row header, reordered columns and a disabled row", () => {
  const book = read(fixture);
  book.Sheets["监控清单"] = XLSX.utils.aoa_to_sheet([["Guide"], ["1"], ["2"], ["3"],
    ["关键词", "类型", "父ASIN（可选）", "子ASIN", "Seller SKU", "类目", "产品简称", "启用", "同父体匹配"],
    ["demo keyword", "自有", "B000PARENT", "B000DEMO01", "sku-demo", "Demo", "Demo", "是", "是"],
    ["disabled", "竞品", "", "B000DEMO02", "", "Demo", "Demo", "否", "否"],
  ]);
  const bytes = write(book);
  const [target, disabled] = readTargets(bytes, { includeDisabled: true });
  assert.equal(target.sameParentMatch, true);
  assert.equal(target.sellerSku, "sku-demo");
  assert.equal(disabled.enabled, false);
  const expanded = expandWatchlist(bytes, [{ ...disabled, enabled: true }, { ...target, keyword: "new term" }]);
  assert.deepEqual(readTargets(expanded).map(x => x.keyword), ["demo keyword", "new term"]);
  const resaved = write(read(expanded));
  const next = expandWatchlist(resaved, [{ ...target, keyword: "another term" }]);
  assert.equal(readTargets(next).length, 3);
});

test("keeps an unrelated original sheet and formula part byte-for-byte", () => {
  const book = read(fixture);
  const legacy = XLSX.utils.aoa_to_sheet([["Earlier history"], [2]]);
  legacy.A2.f = "1+1";
  XLSX.utils.book_append_sheet(book, legacy, "旧历史");
  const bytes = write(book);
  const result = buildReport(bytes, [item], evidence);
  const originalPart = input => Buffer.from(XLSX.CFB.find(XLSX.CFB.read(input, { type: "buffer" }), "/xl/worksheets/sheet2.xml").content);
  assert.deepEqual(originalPart(result), originalPart(bytes));
  assert.equal(read(result).Sheets["旧历史"].A2.f, "1+1");
});

test("preserves effective same-day ranks, price and family rating across Excel rewrites and partial retries", () => {
  const parent = "B000PARENT";
  const target = { ...item, parentAsin: parent, sameParentMatch: true };
  const verified = {
    ...evidence, details: { [item.childAsin]: { ...evidence.details[item.childAsin], verifiedParentAsin: parent, siblingAsins: [item.childAsin] } },
    ratings: { [parent]: evidence.ratings[item.childAsin] },
  };
  const first = buildReport(fixture, [target], verified);
  const rank = objects(first, "CLI排名历史")[0];
  assert.equal(rank["自然状态"], "已完成");
  assert.equal(rank["广告状态"], "已完成");
  assert.equal(rank["自然与广告靠近"], "同排");
  const excelResave = write(read(first));
  const incomplete = { ...verified, pages: [], ratings: {}, details: {}, stopped: true, reason: "captcha" };
  const next = buildReport(excelResave, [target], incomplete);
  assert.deepEqual(objects(next, "CLI排名历史"), [rank]);
  assert.equal(objects(next, "CLI价格历史")[0]["售价（USD）"], 10);
  const family = objects(next, "CLI评分历史").find(row => row["评分主体ASIN"] === parent);
  assert.equal(family["星级"], 4.5);
  assert.equal(family["1星占比(%)"], 0);
  assert.equal(family["5星占比(%)"], null);
  assert.equal(objects(next, "CLI运行审计").at(-1)["原因"], "captcha");
  const newer = buildReport(next, [target], verified, "2026-01-16");
  assert.equal(objects(newer, "CLI排名历史").length, 2);
});

test("refuses incompatible named report sheets and non-OOXML inputs", () => {
  assert.throws(() => readTargets(Buffer.from("not a workbook")), /OOXML/);
  const book = read(fixture);
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Original user notes"]]), "CLI排名历史");
  assert.throws(() => buildReport(write(book), [item], evidence), /表头/);
});

test("replaying the same checkpoint preserves its run ID and page audit count", () => {
  const checkpoint = { ...evidence, runId: "demo-checkpoint" };
  const first = buildReport(fixture, [item], checkpoint);
  const next = buildReport(first, [item], checkpoint);
  assert.deepEqual(objects(next, "CLI运行审计"), objects(first, "CLI运行审计"));
  assert.equal(objects(next, "CLI排名历史")[0]["运行ID"], checkpoint.runId);
});
