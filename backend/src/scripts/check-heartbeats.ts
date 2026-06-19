import { checkWorkerHeartbeats } from "../services/heartbeat-monitor";

function positiveIntEnv(name: string, fallback: number): number {
  const value = parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

try {
  const result = await checkWorkerHeartbeats({
    apiBaseUrl: process.env.API_BASE_URL ?? "",
    operationsToken: process.env.OPERATIONS_API_TOKEN ?? "",
    timeoutMs: positiveIntEnv("HEARTBEAT_MONITOR_TIMEOUT_MS", 30_000),
  });

  console.log(
    `[HeartbeatMonitor] Healthy: HTTP ${result.status}, staleCount=${result.staleCount}, generatedAt=${result.generatedAt}`
  );
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[HeartbeatMonitor] FAILED: ${message}`);
  process.exitCode = 1;
}
