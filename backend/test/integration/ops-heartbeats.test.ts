import { describe, expect, test } from "bun:test";
import { db } from "../../src/db";
import { workerHeartbeats } from "../../src/db/schema";
import { expectedHeartbeats } from "../../src/services/heartbeat-status";
import {
  apiFetch,
  installIntegrationHooks,
  opsHeaders,
} from "./harness";

installIntegrationHooks();

describe("ops heartbeat visibility", () => {
  test("requires the operations token", async () => {
    const res = await apiFetch(
      "/api/ops/health/heartbeats?staleOnly=true&failOnStale=true"
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      ok: false,
      code: "AUTH_ERROR",
    });
  });

  test("returns 503 when expected workers or scanners are missing", async () => {
    const res = await apiFetch(
      "/api/ops/health/heartbeats?staleOnly=true&failOnStale=true",
      { headers: opsHeaders() }
    );
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.data.staleCount).toBeGreaterThanOrEqual(1);
    expect(
      body.data.items.some(
        (item: { component: string; status: string }) =>
          item.component === "rail.worker" && item.status === "missing"
      )
    ).toBe(true);
  });

  test("returns 200 when every expected component is fresh", async () => {
    const now = new Date();
    await db.insert(workerHeartbeats).values(
      expectedHeartbeats().map((heartbeat) => ({
        component: heartbeat.component,
        kind: heartbeat.kind,
        status: "ok",
        staleAfterSeconds: heartbeat.staleAfterSeconds,
        lastHeartbeatAt: now,
        lastStartedAt: now,
        lastSuccessAt: now,
        metadata: { state: "alive" },
      }))
    );

    const res = await apiFetch(
      "/api/ops/health/heartbeats?staleOnly=true&failOnStale=true",
      { headers: opsHeaders() }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.staleCount).toBe(0);
    expect(body.data.items).toHaveLength(0);
  });
});
