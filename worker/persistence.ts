import { Pool, type PoolClient } from "pg";
import type { MonitorWorkerJob, WorkerOutput } from "./types";
import { resolveMeteringMode, settleMetering } from "../src/domain/metering";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 4,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 8_000,
});

const number = (value: unknown) => Number(value || 0);

async function transaction<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => null);
    throw error;
  } finally { client.release(); }
}

export async function markRunStarted(runId: string) {
  const result = await pool.query(`
    UPDATE monitor_runs SET status = 'RUNNING', started_at = coalesce(started_at, now())
    WHERE id = $1 AND status IN ('QUEUED','RUNNING') AND cancel_requested = false RETURNING id
  `, [runId]);
  return Boolean(result.rowCount);
}

export async function persistProgress(runId: string, progress: WorkerOutput["progress"]) {
  await pool.query(`UPDATE monitor_runs SET progress = $2::jsonb WHERE id = $1 AND status = 'RUNNING'`, [runId, JSON.stringify(progress)]);
}

export async function shouldCancelRun(runId: string) {
  const result = await pool.query(`SELECT cancel_requested, status FROM monitor_runs WHERE id = $1`, [runId]);
  return !result.rows[0] || result.rows[0].cancel_requested || result.rows[0].status !== "RUNNING";
}

function databaseStatus(status: WorkerOutput["status"]) {
  return status === "已完成" ? "COMPLETED" : status === "部分完成" ? "PARTIAL" : status === "已取消" ? "CANCELLED" : "INCOMPLETE";
}

function resultState(value: string) {
  return value === "已完成" ? "COMPLETED" : value === "暂无" ? "NOT_FOUND" : "INCOMPLETE";
}

export async function settleRun(job: MonitorWorkerJob, output: WorkerOutput) {
  await transaction(async (client) => {
    const runResult = await client.query(`SELECT * FROM monitor_runs WHERE id = $1 FOR UPDATE`, [job.runId]);
    const run = runResult.rows[0];
    if (!run || ["COMPLETED", "PARTIAL", "INCOMPLETE", "CANCELLED"].includes(run.status)) return;
    await client.query(`DELETE FROM rank_results WHERE run_id = $1`, [job.runId]);
    for (const result of output.results) {
      await client.query(`
        INSERT INTO rank_results(id, run_id, project_id, monitor_item_id, state, child_asin, displayed_asin, keyword, natural_page, natural_row, natural_column, natural_ordinal, match_type, price_amount, price_currency, coupon, monthly_sales_text, stock_text, seller, rating, rating_count, rating_distribution, note, observed_at, audit)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22::jsonb, $23, $24, $25::jsonb)
      `, [result.id, job.runId, job.projectId, result.monitorItemId, resultState(result.state), result.childAsin, result.displayedAsin, result.keyword, result.naturalPage, result.naturalRow, result.naturalColumn, result.naturalOrdinal, result.matchType === "直接命中" ? "DIRECT" : result.matchType === "同父体命中" ? "SAME_PARENT" : null, result.priceAmount, result.currency, result.coupon, result.monthlySales, result.stock, result.seller, result.rating, result.ratingCount, result.ratingDistribution ? JSON.stringify({ text: result.ratingDistribution }) : null, result.note, result.observedAt, JSON.stringify({ category: result.category, productType: result.productType })]);
    }
    const rateResult = await client.query(`SELECT * FROM rate_configs WHERE version = $1`, [run.receipt.rateVersion]);
    const rate = rateResult.rows[0];
    const rateConfig = {
      version: rate.version,
      searchPage: number(rate.search_page_points),
      detailPage: number(rate.detail_page_points),
      ratingSubject: number(rate.rating_subject_points),
      effectiveAt: new Date(rate.effective_at).toISOString(),
    };
    const meteringMode = resolveMeteringMode(run.receipt?.meteringMode);
    const { consumedPoints: actual, refundedPoints: refund } = settleMetering(number(run.frozen_points), output.successfulRequests, rateConfig, meteringMode);
    const walletResult = meteringMode === "wallet"
      ? await client.query(`SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE`, [run.user_id])
      : null;
    const wallet = walletResult?.rows[0];
    if (meteringMode === "wallet") {
      const reservations = await client.query(`
        SELECT qr.*, ql.id lot_id FROM quota_reservations qr
        JOIN quota_lots ql ON ql.id = qr.quota_lot_id
        WHERE qr.run_id = $1 AND qr.settled_at IS NULL
        ORDER BY ql.expires_at ASC NULLS LAST, ql.created_at ASC
        FOR UPDATE OF qr, ql
      `, [job.runId]);
      let remainingActual = actual;
      for (const reservation of reservations.rows) {
        const reserved = number(reservation.reserved_amount);
        const consumed = Math.min(remainingActual, reserved);
        const returned = reserved - consumed;
        await client.query(`
          UPDATE quota_lots SET frozen_amount = greatest(0, frozen_amount - $1), available_amount = available_amount + $2, consumed_amount = consumed_amount + $3
          WHERE id = $4
        `, [reserved, returned, consumed, reservation.lot_id]);
        await client.query(`UPDATE quota_reservations SET consumed_amount = $3, refunded_amount = $4, settled_at = now() WHERE run_id = $1 AND quota_lot_id = $2`, [job.runId, reservation.lot_id, consumed, returned]);
        remainingActual -= consumed;
      }
      if (remainingActual > 0) throw new Error("任务实际消耗超过冻结的额度批次");
    }
    const terminalStatus = databaseStatus(output.status);
    const evidence = { pageEvidence: output.pageEvidence, familyEvidence: output.familyEvidence, successfulRequests: output.successfulRequests, captchaDetected: output.captchaDetected, adClickNavigationDetected: output.adClickNavigationDetected };
    await client.query(`
      UPDATE monitor_runs SET status = $2, progress = $3::jsonb, consumed_points = $4, refunded_points = $5,
        evidence = $6::jsonb, error = $7, started_at = coalesce(started_at, $8), completed_at = $9
      WHERE id = $1
    `, [job.runId, terminalStatus, JSON.stringify(output.progress), actual, refund, JSON.stringify(evidence), output.error, output.startedAt, output.completedAt]);
    if (meteringMode === "wallet") {
      await client.query(`
        UPDATE wallets SET available_points = available_points + $1, frozen_points = greatest(0, frozen_points - $2),
          consumed_points = consumed_points + $3, refunded_points = refunded_points + $1, updated_at = now()
        WHERE user_id = $4
      `, [refund, number(run.frozen_points), actual, run.user_id]);
    }
    if (meteringMode === "wallet" && actual > 0) {
      await client.query(`
        INSERT INTO wallet_ledger(user_id, kind, amount, balance_after, reference_id, reason, idempotency_key)
        VALUES ($1, 'CONSUME', $2, $3, $4, '监控任务按实际成功请求结算', $5) ON CONFLICT (idempotency_key) DO NOTHING
      `, [run.user_id, -actual, number(wallet?.available_points) + refund, run.display_id, `run:${job.runId}:consume`]);
    }
    if (meteringMode === "wallet" && refund > 0) {
      await client.query(`
        INSERT INTO wallet_ledger(user_id, kind, amount, balance_after, reference_id, reason, idempotency_key)
        VALUES ($1, 'REFUND', $2, $3, $4, '未执行请求监控额度自动退回', $5) ON CONFLICT (idempotency_key) DO NOTHING
      `, [run.user_id, refund, number(wallet?.available_points) + refund, run.display_id, `run:${job.runId}:refund`]);
    }
    if (terminalStatus === "COMPLETED") {
      await client.query(`UPDATE monitor_runs SET effective = false WHERE project_id = $1 AND effective_date = $2 AND id <> $3 AND effective = true`, [run.project_id, run.effective_date, job.runId]);
      await client.query(`UPDATE monitor_runs SET effective = true WHERE id = $1`, [job.runId]);
    }
    const successfulTotal = output.successfulRequests.searchPages + output.successfulRequests.detailPages + output.successfulRequests.ratingSubjects;
    if (run.receipt?.meteringMode === "trial" && successfulTotal === 0 && ["INCOMPLETE", "CANCELLED"].includes(terminalStatus)) {
      await client.query(`UPDATE users SET trial_used = false, updated_at = now() WHERE id = $1 AND membership_status = 'TRIAL'`, [run.user_id]);
      await client.query(`INSERT INTO audit_logs(actor_id, action, resource_type, resource_id, details) VALUES ($1, 'TRIAL_RESTORED', 'RUN', $2, $3::jsonb)`, [run.user_id, run.display_id, JSON.stringify({ reason: output.error || "所有页面均未成功" })]);
    }
  });
}

export async function failUnsettledRun(job: MonitorWorkerJob, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const output: WorkerOutput = {
    runId: job.runId, status: "未完成",
    progress: { searchCompleted: 0, searchTotal: 0, detailCompleted: 0, detailTotal: 0, ratingCompleted: 0, ratingTotal: 0 },
    results: job.items.filter((item) => item.enabled).map((item) => ({ id: crypto.randomUUID(), runId: job.runId, projectId: job.projectId, monitorItemId: item.id, category: item.category, productType: item.productType, childAsin: item.childAsin, displayedAsin: null, keyword: item.keyword, state: "未完成", naturalPage: null, naturalRow: null, naturalColumn: null, naturalOrdinal: null, matchType: null, priceAmount: null, currency: job.receipt.currency, coupon: null, monthlySales: null, stock: null, seller: null, rating: null, ratingCount: null, ratingDistribution: null, note: message, observedAt: null })),
    pageEvidence: [], familyEvidence: [], successfulRequests: { searchPages: 0, detailPages: 0, ratingSubjects: 0 },
    startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), captchaDetected: false, adClickNavigationDetected: false, error: message,
  };
  await settleRun(job, output);
}

export async function closePersistence() {
  await pool.end();
}
