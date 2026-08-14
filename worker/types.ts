import type { CollectionDimensions, MonitorItem, RankResult, RunProgress, RunReceipt } from "../src/domain/types";
import type { Marketplace } from "../src/domain/marketplaces";

export type MonitorWorkerJob = {
  runId: string;
  displayRunId?: string;
  userId: string;
  projectId: string;
  projectName: string;
  marketplace: Marketplace;
  zipCode: string;
  scanDepth: 1 | 2 | 3;
  dimensions: CollectionDimensions;
  items: MonitorItem[];
  /** Only ASINs recorded here may be used for same-parent fallback matching. */
  verifiedSiblingAsinsByChild?: Record<string, string[]>;
  receipt: RunReceipt;
  evidenceDirectory: string;
};

export type WorkerPageEvidence = {
  keyword: string;
  pageNumber: number;
  requestedUrl: string;
  finalUrl: string;
  completed: boolean;
  zipVerified: boolean;
  captcha: boolean;
  cardCount: number;
  organicCardCount: number;
  screenshotPath: string | null;
  error: string | null;
};

export type WorkerOutput = {
  runId: string;
  status: "已完成" | "部分完成" | "未完成" | "已取消";
  progress: RunProgress;
  results: RankResult[];
  pageEvidence: WorkerPageEvidence[];
  familyEvidence: WorkerFamilyEvidence[];
  successfulRequests: {
    searchPages: number;
    detailPages: number;
    ratingSubjects: number;
  };
  startedAt: string;
  completedAt: string;
  captchaDetected: boolean;
  adClickNavigationDetected: false;
  error: string | null;
};

export type WorkerHooks = {
  onProgress?: (progress: RunProgress) => Promise<void> | void;
  shouldCancel?: () => Promise<boolean> | boolean;
};

export type WorkerFamilyEvidence = {
  childAsin: string;
  suppliedParentAsin: string | null;
  verified: boolean;
  verifiedParentAsin: string | null;
  siblingAsins: string[];
  pageUrl: string;
  pageCompleted: boolean;
  error: string | null;
};
