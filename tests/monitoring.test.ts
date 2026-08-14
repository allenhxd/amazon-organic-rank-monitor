import { describe, expect, it } from "vitest";
import { canReplaceEffectiveResult, organicCandidates, resolveEligibleDisplayedAsin, resolveResultState, shouldAbortRunOnCaptcha, shouldRetryMonitorAttempt } from "@/domain/monitoring";
import type { RankResult } from "@/domain/types";

const pages = (completed: boolean[]) => completed.map((value, index) => ({ pageNumber: index + 1, completed: value, zipVerified: value, cardsClassified: value, evidenceCaptured: value }));
const baseResult = (state: RankResult["state"]): RankResult => ({ id: "x", runId: "r", projectId: "p", monitorItemId: "m", category: "c", productType: "自有", childAsin: "B000DEMO01", displayedAsin: null, keyword: "k", state, naturalPage: null, naturalRow: null, naturalColumn: null, naturalOrdinal: null, matchType: null, priceAmount: null, currency: "USD", coupon: null, monthlySales: null, stock: null, seller: null, rating: null, ratingCount: null, ratingDistribution: null, note: "", observedAt: null });

describe("结果状态", () => {
  it("全部要求页面完成且无匹配才是暂无", () => expect(resolveResultState(pages([true, true, true]), 3, false)).toBe("暂无"));
  it("任意页面失败都必须是未完成", () => expect(resolveResultState(pages([true, false, true]), 3, false)).toBe("未完成"));
  it("完整页面且有匹配时为已完成", () => expect(resolveResultState(pages([true, true]), 2, true)).toBe("已完成"));
  it("失败结果不能覆盖当天有效结果", () => expect(canReplaceEffectiveResult(baseResult("已完成"), baseResult("未完成"))).toBe(false));
  it("CAPTCHA 一经发现就停止整次运行", () => {
    expect(shouldAbortRunOnCaptcha(true)).toBe(true);
    expect(shouldAbortRunOnCaptcha(false)).toBe(false);
    expect(shouldRetryMonitorAttempt(true)).toBe(false);
    expect(shouldRetryMonitorAttempt(false)).toBe(true);
  });

  it("Sponsored 只用于排除，不参与自然命中", () => {
    const cards = [{ asin: "B000DEMO01", sponsored: true }, { asin: "B000DEMO02", sponsored: false }];
    expect(organicCandidates(cards).map((card) => card.asin)).toEqual(["B000DEMO02"]);
    expect(resolveEligibleDisplayedAsin("B000DEMO01", cards)).toBeNull();
  });

  it("同父体只在证据已验证时扩展匹配", () => {
    const cards = [{ asin: "B000DEMO02", sponsored: false }];
    expect(resolveEligibleDisplayedAsin("B000DEMO01", cards, { verified: false, siblingAsins: ["B000DEMO02"] })).toBeNull();
    expect(resolveEligibleDisplayedAsin("B000DEMO01", cards, { verified: true, siblingAsins: ["B000DEMO02"] }))
      .toEqual({ asin: "B000DEMO02", matchType: "同父体命中" });
  });
});
