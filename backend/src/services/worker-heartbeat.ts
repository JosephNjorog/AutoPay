import { db } from "../db";
import { workerHeartbeats } from "../db/schema";
import {
  buildHeartbeatStatusReport,
  heartbeatIntervalMs,
  scannerStaleAfterSeconds,
  workerStaleAfterSeconds,
  type HeartbeatKind,
  type HeartbeatRecordInput,
  type HeartbeatStatusReport,
} from "./heartbeat-status";

export type { HeartbeatStatusItem, HeartbeatStatusReport } from "./heartbeat-status";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function recordHeartbeat(
  input: HeartbeatRecordInput
): Promise<void> {
  const now = new Date();
  const status = input.status ?? "ok";
  const staleAfterSeconds =
    input.staleAfterSeconds ??
    (input.kind === "scanner"
      ? scannerStaleAfterSeconds()
      : workerStaleAfterSeconds());
  const lastError = status === "error" ? input.error ?? null : null;

  try {
    await db
      .insert(workerHeartbeats)
      .values({
        component: input.component,
        kind: input.kind,
        status,
        staleAfterSeconds,
        lastHeartbeatAt: now,
        lastStartedAt: input.started ? now : null,
        lastSuccessAt: status === "ok" ? now : null,
        lastFailureAt: status === "error" ? now : null,
        lastError,
        metadata: input.metadata ?? null,
      })
      .onConflictDoUpdate({
        target: workerHeartbeats.component,
        set: {
          kind: input.kind,
          status,
          staleAfterSeconds,
          lastHeartbeatAt: now,
          ...(input.started ? { lastStartedAt: now } : {}),
          ...(status === "ok" ? { lastSuccessAt: now } : {}),
          ...(status === "error" ? { lastFailureAt: now } : {}),
          lastError,
          metadata: input.metadata ?? null,
          updatedAt: now,
        },
      });
  } catch (err) {
    console.error(
      `[Heartbeat] Failed to record ${input.component}:`,
      errorMessage(err)
    );
  }
}

export function startHeartbeatLoop(
  component: string,
  kind: HeartbeatKind = "worker",
  metadata?: Record<string, unknown>
): () => void {
  void recordHeartbeat({
    component,
    kind,
    started: true,
    metadata: { ...(metadata ?? {}), state: "started" },
  });

  const timer = setInterval(() => {
    void recordHeartbeat({
      component,
      kind,
      metadata: { ...(metadata ?? {}), state: "alive" },
    });
  }, heartbeatIntervalMs());

  return () => clearInterval(timer);
}

export async function listHeartbeatStatus(
  staleOnly = false
): Promise<HeartbeatStatusReport> {
  const rows = await db.query.workerHeartbeats.findMany();
  return buildHeartbeatStatusReport(rows, staleOnly);
}
