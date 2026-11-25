import {randomUUID} from 'node:crypto';
import {assignGridPositions, readVisibleCards} from './grid.mjs';

const origin = 'https://www.amazon.com';
const zip = '96038';
const asinPattern = /^[A-Z0-9]{10}$/;
const blockedText = /captcha|robot check|check the box to continue|enter the characters you see below|sorry, we just need to make sure you're not a robot/i;
const locationSelector = '#nav-global-location-popover-link';
export class SiteStop extends Error {}

export function collect(targets) {
  return collectWithSession(targets, openSession);
}

// Also used by offline tests. A session handles only a single, isolated batch.
export async function collectWithSession(targets, open) {
  if (!Array.isArray(targets) || !targets.length) throw Error('监控清单为空');
  if (targets.some(t => !asinPattern.test(t.childAsin) || (t.parentAsin && !asinPattern.test(t.parentAsin)) ||
    typeof t.keyword !== 'string' || !t.keyword.trim())) throw Error('监控目标格式无效');
  const evidence = {runId: randomUUID(), date: new Date().toLocaleDateString('sv-SE', {timeZone: 'Asia/Shanghai'}),
    marketplace: 'amazon.com', zip, viewport: [1920,1080], isolated: true,
    pages: [], details: {}, ratings: {}, stopped: false, reason: null};
  const keywords = new Map();
  for (const target of targets) keywords.set(target.keyword.trim().toLowerCase().replace(/\s+/g, ' '), target.keyword.trim());
  const session = await open();
  async function observe(read) {
    try { return await read(); }
    catch (error) {
      if (error instanceof SiteStop) throw error;
      return {completed: false, reason: error.message};
    }
  }
  try {
    await session.initialize();
    for (const keyword of keywords.values()) {
      for (let page = 1; page <= 3; page++) {
        const observed = await observe(() => session.search(keyword, page));
        evidence.pages.push({keyword, page, cards: [], ...observed});
      }
    }
    const children = [...new Set(targets.map(t => t.childAsin))];
    for (const child of children) evidence.details[child] = await observe(() => session.detail(child));
    const subjects = new Map();
    for (const target of targets) {
      const detail = evidence.details[target.childAsin];
      const parentVerified = target.parentAsin && detail.completed && detail.verifiedParentAsin === target.parentAsin &&
        detail.siblingAsins?.includes(target.childAsin);
      const key = parentVerified ? target.parentAsin : target.childAsin;
      const representative = subjects.get(key);
      if (!representative || representative > target.childAsin) subjects.set(key, target.childAsin);
    }
    for (const [subject, child] of subjects) {
      let rating = await observe(() => session.rating(subject, child, subject));
      if (!rating.completed && subject !== child) rating = await observe(() => session.rating(child, child, subject));
      evidence.ratings[subject] = rating;
    }
  } catch (error) {
    evidence.stopped = true;
    evidence.reason = error.message;
  } finally {
    await session.close();
  }
  return evidence;
}

function extractProduct() {
  const text = selector => document.querySelector(selector)?.textContent?.trim().replace(/\s+/g, ' ') || null;
  const asin = document.querySelector('#ASIN')?.value || document.querySelector('link[rel=canonical]')?.href?.match(/\/dp\/([A-Z0-9]{10})/)?.[1];
  const title = text('#productTitle');
  const priceText = text('#corePrice_feature_div .priceToPay .a-offscreen') || text('#corePrice_feature_div .a-price .a-offscreen');
  const priceMatch = priceText?.match(/^\$([\d,]+(?:\.\d{2})?)$/);
  const stars = text('#acrPopover .a-icon-alt') || document.querySelector('#acrPopover')?.title || '';
  const score = stars.match(/^([0-5](?:\.\d+)?) out of 5/i);
  const count = text('#acrCustomerReviewText')?.match(/^([\d,]+)\s+(?:global\s+)?ratings?\b/i);
  const histogram = Object.fromEntries([5,4,3,2,1].map(star => [star, null]));
  for (const row of document.querySelectorAll('#histogramTable tr, #histogramTable a[aria-label]')) {
    const label = row.getAttribute('aria-label') || row.innerText || '';
    const star = label.match(/\b([1-5])\s*stars?\b/i);
    const share = label.match(/\b(\d{1,3})%/);
    if (star && share && Number(share[1]) <= 100) histogram[star[1]] = Number(share[1]);
  }
  const familyNodes = document.querySelectorAll('#twister [data-asin], #twister [data-defaultasin], [id^="variation_"] [data-asin], [id^="variation_"] [data-defaultasin], [id^="inline-twister"] [data-asin]');
  const siblingAsins = new Set([asin]);
  for (const n of familyNodes) for (const id of [n.dataset.asin, n.dataset.defaultasin])
    if (/^[A-Z0-9]{10}$/.test(id || '')) siblingAsins.add(id);
  const parents = new Set();
  for (const script of document.scripts) {
    const content = script.textContent || '';
    if (!/variationValues|dimensionValuesDisplayData|twister/i.test(content)) continue;
    for (const match of content.matchAll(/["']parentAsin["']\s*:\s*["']([A-Z0-9]{10})["']/g)) parents.add(match[1]);
  }
  const verifiedParentAsin = parents.size === 1 ? [...parents][0] : null;
  const sales = document.body.innerText.match(/\b[\d,.]+[KM]?\+?\s+bought in past month\b/i);
  return {asin, title, verifiedParentAsin, siblingAsins: verifiedParentAsin ? [...siblingAsins] : [],
    price: priceMatch ? Number(priceMatch[1].replaceAll(',', '')) : null,
    coupon: text('#couponTextpctch, [id^="couponText"]'), stock: text('#availability'),
    monthlySales: sales?.[0] || null, seller: text('#sellerProfileTriggerId, #merchant-info'),
    rating: score ? Number(score[1]) : null, ratingCount: count ? Number(count[1].replaceAll(',', '')) : null, histogram};
}

export async function openSession({browser: provided, configureContext} = {}) {
  const {chromium} = await import('playwright');
  const browser = provided ?? await chromium.launch();
  let page;
  try {
    const context = await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,
      locale:'en-US',timezoneId:'America/Los_Angeles',serviceWorkers:'block'});
    if (configureContext) await configureContext(context);
    page = await context.newPage();
  } catch (error) { await browser.close(); throw error; }
  page.setDefaultTimeout(8_000);
  let stop = null;
  function ensureOpen() { if (stop) throw new SiteStop(stop); }
  page.on('response', response => {
    const req = response.request();
    if (!req.isNavigationRequest() || req.frame() !== page.mainFrame()) return;
    const headers = response.headers();
    if ([403,429,503].includes(response.status()) || headers['retry-after'] !== undefined ||
        /captcha|challenge/i.test(headers['x-amzn-waf-action'] || '')) stop = '站点限制访问，整批停止';
  });
  await page.route('**/*', async route => {
    const req = route.request();
    if (req.isNavigationRequest() && req.frame() === page.mainFrame()) {
      const u = new URL(req.url());
      if (u.origin !== origin || /\/sspa\/click|\/gp\/slredirect|\/gp\/aw\/click|\/ap\/signin|validateCaptcha|\/captcha\//i.test(u.pathname))
        stop = '非预期导航，整批停止';
    }
    if (stop) return route.abort();
    return route.fallback();
  });
  async function guard() {
    ensureOpen();
    if (blockedText.test(await page.locator('body').innerText()) ||
        await page.locator('form[action*="validateCaptcha"], #captchacharacters').count()) {
      stop = '检测到验证码，整批停止';
      throw new SiteStop(stop);
    }
  }
  async function navigate(url) {
    ensureOpen();
    if (page.url() !== 'about:blank') await guard();
    let response;
    try { response = await page.goto(url, {waitUntil:'domcontentloaded', timeout:40_000}); }
    catch (error) { ensureOpen(); throw error; }
    await guard();
    if (!response || response.status() !== 200) throw Error('页面未正常加载');
  }
  async function verifyEnvironment() {
    await guard();
    const signedOut = await page.locator('#nav-link-accountList-nav-line-1').textContent();
    if (!/hello,\s*sign in/i.test(signedOut ?? '')) throw new SiteStop('未验证退出登录状态');
    if (!/\b96038\b/.test(await page.locator(locationSelector).innerText())) throw new SiteStop('未验证配送邮编');
  }
  async function guarded(read) {
    try { return await read(); }
    catch (error) {
      // A page waiting for its grid/title may have become a challenge.
      // Inspect it before the caller schedules another monitored request.
      await guard();
      throw error;
    }
  }
  async function initialize() {
    await navigate(origin);
    const location = page.locator(locationSelector);
    if (!/\b96038\b/.test(await location.innerText())) {
      await location.click();
      await guard();
      await page.locator('#GLUXZipUpdateInput').fill(zip);
      await page.locator('#GLUXZipUpdate input[type=submit]').click();
      await guard();
      const done = page.locator('#GLUXConfirmClose, button[name=glowDoneButton]').filter({visible:true}).first();
      if (await done.isVisible()) await done.click();
      await guard();
      await navigate(origin);
    }
    await verifyEnvironment();
  }
  async function search(keyword, number) {
    const url = new URL('/s', origin);
    url.searchParams.set('k',keyword);
    url.searchParams.set('page',String(number));
    await navigate(url.href);
    await verifyEnvironment();
    await page.locator('#search .s-main-slot h2').first().waitFor({state:'visible'});
    const selected = await page.locator('.s-pagination-selected, .a-pagination .a-selected').first().textContent();
    const actual = new URL(page.url());
    if (actual.origin !== origin || actual.pathname !== '/s' || actual.searchParams.get('k') !== keyword ||
        selected?.trim() !== String(number)) throw Error('搜索词或实际页码未验证');
    const cards = await page.evaluate(readVisibleCards);
    await page.waitForTimeout(750);
    await guard();
    const stable = await page.evaluate(readVisibleCards);
    if (JSON.stringify(stable) !== JSON.stringify(cards)) throw Error('商品网格位置未稳定');
    const evidence = assignGridPositions(stable);
    return {completed:true, url:actual.href, zip, observedAt:new Date().toISOString(), cards:evidence};
  }
  async function product(asin) {
    await navigate(origin + '/dp/' + asin);
    await verifyEnvironment();
    await page.locator('#productTitle').waitFor({state:'visible'});
    const data = await page.evaluate(extractProduct);
    await guard();
    return {...data, url:page.url(), observedAt:new Date().toISOString()};
  }
  return {initialize,search:(keyword, number) => guarded(() => search(keyword, number)),close:() => browser.close(),
    async detail(asin) {
      const data = await guarded(() => product(asin));
      if (!data.title || data.asin !== asin) throw Error('详情商品身份未验证');
      return {...data, completed:true};
    },
    async rating(asin, child, subject) {
      const data = await guarded(() => product(asin));
      const correct = data.asin === asin || (asin === subject && data.verifiedParentAsin === subject);
      if (!data.title || !correct || (asin === child && subject !== child && data.verifiedParentAsin !== subject))
        throw Error('评分主体未验证');
      return {completed:data.rating !== null && data.ratingCount !== null,
        rating:data.rating, ratingCount:data.ratingCount, histogram:data.histogram, observedAsin:data.asin, url:data.url};
    }};
}
