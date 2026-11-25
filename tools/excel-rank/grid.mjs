// A row containing four sponsored cards and a single organic card is
// excluded from organic row numbering under the Excel workflow's rule.
export function assignGridPositions(raw) {
  if (!raw.length) throw Error('商品网格为空');
  const rows = [];
  for (const card of [...raw].sort((a, b) => a.y - b.y || a.x - b.x)) {
    if (!/^[A-Z0-9]{10}$/.test(card.asin) || typeof card.sponsored !== 'boolean' ||
        ![card.x, card.y, card.width, card.height].every(Number.isFinite) ||
        card.width <= 0 || card.width > 998 || card.height <= 0) throw Error('商品卡分类或桌面布局未验证');
    let row = rows.at(-1);
    if (!row || Math.abs(card.y - row[0].y) > 22) {
      row = [];
      rows.push(row);
    }
    row.push(card);
  }
  if (raw.length >= 16 && rows.filter(r => r.length >= 4 && r.length <= 6).length < 2)
    throw Error('未验证多列桌面网格');
  let naturalRow = 0;
  let naturalOrdinal = 0;
  return rows.flatMap((row, i) => {
    row.sort((a, b) => a.x - b.x);
    if (row.some((card, j) => j > 0 && card.x < row[j - 1].x + row[j - 1].width - 3))
      throw Error('商品卡坐标重叠');
    const ads = row.filter(c => c.sponsored).length;
    const eligible = ads < row.length && !(row.length === 5 && ads === 4);
    if (eligible) naturalRow++;
    return row.map((card, j) => ({...card, visualRow: i + 1, visualColumn: j + 1,
      naturalRow: eligible && !card.sponsored ? naturalRow : null,
      naturalOrdinal: eligible && !card.sponsored ? ++naturalOrdinal : null}));
  });
}

// This function runs in the page. Return structured position evidence only.
export function readVisibleCards() {
  const cards = [];
  for (const node of document.querySelectorAll('#search .s-main-slot [data-component-type="s-search-result"]')) {
    if (node.closest('.a-carousel-container,[data-component-type="s-video-single-product"],[data-component-type="s-brand-ad"]')) continue;
    const rect = node.getBoundingClientRect();
    if (!rect.width || !rect.height || getComputedStyle(node).visibility !== 'visible') continue;
    const heading = node.querySelector('h2');
    if (!heading?.textContent?.trim()) throw Error('可见商品卡信息不完整');
    const label = (node.innerText || '').split('\n').some(line => /^sponsored$/i.test(line.trim()));
    const accessible = [...node.querySelectorAll('[aria-label]')].some(n =>
      /^sponsored(?:$|\s*[-:–]|\s+ad\b)/i.test(n.getAttribute('aria-label')?.trim() || ''));
    const metadata = /"isSponsored"\s*:\s*true|searchProductType.{0,80}SPONSORED/i.test(node.innerHTML);
    if (metadata && !(label || accessible)) throw Error('广告标记与可见证据不一致');
    cards.push({asin: node.dataset.asin, sponsored: label || accessible,
      classification: label ? 'label' : accessible ? 'aria' : 'product',
      x: Math.round(rect.x), y: Math.round(rect.y + scrollY),
      width: Math.round(rect.width), height: Math.round(rect.height)});
  }
  return cards;
}
