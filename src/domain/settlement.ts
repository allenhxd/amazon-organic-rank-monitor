import type { RateConfig } from "@/domain/types";

export type SuccessfulRequests = {
  searchPages: number;
  detailPages: number;
  ratingSubjects: number;
};

export function calculateSettlement(frozenPoints: number, requests: SuccessfulRequests, rate: RateConfig) {
  const rawConsumed = requests.searchPages * rate.searchPage
    + requests.detailPages * rate.detailPage
    + requests.ratingSubjects * rate.ratingSubject;
  const consumedPoints = Math.max(0, Math.min(frozenPoints, rawConsumed));
  return { consumedPoints, refundedPoints: Math.max(0, frozenPoints - consumedPoints) };
}
