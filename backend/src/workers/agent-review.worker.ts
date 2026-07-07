/**
 * Agent-review worker.
 * Runs as a separate Bun process: `bun run src/workers/agent-review.worker.ts`
 * Consumes anomaly-flagged agent-transaction events (see
 * services/agent-permissions.ts's evaluateAgentTransaction) and persists
 * them for human review rather than auto-blocking.
 */

import { Worker, type Job } from "bullmq";
import { queueConnectionOptions, QUEUE_NAMES, type AgentReviewJob } from "../lib/queue";
import { db } from "../db";
import { agentReviewEvents, agentAuditLog } from "../db/schema";
import {
  recordHeartbeat,
  startHeartbeatLoop,
} from "../services/worker-heartbeat";

const stopHeartbeat = startHeartbeatLoop("agent-review.worker");

const worker = queueConnectionOptions
  ? new Worker<AgentReviewJob>(
      QUEUE_NAMES.AGENT_REVIEW,
      async (job: Job<AgentReviewJob>) => {
        const { userId, reason, detail } = job.data;

        await db.insert(agentReviewEvents).values({ userId, reason, detail: detail ?? null });
        await db.insert(agentAuditLog).values({
          userId,
          eventType: "anomaly_flagged",
          detail: { reason, ...detail },
        });

        console.log(`[AgentReviewWorker] Flagged user=${userId}: ${reason}`);
      },
      {
        connection: queueConnectionOptions,
        concurrency: 10,
      }
    )
  : null;

if (worker) {
  worker.on("failed", (job, err) => {
    console.error(`[AgentReviewWorker] Job ${job?.id} failed permanently:`, err.message);
    void recordHeartbeat({
      component: "agent-review.worker",
      kind: "worker",
      status: "error",
      error: err.message,
      metadata: { jobId: job?.id },
    });
  });

  worker.on("ready", () => {
    console.log("[AgentReviewWorker] Ready — consuming flagged agent-transaction events");
    void recordHeartbeat({
      component: "agent-review.worker",
      kind: "worker",
      metadata: { state: "ready" },
    });
  });
} else {
  console.warn("[AgentReviewWorker] REDIS_URL not set — agent review worker disabled");
  void recordHeartbeat({
    component: "agent-review.worker",
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
