import type { Currency, Marketplace } from "@/domain/marketplaces";

export type ProductType = "自有" | "竞品";
export type ResultState = "已完成" | "暂无" | "未完成";
export type RunStatus = "等待中" | "执行中" | "部分完成" | "已完成" | "未完成" | "已取消";
export type LedgerKind = "充值" | "冻结" | "消耗" | "退回" | "扣减";

export type CollectionDimensions = {
  organicRank: boolean;
  sameParentMatch: boolean;
  price: boolean;
  coupon: boolean;
  monthlySales: boolean;
  stock: boolean;
  seller: boolean;
  rating: boolean;
  ratingDistribution: boolean;
};

export type MonitorItem = {
  id: string;
  projectId: string;
  enabled: boolean;
  category: string;
  productType: ProductType;
  childAsin: string;
  parentAsin: string | null;
  productName: string;
  keyword: string;
  sameParentMatch: boolean;
  notes: string;
};

export type Project = {
  id: string;
  ownerId: string;
  name: string;
  marketplace: Marketplace;
  zipCode: string;
  scanDepth: 1 | 2 | 3;
  viewport: "1920×1080 / 100% / DPR 1";
  rankingPolicy: "广告排除后的自然行";
  dimensions: CollectionDimensions;
  items: MonitorItem[];
  createdAt: string;
  updatedAt: string;
};

export type RunProgress = {
  searchCompleted: number;
  searchTotal: number;
  detailCompleted: number;
  detailTotal: number;
  ratingCompleted: number;
  ratingTotal: number;
};

export type RunReceipt = {
  protocolVersion: string;
  marketplace: Marketplace;
  zipCode: string;
  viewport: "1920×1080";
  zoom: "100%";
  dpr: 1;
  locale: "en-US" | "en-CA" | "es-MX";
  timezone: string;
  currency: Currency;
  signedIn: false;
  isolatedSession: true;
  scanDepth: 1 | 2 | 3;
  rankingPolicy: "广告排除后的自然行";
  rateVersion: string;
  meteringMode: "disabled" | "wallet" | "trial";
  workerVersion: string;
  adRankFieldsStored: false;
};

export type RankResult = {
  id: string;
  runId: string;
  projectId: string;
  monitorItemId: string;
  category: string;
  productType: ProductType;
  childAsin: string;
  displayedAsin: string | null;
  keyword: string;
  state: ResultState;
  naturalPage: number | null;
  naturalRow: number | null;
  naturalColumn: number | null;
  naturalOrdinal: number | null;
  matchType: "直接命中" | "同父体命中" | null;
  priceAmount: number | null;
  currency: Currency;
  coupon: string | null;
  monthlySales: string | null;
  stock: string | null;
  seller: string | null;
  rating: number | null;
  ratingCount: number | null;
  ratingDistribution: string | null;
  note: string;
  observedAt: string | null;
};

export type MonitorRun = {
  id: string;
  userId: string;
  projectId: string;
  status: RunStatus;
  progress: RunProgress;
  estimatedPoints: number;
  frozenPoints: number;
  consumedPoints: number;
  refundedPoints: number;
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  receipt: RunReceipt;
  results: RankResult[];
  error: string | null;
};

export type Wallet = {
  userId: string;
  available: number;
  frozen: number;
  consumed: number;
  refunded: number;
};

export type WalletLedger = {
  id: string;
  userId: string;
  kind: LedgerKind;
  amount: number;
  balanceAfter: number;
  referenceId: string | null;
  reason: string;
  actor: string;
  createdAt: string;
};

export type QuotaLot = {
  id: string;
  userId: string;
  kind: "试用" | "套餐" | "购买" | "管理员";
  granted: number;
  available: number;
  frozen: number;
  consumed: number;
  expiresAt: string | null;
  sourceRef: string;
  createdAt: string;
};

export type UserAccount = {
  id: string;
  email: string;
  name: string;
  role: "USER" | "ADMIN";
  membershipStatus: "试用" | "有效" | "已到期";
  membershipExpiresAt: string | null;
  trialApproved: boolean;
  trialUsed: boolean;
};

export type RateConfig = {
  version: string;
  searchPage: number;
  detailPage: number;
  ratingSubject: number;
  effectiveAt: string;
};

export type CostCenterItem = {
  id: string;
  category: "云服务器" | "对象存储" | "邮件" | "平台AI";
  period: string;
  amountCny: number | null;
  usage: string;
  providerStatus: "正常" | "待配置" | "不可用";
  source: string;
};

export type AiProvider = "OpenAI" | "Google Gemini" | "DeepSeek";

export type ProviderCapability = {
  provider: AiProvider;
  model: string;
  reasoningOptions: string[];
  enabled: boolean;
};

export type ApiCredentialSummary = {
  provider: AiProvider;
  connected: boolean;
  maskedKey: string | null;
  lastCheckedAt: string | null;
  status: "未绑定" | "待验证" | "可用" | "不可用";
};

export type AppSnapshot = {
  meteringEnabled: boolean;
  currentUser: UserAccount;
  projects: Project[];
  wallet: Wallet;
  quotaLots: QuotaLot[];
  ledger: WalletLedger[];
  runs: MonitorRun[];
  rateConfig: RateConfig;
  users: UserAccount[];
  costCenter: CostCenterItem[];
  providerCapabilities: ProviderCapability[];
  credentials: ApiCredentialSummary[];
};
