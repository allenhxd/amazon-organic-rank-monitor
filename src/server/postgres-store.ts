import "server-only";

import { randomUUID } from "node:crypto";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import type { PoolClient, QueryResultRow } from "pg";
import type {
  AiProvider,
  AppSnapshot,
  CollectionDimensions,
  CostCenterItem,
  MonitorItem,
  MonitorRun,
  Project,
  RankResult,
  RateConfig,
  UserAccount,
  Wallet,
  WalletLedger,
} from "@/domain/types";
import { estimatePoints } from "@/domain/pricing";
import { billableEstimate, isMeteringEnabled, resolveMeteringMode } from "@/domain/metering";
import { databasePool, transaction } from "@/server/database";
import type { MonitorWorkerJob } from "../../worker/types";

export type StoreActor = { userId: string; role: "USER" | "ADMIN" };

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

const providerCapabilities = (["OpenAI", "Google Gemini", "DeepSeek"] as AiProvider[]).map((provider) => ({
  provider,
  model: "未启用",
  reasoningOptions: [] as string[],
  enabled: false,
}));

const credentials = (["OpenAI", "Google Gemini", "DeepSeek"] as AiProvider[]).map((provider) => ({
  provider,
  connected: false,
  maskedKey: null,
  lastCheckedAt: null,
  status: "未绑定" as const,
}));

const iso = (value: unknown) => value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
const number = (value: unknown) => Number(value || 0);
const normalizeKeyword = (value: string) => value.trim().toLocaleLowerCase("en-US");

function membership(value: string): UserAccount["membershipStatus"] {
  return value === "ACTIVE" ? "有效" : value === "EXPIRED" ? "已到期" : "试用";
}

function userFromRow(row: QueryResultRow): UserAccount {
  return {
    id: row.id,
    email: row.email,
    name: row.display_name,
    role: row.role,
    membershipStatus: membership(row.membership_status),
    membershipExpiresAt: row.membership_expires_at ? iso(row.membership_expires_at) : null,
    trialApproved: row.trial_approved,
    trialUsed: row.trial_used,
  };
}

function itemFromRow(row: QueryResultRow): MonitorItem {
  return {
    id: row.id,
    projectId: row.project_id,
    enabled: row.enabled,
    category: row.category,
    productType: row.product_type === "OWN" ? "自有" : "竞品",
    childAsin: row.child_asin.trim(),
    parentAsin: row.parent_asin?.trim() || null,
    productName: row.product_name,
    keyword: row.keyword,
    sameParentMatch: row.same_parent_match,
    notes: row.notes,
  };
}

function projectFromRow(row: QueryResultRow, items: MonitorItem[]): Project {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    marketplace: "Amazon.com（美国站）",
    zipCode: row.zip_code.trim(),
    scanDepth: number(row.scan_depth) as 1 | 2 | 3,
    viewport: "1920×1080 / 100% / DPR 1",
    rankingPolicy: "广告排除后的自然行",
    dimensions: row.dimensions as CollectionDimensions,
    items,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function resultFromRow(row: QueryResultRow, displayRunId: string): RankResult {
  const distribution = row.rating_distribution;
  return {
    id: row.id,
    runId: displayRunId,
    projectId: row.project_id,
    monitorItemId: row.monitor_item_id,
    category: row.category,
    productType: row.product_type === "OWN" ? "自有" : "竞品",
    childAsin: row.child_asin.trim(),
    displayedAsin: row.displayed_asin?.trim() || null,
    keyword: row.keyword,
    state: row.state === "COMPLETED" ? "已完成" : row.state === "NOT_FOUND" ? "暂无" : "未完成",
    naturalPage: row.natural_page,
    naturalRow: row.natural_row,
    naturalColumn: row.natural_column,
    naturalOrdinal: row.natural_ordinal,
    matchType: row.match_type === "DIRECT" ? "直接命中" : row.match_type === "SAME_PARENT" ? "同父体命中" : null,
    priceUsd: row.price_usd === null ? null : number(row.price_usd),
    coupon: row.coupon,
    monthlySales: row.monthly_sales_text,
    stock: row.stock_text,
    seller: row.seller,
    rating: row.rating === null ? null : number(row.rating),
    ratingCount: row.rating_count === null ? null : number(row.rating_count),
    ratingDistribution: typeof distribution === "string" ? distribution : distribution?.text || null,
    note: row.note,
    observedAt: row.observed_at ? iso(row.observed_at) : null,
  };
}

function status(value: string): MonitorRun["status"] {
  return ({ QUEUED: "等待中", RUNNING: "执行中", PARTIAL: "部分完成", COMPLETED: "已完成", INCOMPLETE: "未完成", CANCELLED: "已取消" } as const)[value as "QUEUED"] || "未完成";
}

function runFromRow(row: QueryResultRow, results: RankResult[]): MonitorRun {
  return {
    id: row.display_id,
    userId: row.user_id,
    projectId: row.project_id,
    status: status(row.status),
    progress: row.progress,
    estimatedPoints: number(row.estimated_points),
    frozenPoints: number(row.frozen_points),
    consumedPoints: number(row.consumed_points),
    refundedPoints: number(row.refunded_points),
    requestedAt: iso(row.requested_at),
    startedAt: row.started_at ? iso(row.started_at) : null,
    completedAt: row.completed_at ? iso(row.completed_at) : null,
    receipt: row.receipt,
    results,
    error: row.error,
  };
}

function rateFromRow(row: QueryResultRow): RateConfig {
  return {
    version: row.version,
    searchPage: number(row.search_page_points),
    detailPage: number(row.detail_page_points),
    ratingSubject: number(row.rating_subject_points),
    effectiveAt: iso(row.effective_at),
  };
}

async function ensureInitialAdmin() {
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLocaleLowerCase("en-US");
  if (!email) throw new Error("生产环境必须配置 INITIAL_ADMIN_EMAIL");
  const name = process.env.INITIAL_ADMIN_NAME?.trim() || "管理员";
  const points = Math.max(0, Number(process.env.INITIAL_ADMIN_POINTS || 0));
  await transaction(async (client) => {
    const inserted = await client.query<{ id: string }>(`
      INSERT INTO users(email, display_name, role, membership_status, trial_approved, trial_used)
      VALUES ($1, $2, 'ADMIN', 'ACTIVE', true, true)
      ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, role = 'ADMIN', membership_status = 'ACTIVE', trial_approved = true, updated_at = now()
      RETURNING id
    `, [email, name]);
    const userId = inserted.rows[0].id;
    await client.query(`INSERT INTO wallets(user_id, available_points) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`, [userId, points]);
    const project = await client.query(`SELECT id FROM projects WHERE owner_id = $1 LIMIT 1`, [userId]);
    if (!project.rowCount) {
      await client.query(`
        INSERT INTO projects(owner_id, name, zip_code, scan_depth, dimensions)
        VALUES ($1, '我的自然排名监控', '96038', 1, $2::jsonb)
      `, [userId, JSON.stringify(defaultDimensions)]);
    }
    const costs = await client.query(`SELECT 1 FROM cost_center_entries LIMIT 1`);
    if (!costs.rowCount) {
      await client.query(`
        INSERT INTO cost_center_entries(category, period, amount_cny, usage_text, provider_status, source_text) VALUES
        ('HOSTING', to_char(now(), 'YYYY-MM'), null, '自托管 Web 与 Worker 运行成本', '待配置', '由管理员录入实际账单'),
        ('STORAGE', to_char(now(), 'YYYY-MM'), null, '运行凭证、导出与备份存储', '待配置', '按实际存储方案记录'),
        ('EMAIL', to_char(now(), 'YYYY-MM'), null, '登录验证码邮件', '待配置', '按实际 SMTP 提供商记录'),
        ('PLATFORM_AI', to_char(now(), 'YYYY-MM'), 0, 'AI 功能默认关闭', '不可用', '当前版本不调用模型 API')
      `);
    }
  });
}

export async function getAccountByEmail(emailValue: string) {
  await ensureInitialAdmin();
  const email = emailValue.trim().toLocaleLowerCase("en-US");
  const result = await databasePool().query(`SELECT * FROM users WHERE lower(email) = $1`, [email]);
  return result.rows[0] ? userFromRow(result.rows[0]) : null;
}

export async function getAccountById(userId: string) {
  await ensureInitialAdmin();
  const result = await databasePool().query(`SELECT * FROM users WHERE id = $1`, [userId]);
  return result.rows[0] ? userFromRow(result.rows[0]) : null;
}

export async function hasAdminCredential() {
  const result = await databasePool().query(`SELECT 1 FROM admin_credentials LIMIT 1`);
  return Boolean(result.rowCount);
}

export async function getAdminCredentialByUsername(usernameValue: string) {
  const username = usernameValue.trim().toLocaleLowerCase("en-US");
  const result = await databasePool().query(`
    SELECT ac.user_id, ac.username, ac.password_hash
    FROM admin_credentials ac JOIN users u ON u.id = ac.user_id
    WHERE lower(ac.username) = $1 AND u.role = 'ADMIN'
    LIMIT 1
  `, [username]);
  return result.rows[0] || null;
}

export async function createInitialAdminCredential(actor: StoreActor, usernameValue: string, passwordHash: string) {
  if (actor.role !== "ADMIN") throw new Error("需要管理员权限");
  const username = usernameValue.trim().toLocaleLowerCase("en-US");
  return transaction(async (client) => {
    const existing = await client.query(`SELECT 1 FROM admin_credentials LIMIT 1 FOR UPDATE`);
    if (existing.rowCount) throw new Error("管理员账号已经设置，请直接登录管理后台");
    const account = await client.query(`SELECT id FROM users WHERE id = $1 AND role = 'ADMIN' FOR UPDATE`, [actor.userId]);
    if (!account.rowCount) throw new Error("管理员账户不存在或已停用");
    await client.query(`INSERT INTO admin_credentials(user_id, username, password_hash) VALUES ($1, $2, $3)`, [actor.userId, username, passwordHash]);
    await client.query(`INSERT INTO audit_logs(actor_id, action, resource_type, resource_id, details) VALUES ($1::uuid, 'ADMIN_CREDENTIAL_CREATED', 'ADMIN_CREDENTIAL', $1::uuid::text, $2::jsonb)`, [actor.userId, JSON.stringify({ username })]);
    return { userId: actor.userId, username };
  });
}

async function loadProjects(actor: StoreActor) {
  const projectsResult = await databasePool().query(`SELECT * FROM projects WHERE owner_id = $1 ORDER BY updated_at DESC`, [actor.userId]);
  if (!projectsResult.rowCount) return [];
  const ids = projectsResult.rows.map((row) => row.id);
  const itemResult = await databasePool().query(`SELECT * FROM monitor_items WHERE project_id = ANY($1::uuid[]) ORDER BY created_at`, [ids]);
  return projectsResult.rows.map((row) => projectFromRow(row, itemResult.rows.filter((item) => item.project_id === row.id).map(itemFromRow)));
}

async function loadRuns(actor: StoreActor) {
  const runsResult = await databasePool().query(`SELECT * FROM monitor_runs WHERE user_id = $1 ORDER BY requested_at DESC LIMIT 100`, [actor.userId]);
  if (!runsResult.rowCount) return [];
  const ids = runsResult.rows.map((row) => row.id);
  const results = await databasePool().query(`
    SELECT rr.*, mi.category, mi.product_type
    FROM rank_results rr JOIN monitor_items mi ON mi.id = rr.monitor_item_id
    WHERE rr.run_id = ANY($1::uuid[]) ORDER BY rr.observed_at NULLS LAST, rr.id
  `, [ids]);
  return runsResult.rows.map((row) => runFromRow(row, results.rows.filter((result) => result.run_id === row.id).map((result) => resultFromRow(result, row.display_id))));
}

function anonymousSnapshot(): AppSnapshot {
  return {
    meteringEnabled: isMeteringEnabled(),
    currentUser: { id: "anonymous", email: "", name: "访客", role: "USER", membershipStatus: "已到期", membershipExpiresAt: null, trialApproved: false, trialUsed: false },
    projects: [],
    wallet: { userId: "anonymous", available: 0, frozen: 0, consumed: 0, refunded: 0 },
    ledger: [], runs: [],
    rateConfig: { version: "rate-v1", searchPage: 1, detailPage: 1, ratingSubject: 1, effectiveAt: new Date(0).toISOString() },
    users: [], costCenter: [], providerCapabilities, credentials,
  };
}

export async function getSnapshot(actor: StoreActor | null): Promise<AppSnapshot> {
  await ensureInitialAdmin();
  if (!actor) return anonymousSnapshot();
  void dispatchPendingRuns().catch(() => null);
  const [account, projects, runs, walletResult, ledgerResult, rateResult, usersResult, costResult] = await Promise.all([
    getAccountById(actor.userId),
    loadProjects(actor),
    loadRuns(actor),
    databasePool().query(`SELECT * FROM wallets WHERE user_id = $1`, [actor.userId]),
    databasePool().query(`SELECT wl.*, coalesce(u.display_name, '系统') actor_name FROM wallet_ledger wl LEFT JOIN users u ON u.id = wl.actor_id WHERE wl.user_id = $1 ORDER BY wl.created_at DESC LIMIT 200`, [actor.userId]),
    databasePool().query(`SELECT * FROM rate_configs WHERE effective_at <= now() ORDER BY effective_at DESC LIMIT 1`),
    actor.role === "ADMIN" ? databasePool().query(`SELECT * FROM users ORDER BY created_at`) : databasePool().query(`SELECT * FROM users WHERE id = $1`, [actor.userId]),
    actor.role === "ADMIN" ? databasePool().query(`SELECT * FROM cost_center_entries ORDER BY period DESC, created_at DESC`) : Promise.resolve({ rows: [] }),
  ]);
  if (!account) throw new Error("账户不存在或已停用");
  const walletRow = walletResult.rows[0];
  const wallet: Wallet = walletRow ? { userId: actor.userId, available: number(walletRow.available_points), frozen: number(walletRow.frozen_points), consumed: number(walletRow.consumed_points), refunded: number(walletRow.refunded_points) } : { userId: actor.userId, available: 0, frozen: 0, consumed: 0, refunded: 0 };
  const ledger: WalletLedger[] = ledgerResult.rows.map((row) => ({
    id: row.id, userId: row.user_id,
    kind: ({ RECHARGE: "充值", FREEZE: "冻结", CONSUME: "消耗", REFUND: "退回", DEDUCT: "扣减" } as const)[row.kind as "RECHARGE"],
    amount: number(row.amount), balanceAfter: number(row.balance_after), referenceId: row.reference_id,
    reason: row.reason, actor: row.actor_name, createdAt: iso(row.created_at),
  }));
  const category = (value: string): CostCenterItem["category"] => ({ HOSTING: "云服务器", STORAGE: "对象存储", EMAIL: "邮件", PLATFORM_AI: "平台AI" } as const)[value as "HOSTING"];
  const providerStatus = (value: string): CostCenterItem["providerStatus"] => value === "正常" || value === "不可用" ? value : "待配置";
  return {
    meteringEnabled: isMeteringEnabled(),
    currentUser: account, projects, wallet, ledger, runs,
    rateConfig: rateFromRow(rateResult.rows[0]), users: usersResult.rows.map(userFromRow),
    costCenter: costResult.rows.map((row: QueryResultRow) => ({ id: row.id, category: category(row.category), period: row.period.trim(), amountCny: row.amount_cny === null ? null : number(row.amount_cny), usage: row.usage_text, providerStatus: providerStatus(row.provider_status), source: row.source_text })),
    providerCapabilities, credentials,
  };
}

export async function getProject(actor: StoreActor, id: string) {
  const project = await databasePool().query(`SELECT * FROM projects WHERE id = $1 AND owner_id = $2`, [id, actor.userId]);
  if (!project.rows[0]) return null;
  const items = await databasePool().query(`SELECT * FROM monitor_items WHERE project_id = $1 ORDER BY created_at`, [id]);
  return projectFromRow(project.rows[0], items.rows.map(itemFromRow));
}

export async function saveProject(actor: StoreActor, project: Project) {
  const result = await databasePool().query(`
    UPDATE projects SET name = $1, zip_code = $2, scan_depth = $3, dimensions = $4::jsonb, updated_at = now()
    WHERE id = $5 AND owner_id = $6 RETURNING *
  `, [project.name, project.zipCode, project.scanDepth, JSON.stringify(project.dimensions), project.id, actor.userId]);
  if (!result.rows[0]) throw new Error("项目不存在或无权访问");
  return projectFromRow(result.rows[0], project.items);
}

type ItemInput = Omit<MonitorItem, "id" | "projectId" | "enabled">;

async function assertProject(client: PoolClient, actor: StoreActor, projectId: string) {
  const project = await client.query(`SELECT * FROM projects WHERE id = $1 AND owner_id = $2`, [projectId, actor.userId]);
  if (!project.rows[0]) throw new Error("项目不存在或无权访问");
  return project.rows[0];
}

export async function addProjectItem(actor: StoreActor, projectId: string, input: ItemInput) {
  return transaction(async (client) => {
    await assertProject(client, actor, projectId);
    const result = await client.query(`
      INSERT INTO monitor_items(project_id, enabled, category, product_type, child_asin, parent_asin, product_name, keyword, normalized_keyword, same_parent_match, notes)
      VALUES ($1, true, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (project_id, child_asin, normalized_keyword) DO UPDATE SET enabled = true, category = EXCLUDED.category, product_type = EXCLUDED.product_type, parent_asin = EXCLUDED.parent_asin, product_name = EXCLUDED.product_name, keyword = EXCLUDED.keyword, same_parent_match = EXCLUDED.same_parent_match, notes = EXCLUDED.notes, updated_at = now()
      RETURNING *
    `, [projectId, input.category, input.productType === "自有" ? "OWN" : "COMPETITOR", input.childAsin, input.parentAsin, input.productName, input.keyword, normalizeKeyword(input.keyword), input.sameParentMatch, input.notes]);
    await client.query(`UPDATE projects SET updated_at = now() WHERE id = $1`, [projectId]);
    return itemFromRow(result.rows[0]);
  });
}

export async function removeProjectItem(actor: StoreActor, projectId: string, itemId: string) {
  const result = await databasePool().query(`
    UPDATE monitor_items mi SET enabled = false, updated_at = now()
    FROM projects p WHERE mi.id = $1 AND mi.project_id = $2 AND p.id = mi.project_id AND p.owner_id = $3 RETURNING mi.*
  `, [itemId, projectId, actor.userId]);
  if (!result.rows[0]) throw new Error("监控项不存在或无权访问");
  return itemFromRow(result.rows[0]);
}

export async function importProjectItems(actor: StoreActor, projectId: string, rows: ItemInput[], mode: "append" | "replace") {
  return transaction(async (client) => {
    await assertProject(client, actor, projectId);
    const importedKeys: string[] = []; let added = 0; let updated = 0;
    for (const row of rows) {
      const normalized = normalizeKeyword(row.keyword); importedKeys.push(`${row.childAsin}::${normalized}`);
      const existing = await client.query(`SELECT id FROM monitor_items WHERE project_id = $1 AND child_asin = $2 AND normalized_keyword = $3`, [projectId, row.childAsin, normalized]);
      await client.query(`
        INSERT INTO monitor_items(project_id, enabled, category, product_type, child_asin, parent_asin, product_name, keyword, normalized_keyword, same_parent_match, notes)
        VALUES ($1, true, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (project_id, child_asin, normalized_keyword) DO UPDATE SET enabled = true, category = EXCLUDED.category, product_type = EXCLUDED.product_type, parent_asin = EXCLUDED.parent_asin, product_name = EXCLUDED.product_name, keyword = EXCLUDED.keyword, same_parent_match = EXCLUDED.same_parent_match, notes = EXCLUDED.notes, updated_at = now()
      `, [projectId, row.category, row.productType === "自有" ? "OWN" : "COMPETITOR", row.childAsin, row.parentAsin, row.productName, row.keyword, normalized, row.sameParentMatch, row.notes]);
      if (existing.rowCount) updated += 1; else added += 1;
    }
    let disabled = 0;
    if (mode === "replace") {
      const disabledResult = await client.query(`
        UPDATE monitor_items SET enabled = false, updated_at = now()
        WHERE project_id = $1 AND enabled = true AND (child_asin || '::' || normalized_keyword) <> ALL($2::text[])
      `, [projectId, importedKeys]);
      disabled = disabledResult.rowCount || 0;
    }
    await client.query(`UPDATE projects SET updated_at = now() WHERE id = $1`, [projectId]);
    return { added, updated, disabled, total: rows.length };
  });
}

export async function startRun(actor: StoreActor, projectId: string) {
  const created = await transaction(async (client) => {
    const projectRow = await assertProject(client, actor, projectId);
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [actor.userId]);
    const active = await client.query(`SELECT 1 FROM monitor_runs WHERE user_id = $1 AND status IN ('QUEUED','RUNNING') FOR UPDATE`, [actor.userId]);
    if (active.rowCount) throw new Error("每个用户同时只能执行一个任务");
    const itemResult = await client.query(`SELECT * FROM monitor_items WHERE project_id = $1 AND enabled = true ORDER BY created_at`, [projectId]);
    const items = itemResult.rows.map(itemFromRow);
    if (!items.length) throw new Error("请至少添加一个启用的 ASIN 与关键词");
    const rateResult = await client.query(`SELECT * FROM rate_configs WHERE effective_at <= now() ORDER BY effective_at DESC LIMIT 1`);
    const rate = rateFromRow(rateResult.rows[0]);
    const project = projectFromRow(projectRow, items);
    const estimate = estimatePoints(items, project.scanDepth, project.dimensions, rate);
    const meteringMode = resolveMeteringMode(process.env.METERING_MODE);
    const frozenPoints = billableEstimate(estimate.total, meteringMode);
    const walletResult = meteringMode === "wallet"
      ? await client.query(`SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE`, [actor.userId])
      : null;
    const wallet = walletResult?.rows[0];
    if (meteringMode === "wallet" && (!wallet || number(wallet.available_points) < frozenPoints)) throw new Error("可用点数不足，请联系管理员调整配额");
    const databaseRunId = randomUUID();
    const displayId = `RUN-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${databaseRunId.slice(0, 6).toUpperCase()}`;
    const receipt = { protocolVersion: "organic-rank-v3-web", marketplace: "amazon.com", zipCode: project.zipCode, viewport: "1920×1080", zoom: "100%", dpr: 1, locale: "en-US", signedIn: false, isolatedSession: true, scanDepth: project.scanDepth, rankingPolicy: "广告排除后的自然行", rateVersion: rate.version, meteringMode, workerVersion: process.env.WORKER_VERSION || "worker-0.2.0", adRankFieldsStored: false } as const;
    const progress = { searchCompleted: 0, searchTotal: estimate.searchPages, detailCompleted: 0, detailTotal: estimate.detailPages, ratingCompleted: 0, ratingTotal: estimate.ratingSubjects };
    await client.query(`
      INSERT INTO monitor_runs(id, display_id, user_id, project_id, status, progress, estimated_points, frozen_points, receipt, effective_date)
      VALUES ($1, $2, $3, $4, 'QUEUED', $5::jsonb, $6, $7, $8::jsonb, (now() AT TIME ZONE 'Asia/Shanghai')::date)
    `, [databaseRunId, displayId, actor.userId, projectId, JSON.stringify(progress), estimate.total, frozenPoints, JSON.stringify(receipt)]);
    if (meteringMode === "wallet") {
      if (!wallet) throw new Error("用户钱包不存在");
      const balanceAfter = number(wallet.available_points) - frozenPoints;
      await client.query(`UPDATE wallets SET available_points = available_points - $1, frozen_points = frozen_points + $1, updated_at = now() WHERE user_id = $2`, [frozenPoints, actor.userId]);
      await client.query(`INSERT INTO wallet_ledger(user_id, kind, amount, balance_after, reference_id, reason, idempotency_key) VALUES ($1, 'FREEZE', $2, $3, $4, '创建监控任务，冻结预计配额', $5)`, [actor.userId, -frozenPoints, balanceAfter, displayId, `run:${databaseRunId}:freeze`]);
    }
    const job: MonitorWorkerJob = { runId: databaseRunId, displayRunId: displayId, userId: actor.userId, projectId, projectName: project.name, zipCode: project.zipCode, scanDepth: project.scanDepth, dimensions: project.dimensions, items, receipt, evidenceDirectory: `/app/evidence/${databaseRunId}` };
    await client.query(`INSERT INTO run_outbox(run_id, payload) VALUES ($1, $2::jsonb)`, [databaseRunId, JSON.stringify(job)]);
    return { databaseRunId, displayId };
  });
  await dispatchPendingRuns().catch(() => null);
  const run = await getRun(actor, created.displayId);
  if (!run) throw new Error("任务创建后读取失败");
  return run;
}

export async function getRun(actor: StoreActor, id: string) {
  const runResult = await databasePool().query(`SELECT * FROM monitor_runs WHERE user_id = $1 AND (display_id = $2 OR id::text = $2)`, [actor.userId, id]);
  const row = runResult.rows[0];
  if (!row) return null;
  const results = await databasePool().query(`SELECT rr.*, mi.category, mi.product_type FROM rank_results rr JOIN monitor_items mi ON mi.id = rr.monitor_item_id WHERE rr.run_id = $1 ORDER BY rr.id`, [row.id]);
  return runFromRow(row, results.rows.map((result) => resultFromRow(result, row.display_id)));
}

export async function cancelRun(actor: StoreActor, id: string) {
  await transaction(async (client) => {
    const result = await client.query(`SELECT * FROM monitor_runs WHERE user_id = $1 AND (display_id = $2 OR id::text = $2) FOR UPDATE`, [actor.userId, id]);
    const run = result.rows[0];
    if (!run) throw new Error("任务不存在或无权访问");
    if (run.status === "RUNNING") {
      await client.query(`UPDATE monitor_runs SET cancel_requested = true WHERE id = $1`, [run.id]);
      return;
    }
    if (run.status !== "QUEUED") return;
    const refund = number(run.frozen_points);
    await client.query(`UPDATE monitor_runs SET status = 'CANCELLED', completed_at = now(), refunded_points = $1, cancel_requested = true WHERE id = $2`, [refund, run.id]);
    if (run.receipt?.meteringMode === "wallet" && refund > 0) {
      const wallet = await client.query(`SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE`, [actor.userId]);
      await client.query(`UPDATE wallets SET available_points = available_points + $1, frozen_points = greatest(0, frozen_points - $1), refunded_points = refunded_points + $1, updated_at = now() WHERE user_id = $2`, [refund, actor.userId]);
      await client.query(`INSERT INTO wallet_ledger(user_id, kind, amount, balance_after, reference_id, reason, idempotency_key) VALUES ($1, 'REFUND', $2, $3, $4, '任务取消，退回未执行配额', $5) ON CONFLICT (idempotency_key) DO NOTHING`, [actor.userId, refund, number(wallet.rows[0].available_points) + refund, run.display_id, `run:${run.id}:refund`]);
    }
    await client.query(`DELETE FROM run_outbox WHERE run_id = $1 AND delivered_at IS NULL`, [run.id]);
  });
  const run = await getRun(actor, id);
  if (!run) throw new Error("任务不存在");
  return run;
}

export async function adjustWallet(actor: StoreActor, userId: string, amount: number, reason: string) {
  if (!isMeteringEnabled()) throw new Error("钱包计量功能未启用");
  if (actor.role !== "ADMIN") throw new Error("需要管理员权限");
  return transaction(async (client) => {
    const wallet = await client.query(`SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE`, [userId]);
    if (!wallet.rows[0]) throw new Error("用户钱包不存在");
    const next = number(wallet.rows[0].available_points) + amount;
    if (next < 0) throw new Error("扣减后可用点数不能为负数");
    await client.query(`UPDATE wallets SET available_points = $1, updated_at = now() WHERE user_id = $2`, [next, userId]);
    await client.query(`INSERT INTO wallet_ledger(user_id, kind, amount, balance_after, reason, actor_id, idempotency_key) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [userId, amount > 0 ? "RECHARGE" : "DEDUCT", amount, next, reason, actor.userId, `admin:${actor.userId}:${randomUUID()}`]);
    await client.query(`INSERT INTO audit_logs(actor_id, action, resource_type, resource_id, details) VALUES ($1, 'WALLET_ADJUST', 'wallet', $2, $3::jsonb)`, [actor.userId, userId, JSON.stringify({ amount, reason })]);
    return { userId, available: next, frozen: number(wallet.rows[0].frozen_points), consumed: number(wallet.rows[0].consumed_points), refunded: number(wallet.rows[0].refunded_points) } satisfies Wallet;
  });
}

declare global {
  var __rankMonitorQueueConnection: IORedis | undefined;
  var __rankMonitorQueue: Queue<MonitorWorkerJob> | undefined;
}

function queue() {
  if (!process.env.REDIS_URL) throw new Error("生产队列必须配置 REDIS_URL");
  globalThis.__rankMonitorQueueConnection ??= new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  globalThis.__rankMonitorQueue ??= new Queue<MonitorWorkerJob>("monitor-runs", { connection: globalThis.__rankMonitorQueueConnection });
  return globalThis.__rankMonitorQueue;
}

export async function dispatchPendingRuns() {
  const pending = await databasePool().query(`SELECT run_id, payload FROM run_outbox WHERE delivered_at IS NULL ORDER BY created_at LIMIT 20`);
  for (const row of pending.rows) {
    try {
      await queue().add("monitor", row.payload as MonitorWorkerJob, { jobId: row.run_id, attempts: 1, removeOnComplete: 100, removeOnFail: 100 });
      await databasePool().query(`UPDATE run_outbox SET delivered_at = now(), attempts = attempts + 1, last_error = null WHERE run_id = $1`, [row.run_id]);
    } catch (error) {
      await databasePool().query(`UPDATE run_outbox SET attempts = attempts + 1, last_error = $2 WHERE run_id = $1`, [row.run_id, error instanceof Error ? error.message : String(error)]);
      throw error;
    }
  }
}
