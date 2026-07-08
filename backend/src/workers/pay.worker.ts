/**
 * Merchant Pay (Daraja B2B) disbursement worker.
 * Runs as a separate Bun process: `bun run src/workers/pay.worker.ts`
 * Pushes the confirmed KES amount to the merchant's Till/PayBill after the
 * user's on-chain stablecoin debit has been recorded.
 */

import { Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { transactions } from "../db/schema";
import { queueConnectionOptions, QUEUE_NAMES, type PayDisburseJob } from "../lib/queue";
import { recordSettlementStep } from "../services/settlement";
import { processPayB2BDisbursement } from "../services/pay-disbursement";
import { recordHeartbeat, startHeartbeatLoop } from "../services/worker-heartbeat";

const stopHeartbeat = startHeartbeatLoop("pay.worker");

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const worker = queueConnectionOptions
  ? new Worker<PayDisburseJob>(
      QUEUE_NAMES.PAY_B2B_DISBURSE,
      async (job: Job<PayDisburseJob>) => {
        const data = job.data;
        const tx = await db.query.transactions.findFirst({
          where: eq(transactions.id, data.transactionId),
        });

        if (!tx) {
          console.warn(`[PayWorker] TX ${data.transactionId} not found — skipping`);
          return;
        }

        if (tx.status === "settled" || tx.status === "failed" || tx.status === "expired") {
          console.log(`[PayWorker] TX ${tx.id} already terminal (${tx.status})`);
          return;
        }

        if (tx.railReference && tx.status === "routed") {
          console.log(`[PayWorker] TX ${tx.id} already routed (${tx.railReference})`);
          return;
        }

        try {
          const result = await processPayB2BDisbursement(data);
          console.log(`[PayWorker] ✓ TX ${tx.id} routed to Daraja B2B ref=${result.railReference}`);
        } catch (err) {
          const attempts = job.opts.attempts ?? 1;
          if (job.attemptsMade + 1 >= attempts) {
            await recordSettlementStep(tx.id, "requires_review", {
              stage: "pay_b2b_disbursement",
              error: errorMessage(err),
              payMethod: data.payMethod,
              merchantNumber: data.merchantNumber,
              amountKes: data.amountKes,
              reference: data.reference,
              bullJobId: job.id,
              attemptsMade: job.attemptsMade + 1,
              attempts,
            });
          }
          throw err;
        }
      },
      {
        connection: queueConnectionOptions,
        concurrency: 5,
      }
    )
  : null;

if (worker) {
  worker.on("ready", () => {
    console.log("[PayWorker] Ready — consuming Merchant Pay B2B disbursements");
    void recordHeartbeat({
      component: "pay.worker",
      kind: "worker",
      metadata: { state: "ready" },
    });
  });

  worker.on("failed", (job, err) => {
    console.error(`[PayWorker] Job ${job?.id} failed:`, err.message);
    void recordHeartbeat({
      component: "pay.worker",
      kind: "worker",
      status: "error",
      error: err.message,
      metadata: { jobId: job?.id },
    });
  });
} else {
  console.warn("[PayWorker] REDIS_URL not set — Pay disbursement worker disabled");
  void recordHeartbeat({
    component: "pay.worker",
    kind: "worker",
    status: "error",
    error: "REDIS_URL is not configured",
    metadata: { state: "disabled" },
  });
}

process.on("SIGTERM", async () => {
  stopHeartbeat();
  await worker?.close();
  process.exit(0);
});
