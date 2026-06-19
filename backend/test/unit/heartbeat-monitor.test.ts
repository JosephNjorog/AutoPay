import { describe, expect, test } from "bun:test";
import {
  checkWorkerHeartbeats,
  heartbeatMonitorEndpoint,
} from "../../src/services/heartbeat-monitor";

const API_BASE_URL = "https://tumabackendservice.onrender.com";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("heartbeat monitor", () => {
  test("builds the protected stale-only endpoint", () => {
    expect(heartbeatMonitorEndpoint(`${API_BASE_URL}/`)).toBe(
      `${API_BASE_URL}/api/ops/health/heartbeats?staleOnly=true&failOnStale=true`
    );
  });

  test("accepts a valid healthy report and sends operations authentication", async () => {
    let receivedUrl = "";
    let receivedHeaders = new Headers();
    const fetcher = (async (input, init) => {
      receivedUrl = String(input);
      receivedHeaders = new Headers(init?.headers);
      return jsonResponse({
        ok: true,
        data: {
          generatedAt: "2026-06-19T09:00:00.000Z",
          staleCount: 0,
          items: [],
        },
      });
    }) as typeof fetch;

    const result = await checkWorkerHeartbeats({
      apiBaseUrl: API_BASE_URL,
      operationsToken: "test-ops-token",
      fetcher,
    });

    expect(receivedUrl).toBe(heartbeatMonitorEndpoint(API_BASE_URL));
    expect(receivedHeaders.get("X-Operations-Token")).toBe("test-ops-token");
    expect(receivedHeaders.get("X-Operator")).toBe(
      "render-heartbeat-monitor"
    );
    expect(result).toEqual({
      endpoint: heartbeatMonitorEndpoint(API_BASE_URL),
      status: 200,
      generatedAt: "2026-06-19T09:00:00.000Z",
      staleCount: 0,
    });
  });

  test("fails with stale component names when the endpoint returns 503", async () => {
    const fetcher = (async () =>
      jsonResponse(
        {
          ok: false,
          data: {
            generatedAt: "2026-06-19T09:00:00.000Z",
            staleCount: 2,
            items: [
              { component: "rail.worker", status: "missing", stale: true },
              {
                component: "scanner.expired_escrows",
                status: "error",
                stale: true,
              },
            ],
          },
        },
        503
      )) as typeof fetch;

    await expect(
      checkWorkerHeartbeats({
        apiBaseUrl: API_BASE_URL,
        operationsToken: "test-ops-token",
        fetcher,
      })
    ).rejects.toThrow(
      "HTTP 503: 2 stale component(s): rail.worker(missing), scanner.expired_escrows(error)"
    );
  });

  test("fails closed on unauthorized and malformed responses", async () => {
    const unauthorized = (async () =>
      jsonResponse(
        { ok: false, code: "AUTH_ERROR", error: "Invalid operations token" },
        401
      )) as typeof fetch;
    const malformed = (async () =>
      jsonResponse({ ok: true, data: { staleCount: 0 } })) as typeof fetch;

    await expect(
      checkWorkerHeartbeats({
        apiBaseUrl: API_BASE_URL,
        operationsToken: "bad-token",
        fetcher: unauthorized,
      })
    ).rejects.toThrow("HTTP 401: Invalid operations token");

    await expect(
      checkWorkerHeartbeats({
        apiBaseUrl: API_BASE_URL,
        operationsToken: "test-ops-token",
        fetcher: malformed,
      })
    ).rejects.toThrow("malformed health report");
  });

  test("fails when the heartbeat endpoint exceeds the monitor timeout", async () => {
    const fetcher = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new Error("aborted"));
        });
      })) as typeof fetch;

    await expect(
      checkWorkerHeartbeats({
        apiBaseUrl: API_BASE_URL,
        operationsToken: "test-ops-token",
        timeoutMs: 5,
        fetcher,
      })
    ).rejects.toThrow("timed out after 5ms");
  });
});
