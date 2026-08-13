import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { organicCandidates, shouldAbortRunOnCaptcha, shouldRetryMonitorAttempt } from "../src/domain/monitoring";
import type { MonitorItem, RankResult, RunProgress } from "../src/domain/types";
import type { MonitorWorkerJob, WorkerFamilyEvidence, WorkerHooks, WorkerOutput, WorkerPageEvidence } from "./types";

type SearchCard = {
  asin: string;
  sponsored: boolean;
  naturalRow: number | null;
  visualColumn: number;
  naturalOrdinal: number | null;
  x: number;
  y: number;
  title: string;
};

type SearchPageResult = WorkerPageEvidence & { cards: SearchCard[] };

const compact = (value: string | null | undefined) => String(value || "").replace(/\s+/g, " ").trim();
const now = () => new Date().toISOString();
const slug = (value: string) => value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "keyword";
const isCaptchaError = (value: unknown) => /captcha|robot check|验证码/i.test(value instanceof Error ? value.message : String(value || ""));
const pageHasCaptcha = async (page: Page) => /captcha|robot check|enter the characters you see below/i.test(await page.locator("body").innerText().catch(() => ""));

async function launchBrowser() {
  const executablePath = process.env.CHROME_EXECUTABLE_PATH || undefined;
  return chromium.launch({
    headless: process.env.WORKER_HEADED !== "true",
    executablePath,
    args: ["--lang=en-US", "--window-size=1920,1080", "--force-device-scale-factor=1"],
  });
}

async function createContext(browser: Browser) {
  return browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
  });
}

async function ensureZip(page: Page, zipCode: string) {
  await page.goto("https://www.amazon.com/", { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(1_500);
  if (await pageHasCaptcha(page)) throw new Error("检测到 CAPTCHA");
  const current = compact(await page.locator("#nav-global-location-popover-link").innerText().catch(() => ""));
  if (current.includes(zipCode)) return true;
  await page.locator("#nav-global-location-popover-link").click({ timeout: 12_000 }).catch(() => null);
  await page.waitForTimeout(1_000);
  const input = page.locator("#GLUXZipUpdateInput");
  if (!(await input.isVisible().catch(() => false))) return false;
  await input.fill(zipCode);
  await page.locator("#GLUXZipUpdate input[type=submit]").click({ timeout: 10_000 });
  await page.waitForTimeout(1_400);
  if (await pageHasCaptcha(page)) throw new Error("检测到 CAPTCHA");
  for (const selector of ["#GLUXConfirmClose", "button[name=glowDoneButton]", "button:has-text('Done')", "button:has-text('Continue')"]) {
    const candidate = page.locator(selector).first();
    if (await candidate.isVisible().catch(() => false)) await candidate.click().catch(() => null);
  }
  await page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 });
  const verified = compact(await page.locator("#nav-global-location-popover-link").innerText().catch(() => ""));
  return verified.includes(zipCode);
}

async function verifyLoggedOut(page: Page) {
  const text = compact(await page.locator("#nav-link-accountList-nav-line-1").textContent().catch(() => ""));
  return !text || /Hello,\s*sign in/i.test(text);
}

async function collectSearchPage(page: Page, job: MonitorWorkerJob, keyword: string, pageNumber: number): Promise<SearchPageResult> {
  const requestedUrl = `https://www.amazon.com/s?k=${encodeURIComponent(keyword).replaceAll("%20", "+")}&page=${pageNumber}&ref=sr_pg_${pageNumber}`;
  let error: string | null = null;
  try {
    await page.goto(requestedUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(1_500);
    await page.waitForSelector('#search [data-component-type="s-search-result"][data-asin]', { timeout: 9_000 }).catch(() => null);
  } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }

  const extracted = await page.evaluate(() => {
    const bodyText = document.body.innerText || "";
    const captcha = /captcha|robot check|enter the characters you see below/i.test(bodyText);
    const zipText = document.querySelector("#glow-ingress-line2")?.textContent?.trim() || "";
    const elements = [...document.querySelectorAll<HTMLElement>('#search [data-component-type="s-search-result"][data-asin]')]
      .filter((element) => {
        const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
        return Boolean(element.dataset.asin) && rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      });
    const cards = elements.map((element) => {
      const rect = element.getBoundingClientRect(); const text = element.innerText || ""; const html = element.innerHTML || "";
      const visibleSponsored = /(^|\n)\s*Sponsored\s*(\n|$)/i.test(text);
      const ariaSponsored = [...element.querySelectorAll("[aria-label]")].some((node) => /sponsored/i.test(node.getAttribute("aria-label") || ""));
      const metadataSponsored = /"isSponsored"\s*:\s*true|searchProductType.{0,80}SPONSORED/i.test(html);
      return {
        asin: element.dataset.asin || "",
        sponsored: visibleSponsored || ariaSponsored || metadataSponsored,
        x: Math.round(rect.x), y: Math.round(rect.y + scrollY), centerY: Math.round(rect.y + scrollY + rect.height / 2),
        title: (element.querySelector("h2")?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 180),
      };
    }).sort((left, right) => left.centerY - right.centerY || left.x - right.x);
    const rows: Array<{ anchor: number; cards: typeof cards }> = [];
    for (const card of cards) {
      let row = rows.find((candidate) => Math.abs(candidate.anchor - card.centerY) <= 22);
      if (!row) { row = { anchor: card.centerY, cards: [] }; rows.push(row); }
      row.cards.push(card);
    }
    rows.sort((left, right) => left.anchor - right.anchor);
    let naturalRow = 0; let naturalOrdinal = 0;
    const ranked = rows.flatMap((row) => {
      row.cards.sort((left, right) => left.x - right.x);
      const hasOrganic = row.cards.some((card) => !card.sponsored);
      if (hasOrganic) naturalRow += 1;
      return row.cards.map((card, index) => {
        if (!card.sponsored) naturalOrdinal += 1;
        return { asin: card.asin, sponsored: card.sponsored, naturalRow: card.sponsored ? null : naturalRow, visualColumn: index + 1, naturalOrdinal: card.sponsored ? null : naturalOrdinal, x: card.x, y: card.y, title: card.title };
      });
    });
    return { captcha, zipText, cards: ranked };
  }).catch(() => ({ captcha: false, zipText: "", cards: [] as SearchCard[] }));

  const zipVerified = extracted.zipText.includes(job.zipCode);
  const completed = !error && !extracted.captcha && zipVerified && extracted.cards.length > 0;
  let screenshotPath: string | null = null;
  const targets = job.items.filter((item) => item.enabled && item.keyword.toLocaleLowerCase("en-US") === keyword.toLocaleLowerCase("en-US"));
  const matched = extracted.cards.some((card) => !card.sponsored && targets.some((target) => target.childAsin === card.asin));
  if (!completed || matched) {
    screenshotPath = path.join(job.evidenceDirectory, `${slug(keyword)}-p${pageNumber}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => { screenshotPath = null; });
  }
  return { keyword, pageNumber, requestedUrl, finalUrl: page.url(), completed, zipVerified, captcha: extracted.captcha, cardCount: extracted.cards.length, organicCardCount: extracted.cards.filter((card) => !card.sponsored).length, screenshotPath, error: error || (!zipVerified ? "邮编未验证" : extracted.cards.length === 0 ? "主搜索网格为空" : null), cards: extracted.cards };
}

async function collectDetail(page: Page, asin: string, navigate = true) {
  const url = `https://www.amazon.com/dp/${asin}`;
  if (navigate) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(1_200);
  }
  if (/captcha|robot check/i.test(await page.locator("body").innerText().catch(() => ""))) throw new Error("详情页出现验证码");
  return page.evaluate(() => {
    const number = (value: string) => { const match = value.replaceAll(",", "").match(/\d+(?:\.\d+)?/); return match ? Number(match[0]) : null; };
    const text = (selector: string) => document.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim() || "";
    const priceText = text("#corePrice_feature_div .a-offscreen") || text(".a-price .a-offscreen");
    const ratingText = text("#acrPopover") || text("[data-hook=rating-out-of-text]");
    const countText = text("#acrCustomerReviewText") || text("[data-hook=total-review-count]");
    const coupon = text("#couponTextpctch") || text("#couponTextpctch_feature_div") || text("[id*=couponText]");
    const stock = text("#availability");
    const seller = text("#sellerProfileTriggerId") || text("#merchant-info");
    const body = document.body.innerText || "";
    const salesMatch = body.match(/(\d[\d,.]*\+?)\s+bought in past month/i);
    const ratingDistribution = [...document.querySelectorAll<HTMLElement>("#histogramTable tr")]
      .map((row) => row.innerText.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("；");
    return { priceUsd: number(priceText), rating: number(ratingText), ratingCount: number(countText), ratingDistribution: ratingDistribution || null, coupon: coupon || null, stock: stock || null, seller: seller || null, monthlySales: salesMatch?.[1] || null };
  });
}

async function collectRating(page: Page, asin: string) {
  const url = `https://www.amazon.com/dp/${asin}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(1_200);
  if (/captcha|robot check/i.test(await page.locator("body").innerText().catch(() => ""))) throw new Error("评分主体页出现验证码");
  return page.evaluate(() => {
    const number = (value: string) => { const match = value.replaceAll(",", "").match(/\d+(?:\.\d+)?/); return match ? Number(match[0]) : null; };
    const text = (selector: string) => document.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim() || "";
    const ratingText = text("#acrPopover") || text("[data-hook=rating-out-of-text]");
    const countText = text("#acrCustomerReviewText") || text("[data-hook=total-review-count]");
    const ratingDistribution = [...document.querySelectorAll<HTMLElement>("#histogramTable tr")]
      .map((row) => row.innerText.replace(/\s+/g, " ").trim()).filter(Boolean).join("；");
    return { rating: number(ratingText), ratingCount: number(countText), ratingDistribution: ratingDistribution || null };
  });
}

async function collectFamilyEvidence(page: Page, childAsin: string, suppliedParentAsin: string | null): Promise<WorkerFamilyEvidence> {
  const url = `https://www.amazon.com/dp/${childAsin}`;
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(1_200);
    const body = await page.locator("body").innerText().catch(() => "");
    if (/captcha|robot check/i.test(body)) throw new Error("同父体验证页出现验证码");
    const extracted = await page.evaluate(() => {
      const asinPattern = /\b[A-Z0-9]{10}\b/g;
      const siblings = new Set<string>();
      const selectors = ["#twister", "[id^=variation_]", "[id^=inline-twister]", "[data-csa-c-content-id*=variation]"];
      for (const node of document.querySelectorAll<HTMLElement>(selectors.join(","))) {
        for (const attribute of ["data-asin", "data-defaultasin", "data-dp-url", "href"]) {
          const value = node.getAttribute(attribute) || "";
          for (const asin of value.match(asinPattern) || []) siblings.add(asin);
        }
        for (const descendant of node.querySelectorAll<HTMLElement>("[data-asin],[data-defaultasin],[data-dp-url],a[href*='/dp/']")) {
          const source = [descendant.dataset.asin, descendant.getAttribute("data-defaultasin"), descendant.getAttribute("data-dp-url"), descendant.getAttribute("href")].filter(Boolean).join(" ");
          for (const asin of source.match(asinPattern) || []) siblings.add(asin);
        }
      }
      let reportedParent: string | null = null;
      for (const script of document.scripts) {
        const text = script.textContent || "";
        if (!/twister|variationValues|dimensionValuesDisplayData/i.test(text)) continue;
        const parentMatch = text.match(/["']parentAsin["']\s*:\s*["']([A-Z0-9]{10})["']/i);
        if (parentMatch) reportedParent = parentMatch[1].toUpperCase();
        for (const match of text.matchAll(/["'](?:asin|ASIN)["']\s*:\s*["']([A-Z0-9]{10})["']/g)) siblings.add(match[1].toUpperCase());
      }
      const canonical = document.querySelector<HTMLLinkElement>("link[rel=canonical]")?.href || location.href;
      const current = canonical.match(/\/dp\/([A-Z0-9]{10})/i)?.[1]?.toUpperCase() || null;
      if (current) siblings.add(current);
      return { reportedParent, siblingAsins: [...siblings] };
    });
    const supplied = suppliedParentAsin?.toUpperCase() || null;
    const verified = Boolean(supplied && extracted.reportedParent === supplied && extracted.siblingAsins.includes(childAsin));
    return { childAsin, suppliedParentAsin: supplied, verified, verifiedParentAsin: verified ? supplied : null, siblingAsins: verified ? extracted.siblingAsins : [], pageUrl: page.url(), pageCompleted: true, error: verified ? null : supplied ? "页面未提供可核验的父子变体证据" : "未填写父 ASIN，不能启用同父体扩展匹配" };
  } catch (cause) {
    return { childAsin, suppliedParentAsin, verified: false, verifiedParentAsin: null, siblingAsins: [], pageUrl: page.url(), pageCompleted: false, error: cause instanceof Error ? cause.message : String(cause) };
  }
}

function emptyResult(job: MonitorWorkerJob, item: MonitorItem, state: "暂无" | "未完成", note: string): RankResult {
  return { id: crypto.randomUUID(), runId: job.runId, projectId: job.projectId, monitorItemId: item.id, category: item.category, productType: item.productType, childAsin: item.childAsin, displayedAsin: null, keyword: item.keyword, state, naturalPage: null, naturalRow: null, naturalColumn: null, naturalOrdinal: null, matchType: null, priceUsd: null, coupon: null, monthlySales: null, stock: null, seller: null, rating: null, ratingCount: null, ratingDistribution: null, note, observedAt: state === "暂无" ? now() : null };
}

async function execute(job: MonitorWorkerJob, browser: Browser, hooks: WorkerHooks): Promise<WorkerOutput> {
  const startedAt = now(); await fs.mkdir(job.evidenceDirectory, { recursive: true });
  const context = await createContext(browser); const anchor = await context.newPage();
  const activeItems = job.items.filter((item) => item.enabled);
  const keywordGroups = [...new Set(activeItems.map((item) => item.keyword.trim()))];
  const needProductDetail = job.dimensions.price || job.dimensions.coupon || job.dimensions.monthlySales || job.dimensions.stock || job.dimensions.seller || job.dimensions.rating || job.dimensions.ratingDistribution;
  const needRating = job.dimensions.rating || job.dimensions.ratingDistribution;
  const needsFamily = (item: MonitorItem) => job.dimensions.sameParentMatch && item.sameParentMatch;
  const detailAsins = [...new Set(activeItems.filter((item) => needProductDetail || needsFamily(item)).map((item) => item.childAsin))];
  const progress: RunProgress = { searchCompleted: 0, searchTotal: keywordGroups.length * job.scanDepth, detailCompleted: 0, detailTotal: detailAsins.length, ratingCompleted: 0, ratingTotal: 0 };
  const pageEvidence: WorkerPageEvidence[] = []; const familyEvidence: WorkerFamilyEvidence[] = [];
  const pagesByKeyword = new Map<string, SearchPageResult[]>();
  const successfulRequests = { searchPages: 0, detailPages: 0, ratingSubjects: 0 };
  const captchaOutput = async (reason: string): Promise<WorkerOutput> => {
    await context.close().catch(() => null);
    return {
      runId: job.runId,
      status: "未完成",
      progress,
      results: activeItems.map((item) => emptyResult(job, item, "未完成", reason)),
      pageEvidence,
      familyEvidence,
      successfulRequests,
      startedAt,
      completedAt: now(),
      captchaDetected: true,
      adClickNavigationDetected: false,
      error: reason,
    };
  };
  const cancelledOutput = async (): Promise<WorkerOutput> => {
    await context.close().catch(() => null);
    return { runId: job.runId, status: "已取消", progress, results: activeItems.map((item) => emptyResult(job, item, "未完成", "任务已由用户取消")), pageEvidence, familyEvidence, successfulRequests, startedAt, completedAt: now(), captchaDetected: pageEvidence.some((page) => page.captcha), adClickNavigationDetected: false, error: "任务已由用户取消" };
  };
  const cancelled = async () => Boolean(await hooks.shouldCancel?.());
  const zipReady = await ensureZip(anchor, job.zipCode); const loggedOut = await verifyLoggedOut(anchor);
  if (!zipReady || !loggedOut) { await context.close(); throw new Error(zipReady ? "浏览器意外处于登录状态" : `邮编 ${job.zipCode} 设置失败`); }
  if (await cancelled()) return cancelledOutput();

  for (const keyword of keywordGroups) {
    const keywordPages: SearchPageResult[] = [];
    for (let pageNumber = 1; pageNumber <= job.scanDepth; pageNumber += 1) {
      if (await cancelled()) return cancelledOutput();
      const page = await context.newPage(); const result = await collectSearchPage(page, job, keyword, pageNumber); await page.close();
      keywordPages.push(result); const { cards, ...evidence } = result; void cards; pageEvidence.push(evidence);
      if (result.completed) { progress.searchCompleted += 1; successfulRequests.searchPages += 1; }
      await hooks.onProgress?.(structuredClone(progress));
      if (shouldAbortRunOnCaptcha(result.captcha)) {
        return captchaOutput("检测到 CAPTCHA；已停止本次运行的全部剩余采集，未执行项目统一标记为“未完成”");
      }
    }
    pagesByKeyword.set(keyword, keywordPages);
  }

  const details = new Map<string, Awaited<ReturnType<typeof collectDetail>>>();
  const detailFailures = new Map<string, string>();
  for (const asin of detailAsins) {
    if (await cancelled()) return cancelledOutput();
    const page = await context.newPage();
    const relatedItems = activeItems.filter((item) => item.childAsin === asin);
    const familyItem = relatedItems.find(needsFamily);
    let pageCompleted = false;
    let captchaFailure: string | null = null;
    try {
      if (familyItem) {
        const evidence = await collectFamilyEvidence(page, asin, familyItem.parentAsin);
        familyEvidence.push(evidence); pageCompleted = evidence.pageCompleted;
        if (isCaptchaError(evidence.error)) captchaFailure = evidence.error;
        if (needProductDetail && evidence.pageCompleted) details.set(asin, await collectDetail(page, asin, false));
      } else if (needProductDetail) {
        details.set(asin, await collectDetail(page, asin)); pageCompleted = true;
      }
      if (!pageCompleted) detailFailures.set(asin, familyEvidence.find((item) => item.childAsin === asin)?.error || "详情页未完成");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      detailFailures.set(asin, message);
      if (isCaptchaError(message)) captchaFailure = message;
    }
    finally {
      if (pageCompleted) { progress.detailCompleted += 1; successfulRequests.detailPages += 1; }
      await page.close(); await hooks.onProgress?.(structuredClone(progress));
    }
    if (captchaFailure) return captchaOutput(`检测到 CAPTCHA（${captchaFailure}）；已停止本次运行的全部剩余采集`);
  }

  const familyByChild = new Map(familyEvidence.map((evidence) => [evidence.childAsin, evidence]));
  const ratingSubjectByItem = new Map<string, string>();
  for (const item of activeItems) {
    const evidence = familyByChild.get(item.childAsin);
    ratingSubjectByItem.set(item.id, evidence?.verifiedParentAsin || item.childAsin);
  }
  const ratingSubjects = needRating ? [...new Set([...ratingSubjectByItem.values()])] : [];
  progress.ratingTotal = ratingSubjects.length;
  const ratings = new Map<string, Awaited<ReturnType<typeof collectRating>>>();
  const ratingFailures = new Map<string, string>();
  for (const asin of ratingSubjects) {
    if (await cancelled()) return cancelledOutput();
    const page = await context.newPage();
    try { ratings.set(asin, await collectRating(page, asin)); progress.ratingCompleted += 1; successfulRequests.ratingSubjects += 1; }
    catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      ratingFailures.set(asin, message);
      if (isCaptchaError(message)) {
        await page.close().catch(() => null);
        return captchaOutput(`检测到 CAPTCHA（${message}）；已停止本次运行的全部剩余采集`);
      }
    }
    finally { await page.close(); await hooks.onProgress?.(structuredClone(progress)); }
  }

  const matchByItem = new Map<string, { card: SearchCard & { pageNumber: number }; matchType: "直接命中" | "同父体命中" }>();
  for (const item of activeItems) {
    const pages = pagesByKeyword.get(item.keyword.trim()) || [];
    const organic = pages.flatMap((page) => organicCandidates(page.cards).map((card) => ({ ...card, pageNumber: page.pageNumber })));
    const exact = organic.find((card) => card.asin === item.childAsin);
    if (exact) { matchByItem.set(item.id, { card: exact, matchType: "直接命中" }); continue; }
    const evidence = familyByChild.get(item.childAsin);
    if (needsFamily(item) && evidence?.verified) {
      const verified = new Set(evidence.siblingAsins);
      const sibling = organic.find((card) => verified.has(card.asin));
      if (sibling) matchByItem.set(item.id, { card: sibling, matchType: "同父体命中" });
    }
  }

  const results = activeItems.map((item) => {
    const pages = pagesByKeyword.get(item.keyword.trim()) || [];
    const fullyComplete = pages.length === job.scanDepth && pages.every((page) => page.completed);
    const matched = matchByItem.get(item.id); const match = matched?.card;
    const detail = details.get(item.childAsin); const detailFailure = needProductDetail ? detailFailures.get(item.childAsin) : null;
    const family = familyByChild.get(item.childAsin);
    const familyFailure = needsFamily(item) && !matched && !family?.verified ? family?.error || "同父体证据未完成" : null;
    const ratingSubject = ratingSubjectByItem.get(item.id) || item.childAsin;
    const rating = ratings.get(ratingSubject); const ratingFailure = needRating ? ratingFailures.get(ratingSubject) : null;
    const failures = [!fullyComplete ? "至少一个要求搜索页、邮编或证据未完成" : null, detailFailure ? `详情维度未完成：${detailFailure}` : null, familyFailure ? `同父体验证未完成：${familyFailure}` : null, ratingFailure ? `评分主体未完成：${ratingFailure}` : null].filter(Boolean);
    if (!match && failures.length) return emptyResult(job, item, "未完成", failures.join("；"));
    if (!match) return { ...emptyResult(job, item, "暂无", `已完成 ${job.scanDepth} 页扫描，未发现符合口径的自然结果`), priceUsd: detail?.priceUsd ?? null, coupon: detail?.coupon ?? null, monthlySales: detail?.monthlySales ?? null, stock: detail?.stock ?? null, seller: detail?.seller ?? null, rating: rating?.rating ?? null, ratingCount: rating?.ratingCount ?? null, ratingDistribution: rating?.ratingDistribution ?? null };
    return { ...emptyResult(job, item, "暂无", ""), displayedAsin: match.asin, state: failures.length ? "未完成" as const : "已完成" as const, naturalPage: match.pageNumber, naturalRow: match.naturalRow, naturalColumn: match.visualColumn, naturalOrdinal: match.naturalOrdinal, matchType: matched.matchType, priceUsd: detail?.priceUsd ?? null, coupon: detail?.coupon ?? null, monthlySales: detail?.monthlySales ?? null, stock: detail?.stock ?? null, seller: detail?.seller ?? null, rating: rating?.rating ?? null, ratingCount: rating?.ratingCount ?? null, ratingDistribution: rating?.ratingDistribution ?? null, note: failures.join("；"), observedAt: now() };
  });
  await context.close();
  const incomplete = results.filter((result) => result.state === "未完成").length; const status = incomplete === 0 ? "已完成" : incomplete === results.length ? "未完成" : "部分完成";
  return { runId: job.runId, status, progress, results, pageEvidence, familyEvidence, successfulRequests, startedAt, completedAt: now(), captchaDetected: pageEvidence.some((page) => page.captcha), adClickNavigationDetected: false, error: incomplete ? `${incomplete} 个组合未完成` : null };
}

export async function runAmazonMonitor(job: MonitorWorkerJob, hooks: WorkerHooks = {}): Promise<WorkerOutput> {
  let browser = await launchBrowser();
  let firstError: unknown = null;
  try {
    const first = await execute(job, browser, hooks);
    return first;
  } catch (cause) {
    firstError = cause;
  }
  if (!shouldRetryMonitorAttempt(isCaptchaError(firstError))) {
    const message = firstError instanceof Error ? firstError.message : String(firstError);
    const active = job.items.filter((item) => item.enabled);
    await browser.close().catch(() => null);
    return { runId: job.runId, status: "未完成", progress: { searchCompleted: 0, searchTotal: new Set(active.map((item) => item.keyword)).size * job.scanDepth, detailCompleted: 0, detailTotal: new Set(active.map((item) => item.childAsin)).size, ratingCompleted: 0, ratingTotal: new Set(active.map((item) => item.childAsin)).size }, results: active.map((item) => emptyResult(job, item, "未完成", message)), pageEvidence: [], familyEvidence: [], successfulRequests: { searchPages: 0, detailPages: 0, ratingSubjects: 0 }, startedAt: now(), completedAt: now(), captchaDetected: true, adClickNavigationDetected: false, error: `检测到 CAPTCHA；已停止本次运行的全部剩余采集：${message}` };
  }
  try {
    await browser.close().catch(() => null);
    browser = await launchBrowser();
    const second = await execute(job, browser, hooks);
    return second;
  } catch (secondError) {
    const message = secondError instanceof Error ? secondError.message : String(secondError);
    const active = job.items.filter((item) => item.enabled);
    return { runId: job.runId, status: "未完成", progress: { searchCompleted: 0, searchTotal: new Set(active.map((item) => item.keyword)).size * job.scanDepth, detailCompleted: 0, detailTotal: new Set(active.map((item) => item.childAsin)).size, ratingCompleted: 0, ratingTotal: new Set(active.map((item) => item.childAsin)).size }, results: active.map((item) => emptyResult(job, item, "未完成", message)), pageEvidence: [], familyEvidence: [], successfulRequests: { searchPages: 0, detailPages: 0, ratingSubjects: 0 }, startedAt: now(), completedAt: now(), captchaDetected: isCaptchaError(message), adClickNavigationDetected: false, error: `隔离会话重试后仍失败：${message}; 首次错误：${firstError instanceof Error ? firstError.message : String(firstError)}` };
  } finally {
    await browser.close().catch(() => null);
  }
}
