import "server-only";

import { randomUUID } from "node:crypto";
import type {
  AppSnapshot,
  CollectionDimensions,
  MonitorItem,
  MonitorRun,
  Project,
  RankResult,
  UserAccount,
  WalletLedger,
} from "@/domain/types";
import { enabledMarketplaces, MARKETPLACES } from "@/domain/marketplaces";
import { estimatePoints } from "@/domain/pricing";
import { billableEstimate, isMeteringEnabled, resolveMeteringMode } from "@/domain/metering";

const now = () => new Date().toISOString();
const demoUserId = "user-demo";
const adminUserId = "user-admin";
const projectId = "project-coffee-core";

const defaultDimensions: CollectionDimensions = {
  organicRank: true,
  sameParentMatch: true,
  price: true,
  coupon: false,
  monthlySales: false,
  stock: false,
  seller: false,
  rating: true,
  ratingDistribution: true,
};

const seededItems: MonitorItem[] = [
  {
    id: "item-coffee-1",
    projectId,
    enabled: true,
    category: "厨房小家电",
    productType: "自有",
    childAsin: "B000DEMO01",
    parentAsin: "B000PARENT",
    productName: "Demo Coffee Maker",
    keyword: "coffee maker",
    sameParentMatch: true,
    notes: "",
  },
  {
    id: "item-coffee-2",
    projectId,
    enabled: true,
    category: "厨房小家电",
    productType: "自有",
    childAsin: "B000DEMO01",
    parentAsin: "B000PARENT",
    productName: "Demo Coffee Maker",
    keyword: "drip coffee maker",
    sameParentMatch: true,
    notes: "",
  },
  {
    id: "item-blender-1",
    projectId,
    enabled: true,
    category: "运动户外",
    productType: "竞品",
    childAsin: "B000DEMO02",
    parentAsin: "B000PAREN2",
    productName: "Demo Portable Blender",
    keyword: "portable blender",
    sameParentMatch: true,
    notes: "",
  },
  {
    id: "item-blender-2",
    projectId,
    enabled: true,
    category: "运动户外",
    productType: "竞品",
    childAsin: "B000DEMO02",
    parentAsin: "B000PAREN2",
    productName: "Demo Portable Blender",
    keyword: "personal blender",
    sameParentMatch: true,
    notes: "",
  },
  {
    id: "item-kettle-1",
    projectId,
    enabled: true,
    category: "家居生活",
    productType: "自有",
    childAsin: "B000DEMO03",
    parentAsin: null,
    productName: "Demo Electric Kettle",
    keyword: "electric kettle",
    sameParentMatch: false,
    notes: "",
  },
  {
    id: "item-kettle-2",
    projectId,
    enabled: true,
    category: "家居生活",
    productType: "自有",
    childAsin: "B000DEMO03",
    parentAsin: null,
    productName: "Demo Electric Kettle",
    keyword: "hot water kettle",
    sameParentMatch: false,
    notes: "",
  },
];

type DemoState = AppSnapshot & { timers: Map<string, NodeJS.Timeout[]> };

const users: UserAccount[] = [
  {
    id: demoUserId,
    email: "maintainer@example.com",
    name: "演示维护者",
    role: "ADMIN",
    membershipStatus: "有效",
    membershipExpiresAt: null,
    trialApproved: true,
    trialUsed: false,
  },
  {
    id: adminUserId,
    email: "admin@example.com",
    name: "管理员",
    role: "ADMIN",
    membershipStatus: "有效",
    membershipExpiresAt: null,
    trialApproved: true,
    trialUsed: true,
  },
  {
    id: "user-lisi",
    email: "contributor@example.com",
    name: "演示贡献者",
    role: "USER",
    membershipStatus: "试用",
    membershipExpiresAt: null,
    trialApproved: false,
    trialUsed: false,
  },
];

function buildInitialState(): DemoState {
  const createdAt = now();
  const project: Project = {
    id: projectId,
    ownerId: demoUserId,
    name: "合成示例项目",
    marketplace: "amazon.com",
    zipCode: "10001",
    scanDepth: 3,
    viewport: "1920×1080 / 100% / DPR 1",
    rankingPolicy: "广告排除后的自然行",
    dimensions: defaultDimensions,
    items: seededItems,
    createdAt,
    updatedAt: createdAt,
  };

  return {
    meteringEnabled: isMeteringEnabled(),
    currentUser: users[0],
    projects: [project],
    wallet: {
      userId: demoUserId,
      available: 0,
      frozen: 0,
      consumed: 0,
      refunded: 0,
    },
    ledger: [],
    quotaLots: [],
    runs: [],
    rateConfig: {
      version: "rate-v1",
      searchPage: 1,
      detailPage: 1,
      ratingSubject: 1,
      effectiveAt: "2026-08-09T00:00:00.000Z",
    },
    users,
    costCenter: [
      {
        id: "cost-cvm",
        category: "云服务器",
        period: "2026-08",
        amountCny: null,
        usage: "自托管 Web 与 Worker 运行成本",
        providerStatus: "待配置",
        source: "由管理员录入实际账单",
      },
      {
        id: "cost-cos",
        category: "对象存储",
        period: "2026-08",
        amountCny: null,
        usage: "运行凭证、导出与季度归档",
        providerStatus: "待配置",
        source: "按实际存储方案统计",
      },
      {
        id: "cost-email",
        category: "邮件",
        period: "2026-08",
        amountCny: null,
        usage: "登录验证码邮件",
        providerStatus: "待配置",
        source: "等待发信域名与 SMTP 凭证",
      },
      {
        id: "cost-ai",
        category: "平台AI",
        period: "2026-08",
        amountCny: 0,
        usage: "第二阶段尚未启用",
        providerStatus: "待配置",
        source: "用户自带 API 不计入平台模型成本",
      },
    ],
    providerCapabilities: [
      { provider: "OpenAI", model: "管理员配置后加载", reasoningOptions: [], enabled: false },
      { provider: "Google Gemini", model: "管理员配置后加载", reasoningOptions: [], enabled: false },
      { provider: "DeepSeek", model: "管理员配置后加载", reasoningOptions: [], enabled: false },
    ],
    credentials: [
      { provider: "OpenAI", connected: false, maskedKey: null, lastCheckedAt: null, status: "未绑定" },
      { provider: "Google Gemini", connected: false, maskedKey: null, lastCheckedAt: null, status: "未绑定" },
      { provider: "DeepSeek", connected: false, maskedKey: null, lastCheckedAt: null, status: "未绑定" },
    ],
    timers: new Map(),
  };
}

export function registerTrialAccount(emailValue: string) {
  const store = state();
  const email = emailValue.trim().toLocaleLowerCase("en-US");
  const existing = store.users.find((user) => user.email.toLocaleLowerCase("en-US") === email);
  if (existing) return structuredClone(existing);
  const account: UserAccount = { id: randomUUID(), email, name: email.split("@")[0] || "新用户", role: "USER", membershipStatus: "试用", membershipExpiresAt: null, trialApproved: true, trialUsed: false };
  store.users.push(account);
  return structuredClone(account);
}

declare global {
  var __rankMonitorDemoState: DemoState | undefined;
}

function state() {
  globalThis.__rankMonitorDemoState ??= buildInitialState();
  return globalThis.__rankMonitorDemoState;
}

function publicSnapshot(): AppSnapshot {
  const { timers, ...snapshot } = state();
  void timers;
  return structuredClone({ ...snapshot, meteringEnabled: isMeteringEnabled() });
}

function addLedger(entry: Omit<WalletLedger, "id" | "createdAt">) {
  state().ledger.unshift({ id: randomUUID(), createdAt: now(), ...entry });
}

function resultFor(item: MonitorItem, run: MonitorRun, index: number): RankResult {
  const noMatch = index === 5;
  const row = [2, 5, 3, 7, 6, null][index] ?? null;
  const rating = [4.6, 4.6, 4.3, 4.3, 4.4, null][index] ?? null;
  const ratingCount = [12_345, 12_345, 8_210, 8_210, 3_812, null][index] ?? null;
  const completed = !noMatch;
  return {
    id: randomUUID(),
    runId: run.id,
    projectId: run.projectId,
    monitorItemId: item.id,
    category: item.category,
    productType: item.productType,
    childAsin: item.childAsin,
    displayedAsin: completed ? item.childAsin : null,
    keyword: item.keyword,
    state: completed ? "已完成" : "暂无",
    naturalPage: completed ? 1 : null,
    naturalRow: row,
    naturalColumn: completed ? ((index % 4) + 1) : null,
    naturalOrdinal: completed ? (row ? row * 4 - 2 : null) : null,
    matchType: completed ? "直接命中" : null,
    priceAmount: index < 2 ? 69.99 : index < 4 ? 29.99 : 39.99,
    currency: "USD",
    coupon: null,
    monthlySales: null,
    stock: "有货",
    seller: "Amazon.com",
    rating,
    ratingCount,
    ratingDistribution: completed ? "5星 76%；4星 16%；3星 5%；2星 1%；1星 2%" : null,
    note: noMatch ? `已完成 ${run.receipt.scanDepth} 页扫描，未发现符合口径的自然结果` : "",
    observedAt: now(),
  };
}

function schedule(runId: string, delay: number, callback: () => void) {
  const timer = setTimeout(callback, delay);
  const timers = state().timers.get(runId) || [];
  timers.push(timer);
  state().timers.set(runId, timers);
}

function settleRun(run: MonitorRun) {
  const store = state();
  if (run.status === "已取消") return;
  const project = store.projects.find((candidate) => candidate.id === run.projectId);
  if (!project) return;

  run.results = project.items.filter((item) => item.enabled).map((item, index) => resultFor(item, run, index));
  run.progress.searchCompleted = run.progress.searchTotal;
  run.progress.detailCompleted = run.progress.detailTotal;
  run.progress.ratingCompleted = run.progress.ratingTotal;
  run.status = "已完成";
  run.completedAt = now();
  const meteringMode = resolveMeteringMode(run.receipt.meteringMode);
  run.consumedPoints = meteringMode === "wallet" ? run.estimatedPoints : 0;
  run.refundedPoints = Math.max(0, run.frozenPoints - run.consumedPoints);
  if (meteringMode === "wallet") {
    store.wallet.frozen -= run.frozenPoints;
    store.wallet.consumed += run.consumedPoints;
    store.wallet.available += run.refundedPoints;
    store.wallet.refunded += run.refundedPoints;
  }

  if (meteringMode === "wallet") addLedger({
    userId: run.userId,
    kind: "消耗",
    amount: -run.consumedPoints,
    balanceAfter: store.wallet.available,
    referenceId: run.id,
    reason: "监控任务按实际成功请求结算",
    actor: "系统",
  });
  if (meteringMode === "wallet" && run.refundedPoints > 0) {
    addLedger({
      userId: run.userId,
      kind: "退回",
      amount: run.refundedPoints,
      balanceAfter: store.wallet.available,
      referenceId: run.id,
      reason: "未执行请求点数退回",
      actor: "系统",
    });
  }
  store.timers.delete(run.id);
}

function simulateRun(run: MonitorRun) {
  schedule(run.id, 350, () => {
    if (run.status === "已取消") return;
    run.status = "执行中";
    run.startedAt = now();
  });

  const searchSteps = Math.min(run.progress.searchTotal, 12);
  for (let step = 1; step <= searchSteps; step += 1) {
    schedule(run.id, 500 + step * 130, () => {
      if (run.status === "已取消") return;
      run.progress.searchCompleted = Math.round((step / searchSteps) * run.progress.searchTotal);
    });
  }

  schedule(run.id, 2_250, () => {
    if (run.status === "已取消") return;
    run.progress.detailCompleted = run.progress.detailTotal;
  });
  schedule(run.id, 2_600, () => {
    if (run.status === "已取消") return;
    run.progress.ratingCompleted = run.progress.ratingTotal;
  });
  schedule(run.id, 2_850, () => settleRun(run));
}

export function getSnapshot() {
  return publicSnapshot();
}

export function getProject(id: string) {
  const project = state().projects.find((candidate) => candidate.id === id);
  return project ? structuredClone(project) : null;
}

export function saveProject(project: Project) {
  const store = state();
  const index = store.projects.findIndex((candidate) => candidate.id === project.id);
  const next = { ...project, updatedAt: now() };
  if (index >= 0) store.projects[index] = next;
  else store.projects.push(next);
  return structuredClone(next);
}

export function addProjectItem(projectIdValue: string, input: Omit<MonitorItem, "id" | "projectId" | "enabled">) {
  const project = state().projects.find((candidate) => candidate.id === projectIdValue);
  if (!project) throw new Error("项目不存在");
  const duplicate = project.items.find((item) =>
    item.childAsin === input.childAsin && item.keyword.toLocaleLowerCase("en-US") === input.keyword.toLocaleLowerCase("en-US")
  );
  if (duplicate) {
    Object.assign(duplicate, input, { enabled: true });
    project.updatedAt = now();
    return structuredClone(duplicate);
  }
  const item: MonitorItem = { id: randomUUID(), projectId: project.id, enabled: true, ...input };
  project.items.push(item);
  project.updatedAt = now();
  return structuredClone(item);
}

export function removeProjectItem(projectIdValue: string, itemId: string) {
  const project = state().projects.find((candidate) => candidate.id === projectIdValue);
  if (!project) throw new Error("项目不存在");
  const item = project.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error("监控项不存在");
  item.enabled = false;
  project.updatedAt = now();
  return structuredClone(item);
}

export function importProjectItems(
  projectIdValue: string,
  rows: Array<Omit<MonitorItem, "id" | "projectId" | "enabled">>,
  mode: "append" | "replace",
) {
  const project = state().projects.find((candidate) => candidate.id === projectIdValue);
  if (!project) throw new Error("项目不存在");
  const importedKeys = new Set<string>();
  let added = 0;
  let updated = 0;

  for (const row of rows) {
    const key = `${row.childAsin}::${row.keyword.toLocaleLowerCase("en-US")}`;
    importedKeys.add(key);
    const existing = project.items.find((item) =>
      item.childAsin === row.childAsin
      && item.keyword.toLocaleLowerCase("en-US") === row.keyword.toLocaleLowerCase("en-US")
    );
    if (existing) {
      Object.assign(existing, row, { enabled: true });
      updated += 1;
    } else {
      project.items.push({ id: randomUUID(), projectId: project.id, enabled: true, ...row });
      added += 1;
    }
  }
  let disabled = 0;
  if (mode === "replace") {
    for (const item of project.items) {
      const key = `${item.childAsin}::${item.keyword.toLocaleLowerCase("en-US")}`;
      if (!importedKeys.has(key) && item.enabled) {
        item.enabled = false;
        disabled += 1;
      }
    }
  }
  project.updatedAt = now();
  return { added, updated, disabled, total: rows.length };
}

export function startRun(projectIdValue: string) {
  const store = state();
  const activeRun = store.runs.find((run) => run.userId === demoUserId && ["等待中", "执行中"].includes(run.status));
  if (activeRun) throw new Error("每个用户同时只能执行一个任务");
  const project = store.projects.find((candidate) => candidate.id === projectIdValue);
  if (!project) throw new Error("项目不存在");
  if (!enabledMarketplaces().includes(project.marketplace)) throw new Error("所选站点尚未完成真实回归，当前实例未开放");
  if (!project.items.some((item) => item.enabled)) throw new Error("请至少添加一个启用的 ASIN 与关键词");
  const estimate = estimatePoints(project.items, project.scanDepth, project.dimensions, store.rateConfig);
  const meteringMode = resolveMeteringMode(process.env.METERING_MODE);
  const frozenPoints = billableEstimate(estimate.total, meteringMode);
  if (meteringMode === "wallet" && store.wallet.available < frozenPoints) throw new Error("可用点数不足，请先调整配额");

  const requestedAt = now();
  const run: MonitorRun = {
    id: `RUN-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 6).toUpperCase()}`,
    userId: demoUserId,
    projectId: project.id,
    status: "等待中",
    progress: {
      searchCompleted: 0,
      searchTotal: estimate.searchPages,
      detailCompleted: 0,
      detailTotal: estimate.detailPages,
      ratingCompleted: 0,
      ratingTotal: estimate.ratingSubjects,
    },
    estimatedPoints: estimate.total,
    frozenPoints,
    consumedPoints: 0,
    refundedPoints: 0,
    requestedAt,
    startedAt: null,
    completedAt: null,
    receipt: {
      protocolVersion: "organic-rank-v4-web",
      marketplace: project.marketplace,
      zipCode: project.zipCode,
      viewport: "1920×1080",
      zoom: "100%",
      dpr: 1,
      locale: MARKETPLACES[project.marketplace].locale,
      timezone: MARKETPLACES[project.marketplace].timezone,
      currency: MARKETPLACES[project.marketplace].currency,
      signedIn: false,
      isolatedSession: true,
      scanDepth: project.scanDepth,
      rankingPolicy: "广告排除后的自然行",
      rateVersion: store.rateConfig.version,
      meteringMode,
      workerVersion: "demo-worker-0.1.1",
      adRankFieldsStored: false,
    },
    results: [],
    error: null,
  };
  if (meteringMode === "wallet") {
    store.wallet.available -= frozenPoints;
    store.wallet.frozen += frozenPoints;
    addLedger({
    userId: demoUserId,
    kind: "冻结",
    amount: -frozenPoints,
    balanceAfter: store.wallet.available,
    referenceId: run.id,
    reason: "创建监控任务，冻结预计配额",
    actor: "系统",
    });
  }
  store.runs.unshift(run);
  simulateRun(run);
  return structuredClone(run);
}

export function getRun(id: string) {
  const run = state().runs.find((candidate) => candidate.id === id);
  return run ? structuredClone(run) : null;
}

export function cancelRun(id: string) {
  const store = state();
  const run = store.runs.find((candidate) => candidate.id === id);
  if (!run) throw new Error("任务不存在");
  if (!["等待中", "执行中"].includes(run.status)) return structuredClone(run);
  const timers = store.timers.get(run.id) || [];
  timers.forEach(clearTimeout);
  store.timers.delete(run.id);
  run.status = "已取消";
  run.completedAt = now();
  const meteringMode = resolveMeteringMode(run.receipt.meteringMode);
  run.refundedPoints = meteringMode === "wallet" ? run.frozenPoints : 0;
  if (meteringMode === "wallet") {
    store.wallet.frozen -= run.frozenPoints;
    store.wallet.available += run.frozenPoints;
    store.wallet.refunded += run.frozenPoints;
    addLedger({
    userId: run.userId,
    kind: "退回",
    amount: run.frozenPoints,
    balanceAfter: store.wallet.available,
    referenceId: run.id,
    reason: "任务取消，退回全部冻结点数",
    actor: "系统",
    });
  }
  return structuredClone(run);
}

export function adjustWallet(userId: string, amount: number, reason: string, actor = "管理员") {
  if (!isMeteringEnabled()) throw new Error("钱包计量功能未启用");
  const store = state();
  if (userId !== store.wallet.userId) throw new Error("演示环境仅为当前用户维护余额");
  if (store.wallet.available + amount < 0) throw new Error("扣减后可用点数不能为负数");
  store.wallet.available += amount;
  addLedger({
    userId,
    kind: amount > 0 ? "充值" : "扣减",
    amount,
    balanceAfter: store.wallet.available,
    referenceId: null,
    reason,
    actor,
  });
  return structuredClone(store.wallet);
}

export function resetDemoState() {
  state().timers.forEach((timers) => timers.forEach(clearTimeout));
  globalThis.__rankMonitorDemoState = buildInitialState();
}
