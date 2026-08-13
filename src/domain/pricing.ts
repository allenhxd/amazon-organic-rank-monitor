import type { CollectionDimensions, MonitorItem, RateConfig } from "@/domain/types";

export type PointEstimate = {
  uniqueKeywords: number;
  searchPages: number;
  uniqueAsins: number;
  detailPages: number;
  ratingSubjects: number;
  total: number;
};

const needsDetails = (dimensions: CollectionDimensions) =>
  dimensions.price
  || dimensions.coupon
  || dimensions.monthlySales
  || dimensions.stock
  || dimensions.seller
  || dimensions.rating
  || dimensions.ratingDistribution;

export function estimatePoints(
  items: MonitorItem[],
  scanDepth: 1 | 2 | 3,
  dimensions: CollectionDimensions,
  rate: RateConfig,
): PointEstimate {
  const active = items.filter((item) => item.enabled);
  const keywords = new Set(active.map((item) => item.keyword.trim().toLocaleLowerCase("en-US")));
  const asins = new Set(active.map((item) => item.childAsin));
  const ratingSubjects = new Set(
    active.map((item) => item.parentAsin || item.childAsin),
  );
  const searchPages = dimensions.organicRank ? keywords.size * scanDepth : 0;
  const detailPages = needsDetails(dimensions) ? asins.size : 0;
  const ratingCount = dimensions.rating || dimensions.ratingDistribution
    ? ratingSubjects.size
    : 0;

  return {
    uniqueKeywords: keywords.size,
    searchPages,
    uniqueAsins: asins.size,
    detailPages,
    ratingSubjects: ratingCount,
    total:
      searchPages * rate.searchPage
      + detailPages * rate.detailPage
      + ratingCount * rate.ratingSubject,
  };
}
