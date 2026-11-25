const keywordKey = text => text.trim().toLowerCase().replace(/\s+/g, ' ');

// Only a complete prefix can establish the earliest direct hit. A sibling
// can become primary only after all three pages have ruled out a direct hit.
function primary(hits, pages, full, canRuleOut, sponsored) {
  const direct = hits.find(hit => hit.direct);
  const chosen = direct ?? hits[0];
  const proven = chosen && (full || (chosen.direct &&
    Array.from({length: chosen.page - 1}, (_, i) => pages.has(i + 1)).every(Boolean)));
  return proven ? {
    state: '已完成', page: chosen.page, row: sponsored ? chosen.visualRow : chosen.naturalRow,
    column: chosen.visualColumn, asin: chosen.asin, matchType: chosen.direct ? '直接命中' : '同父体命中',
  } : {
    state: full && canRuleOut ? '暂无' : '未完成',
    page: null, row: null, column: null, asin: null, matchType: null,
  };
}

export function rankTarget(target, evidence) {
  const pages = new Map();
  const matchingPages = (evidence.pages ?? []).filter(p => keywordKey(p.keyword) === keywordKey(target.keyword));
  for (const page of matchingPages) {
    if (page.completed !== true || ![1, 2, 3].includes(page.page) || !page.cards?.length) continue;
    if (matchingPages.filter(p => p.page === page.page).length !== 1) continue;
    pages.set(page.page, page);
  }
  const full = pages.size === 3;
  const detail = evidence.details?.[target.childAsin];
  const verified = !!(target.sameParentMatch && target.parentAsin && detail?.completed &&
    detail.verifiedParentAsin === target.parentAsin && detail.siblingAsins?.includes(target.childAsin));
  const eligible = new Set([target.childAsin, ...(verified ? detail.siblingAsins : [])]);
  const hits = [...pages.values()].flatMap(page => page.cards
    .filter(card => eligible.has(card.asin) && (card.sponsored === true ||
      (card.sponsored === false && card.naturalRow > 0)))
    .map(card => ({...card, page: page.page, direct: card.asin === target.childAsin})))
    .sort((a, b) => a.page - b.page || a.visualRow - b.visualRow || a.visualColumn - b.visualColumn);
  const naturalHits = hits.filter(card => !card.sponsored);
  const adHits = hits.filter(card => card.sponsored);
  const canRuleOut = !target.sameParentMatch || verified;
  const organic = primary(naturalHits, pages, full, canRuleOut, false);
  const sponsored = primary(adHits, pages, full, canRuleOut, true);
  let pair = null;
  let bestScore = Infinity;
  for (const natural of naturalHits) {
    for (const ad of adHits) {
      if (natural.page !== ad.page) continue;
      const distance = Math.abs(natural.visualRow - ad.visualRow);
      const score = 2 * distance + Number(natural.asin !== ad.asin);
      if (distance <= 1 && score < bestScore) {
        pair = {page: natural.page, organicRow: natural.visualRow, sponsoredRow: ad.visualRow,
          organicAsin: natural.asin, sponsoredAsin: ad.asin};
        bestScore = score;
      }
    }
  }
  const both = organic.state === '已完成' && sponsored.state === '已完成';
  let overlap = full && canRuleOut ? (both ? '不同排' : '暂无') : '未完成';
  if (pair) overlap = pair.organicRow === pair.sponsoredRow ? '同排' : '邻排';
  return {organic, sponsored, overlap, differentVariants: pair ? pair.organicAsin !== pair.sponsoredAsin : null,
    pair, hits, pagesCompleted: pages.size};
}
