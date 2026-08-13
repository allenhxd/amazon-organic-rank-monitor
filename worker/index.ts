import fs from "node:fs/promises";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { runAmazonMonitor } from "./amazon-monitor";
import type { MonitorWorkerJob } from "./types";
import { failUnsettledRun, markRunStarted, persistProgress, settleRun, shouldCancelRun } from "./persistence";

async function runFile(filePath: string) {
  const job = JSON.parse(await fs.readFile(filePath, "utf8")) as MonitorWorkerJob;
  const output = await runAmazonMonitor(job, { onProgress: (progress) => { process.stdout.write(`${JSON.stringify({ type: "progress", progress })}\n`); } });
  process.stdout.write(`${JSON.stringify({ type: "result", output })}\n`);
}

const fileFlag = process.argv.indexOf("--job");
if (fileFlag >= 0 && process.argv[fileFlag + 1]) {
  await runFile(process.argv[fileFlag + 1]);
} else if (process.env.REDIS_URL) {
  const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  const worker = new Worker<MonitorWorkerJob>("monitor-runs", async (job) => {
    const started = await markRunStarted(job.data.runId);
    if (!started) return { skipped: true };
    try {
      const output = await runAmazonMonitor(job.data, {
        onProgress: async (progress) => { await Promise.all([job.updateProgress(progress), persistProgress(job.data.runId, progress)]); },
        shouldCancel: () => shouldCancelRun(job.data.runId),
      });
      await settleRun(job.data, output);
      return output;
    } catch (error) {
      await failUnsettledRun(job.data, error);
      throw error;
    }
  }, { connection, concurrency: Number(process.env.WORKER_CONCURRENCY || 1) });
  worker.on("completed", (job) => process.stdout.write(`${JSON.stringify({ type: "completed", jobId: job.id })}\n`));
  worker.on("failed", (job, error) => process.stderr.write(`${JSON.stringify({ type: "failed", jobId: job?.id, error: error.message })}\n`));
} else {
  process.stderr.write("请设置 REDIS_URL，或使用 pnpm worker -- --job <job.json>。\n");
  process.exitCode = 1;
}
