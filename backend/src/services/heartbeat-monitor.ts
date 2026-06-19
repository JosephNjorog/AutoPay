type Fetcher = typeof fetch;

export type HeartbeatMonitorOptions = {
  apiBaseUrl: string;
  operationsToken: string;
  timeoutMs?: number;
  fetcher?: Fetcher;
};

export type HeartbeatMonitorResult = {
  endpoint: string;
  status: number;
  generatedAt: string;
  staleCount: 0;
};

type ParsedHeartbeatItem = {
  component: string;
  status: string;
  stale: boolean;
};

type ParsedHeartbeatReport = {
  ok: boolean;
  generatedAt: string;
  staleCount: number;
  items: ParsedHeartbeatItem[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseHeartbeatReport(value: unknown): ParsedHeartbeatReport | null {
  const root = asRecord(value);
  const data = asRecord(root?.data);
  if (!root || !data) return null;

  const generatedAt = data.generatedAt;
  const staleCount = data.staleCount;
  const rawItems = data.items;
  if (
    typeof root.ok !== "boolean" ||
    typeof generatedAt !== "string" ||
    typeof staleCount !== "number" ||
    !Number.isInteger(staleCount) ||
    !Array.isArray(rawItems)
  ) {
    return null;
  }

  const items: ParsedHeartbeatItem[] = [];
  for (const rawItem of rawItems) {
    const item = asRecord(rawItem);
    if (
      !item ||
      typeof item.component !== "string" ||
      typeof item.status !== "string" ||
      typeof item.stale !== "boolean"
    ) {
      return null;
    }
    items.push({
      component: item.component,
      status: item.status,
      stale: item.stale,
    });
  }

  return {
    ok: root.ok,
    generatedAt,
    staleCount,
    items,
  };
}

function apiErrorMessage(value: unknown): string | null {
  const root = asRecord(value);
  const error = root?.error;
  return typeof error === "string" && error.length > 0 ? error : null;
}

function staleSummary(report: ParsedHeartbeatReport): string {
  const components = report.items
    .filter((item) => item.stale || item.status !== "ok")
    .map((item) => `${item.component}(${item.status})`);

  return components.length > 0 ? components.join(", ") : "details unavailable";
}

export function heartbeatMonitorEndpoint(apiBaseUrl: string): string {
  const baseUrl = apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`;
  const endpoint = new URL("api/ops/health/heartbeats", baseUrl);
  endpoint.searchParams.set("staleOnly", "true");
  endpoint.searchParams.set("failOnStale", "true");
  return endpoint.toString();
}

export async function checkWorkerHeartbeats(
  options: HeartbeatMonitorOptions
): Promise<HeartbeatMonitorResult> {
  if (!options.apiBaseUrl.trim()) {
    throw new Error("API_BASE_URL is required for heartbeat monitoring");
  }
  if (!options.operationsToken.trim()) {
    throw new Error("OPERATIONS_API_TOKEN is required for heartbeat monitoring");
  }

  const endpoint = heartbeatMonitorEndpoint(options.apiBaseUrl);
  const timeoutMs = options.timeoutMs ?? 30_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Operations-Token": options.operationsToken,
        "X-Operator": "render-heartbeat-monitor",
      },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (controller.signal.aborted) {
      throw new Error(`Heartbeat endpoint timed out after ${timeoutMs}ms`);
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Heartbeat endpoint request failed: ${message}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    if (controller.signal.aborted) {
      throw new Error(`Heartbeat endpoint timed out after ${timeoutMs}ms`);
    }
    throw new Error(`Heartbeat endpoint returned non-JSON HTTP ${response.status}`);
  } finally {
    clearTimeout(timeout);
  }

  const report = parseHeartbeatReport(body);
  if (!response.ok) {
    if (report?.staleCount) {
      throw new Error(
        `Heartbeat endpoint returned HTTP ${response.status}: ${report.staleCount} stale component(s): ${staleSummary(report)}`
      );
    }

    const detail = apiErrorMessage(body);
    throw new Error(
      `Heartbeat endpoint returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`
    );
  }

  if (!report) {
    throw new Error("Heartbeat endpoint returned a malformed health report");
  }
  if (!report.ok || report.staleCount > 0) {
    throw new Error(
      `Heartbeat endpoint reported ${report.staleCount} stale component(s): ${staleSummary(report)}`
    );
  }

  return {
    endpoint,
    status: response.status,
    generatedAt: report.generatedAt,
    staleCount: 0,
  };
}
