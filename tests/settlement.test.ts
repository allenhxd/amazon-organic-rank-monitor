import { describe, expect, it } from "vitest";
import { calculateSettlement } from "@/domain/settlement";
import { billableEstimate, resolveMeteringMode, settleMetering } from "@/domain/metering";

const rate = { version: "rate-v1", searchPage: 1, detailPage: 2, ratingSubject: 3, effectiveAt: "2026-08-10" };

describe("任务结算", () => {
  it("只按成功请求消耗并退回未执行点数", () => {
    expect(calculateSettlement(20, { searchPages: 4, detailPages: 2, ratingSubjects: 1 }, rate))
      .toEqual({ consumedPoints: 11, refundedPoints: 9 });
  });

  it("失败且没有成功请求时全额退回", () => {
    expect(calculateSettlement(20, { searchPages: 0, detailPages: 0, ratingSubjects: 0 }, rate))
      .toEqual({ consumedPoints: 0, refundedPoints: 20 });
  });

  it("实际消耗绝不超过已冻结点数", () => {
    expect(calculateSettlement(5, { searchPages: 99, detailPages: 99, ratingSubjects: 99 }, rate))
      .toEqual({ consumedPoints: 5, refundedPoints: 0 });
  });

  it("默认关闭计量时不冻结、不扣除且不退款", () => {
    expect(resolveMeteringMode(undefined)).toBe("disabled");
    expect(billableEstimate(20, "disabled")).toBe(0);
    expect(settleMetering(0, { searchPages: 4, detailPages: 2, ratingSubjects: 1 }, rate, "disabled"))
      .toEqual({ consumedPoints: 0, refundedPoints: 0 });
  });

  it("wallet 模式保留冻结、幂等结算所需数值", () => {
    expect(resolveMeteringMode("wallet")).toBe("wallet");
    expect(billableEstimate(20, "wallet")).toBe(20);
    expect(settleMetering(20, { searchPages: 4, detailPages: 2, ratingSubjects: 1 }, rate, "wallet"))
      .toEqual({ consumedPoints: 11, refundedPoints: 9 });
  });

  it("trial 模式保留内部标识但不冻结或扣除额度", () => {
    expect(resolveMeteringMode("trial")).toBe("trial");
    expect(billableEstimate(20, "trial")).toBe(0);
    expect(settleMetering(0, { searchPages: 1, detailPages: 1, ratingSubjects: 1 }, rate, "trial"))
      .toEqual({ consumedPoints: 0, refundedPoints: 0 });
  });
});
