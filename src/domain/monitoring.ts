import type { RankResult, ResultState } from "@/domain/types";

export function shouldAbortRunOnCaptcha(captchaDetected: boolean) {
  return captchaDetected;
}

export function shouldRetryMonitorAttempt(failedWithCaptcha: boolean) {
  return !failedWithCaptcha;
}

export type SearchCandidate = { asin: string; sponsored: boolean };
export type FamilyMatchEvidence = { verified: boolean; siblingAsins: string[] } | null | undefined;

export function organicCandidates<T extends SearchCandidate>(cards: T[]) {
  return cards.filter((card) => !card.sponsored);
}

export function resolveEligibleDisplayedAsin(targetAsin: string, cards: SearchCandidate[], evidence?: FamilyMatchEvidence) {
  const organic = organicCandidates(cards);
  const direct = organic.find((card) => card.asin === targetAsin);
  if (direct) return { asin: direct.asin, matchType: "直接命中" as const };
  if (!evidence?.verified) return null;
  const siblings = new Set(evidence.siblingAsins);
  const sibling = organic.find((card) => siblings.has(card.asin));
  return sibling ? { asin: sibling.asin, matchType: "同父体命中" as const } : null;
}

export type PageOutcome = {
  pageNumber: number;
  completed: boolean;
  zipVerified: boolean;
  cardsClassified: boolean;
  evidenceCaptured: boolean;
  match?: Omit<RankResult, "id" | "runId" | "projectId" | "monitorItemId" | "category" | "productType" | "childAsin" | "keyword" | "state" | "note" | "observedAt">;
};

export function resolveResultState(
  pages: PageOutcome[],
  requestedDepth: number,
  hasEligibleMatch: boolean,
): ResultState {
  const required = pages.filter((page) => page.pageNumber <= requestedDepth);
  const complete = required.length === requestedDepth
    && required.every((page) =>
      page.completed
      && page.zipVerified
      && page.cardsClassified
      && page.evidenceCaptured
    );

  if (!complete) return "未完成";
  return hasEligibleMatch ? "已完成" : "暂无";
}

export function canReplaceEffectiveResult(previous: RankResult | undefined, next: RankResult) {
  if (!previous) return next.state !== "未完成";
  if (next.state === "未完成") return false;
  return true;
}

export function formatNaturalRank(result: Pick<RankResult, "state" | "naturalPage" | "naturalRow">) {
  if (result.state === "暂无" || result.state === "未完成") return result.state;
  if (!result.naturalPage || !result.naturalRow) return "未完成";
  return `${result.naturalPage}/${result.naturalRow}`;
}
