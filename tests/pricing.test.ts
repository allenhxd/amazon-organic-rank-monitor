import { describe, expect, it } from "vitest";
import { estimatePoints } from "@/domain/pricing";
import type { MonitorItem } from "@/domain/types";

const item = (id: string, asin: string, keyword: string, parentAsin: string | null = null): MonitorItem => ({
  id, projectId: "project", enabled: true, category: "测试", productType: "自有", childAsin: asin,
  parentAsin, productName: id, keyword, sameParentMatch: Boolean(parentAsin), notes: "",
});

describe("点数估算", () => {
  it("按唯一关键词页、唯一 ASIN 详情与评分主体相加", () => {
    const items = [
      item("a", "B000DEMO01", "demo keyword one", "B000PARENT"),
      item("b", "B000DEMO01", "demo keyword two", "B000PARENT"),
      item("c", "B000DEMO02", "demo keyword one"),
    ];
    const result = estimatePoints(items, 3, {
      organicRank: true, sameParentMatch: true, price: true, coupon: false, monthlySales: false,
      stock: false, seller: false, rating: true, ratingDistribution: true,
    }, { version: "v1", searchPage: 1, detailPage: 1, ratingSubject: 1, effectiveAt: "2026-08-09" });
    expect(result).toEqual({ uniqueKeywords: 2, searchPages: 6, uniqueAsins: 2, detailPages: 2, ratingSubjects: 2, total: 10 });
  });

  it("未选择详情维度时不收详情点数", () => {
    const result = estimatePoints([item("a", "B000DEMO01", "keyword")], 1, {
      organicRank: true, sameParentMatch: false, price: false, coupon: false, monthlySales: false,
      stock: false, seller: false, rating: false, ratingDistribution: false,
    }, { version: "v1", searchPage: 2, detailPage: 9, ratingSubject: 9, effectiveAt: "2026-08-09" });
    expect(result.total).toBe(2);
  });
});
