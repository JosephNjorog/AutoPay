import { describe, expect, test } from "bun:test";
import { db } from "../../src/db";
import { settlementEvents, transactions } from "../../src/db/schema";
import {
  apiFetch,
  installIntegrationHooks,
  opsHeaders,
} from "./harness";

installIntegrationHooks();

async function createRailDeadLetter(): Promise<string> {
  const [tx] = await db
    .insert(transactions)
    .values({
      reference: "TUMA-RAIL-DL-1",
      recipientPhone: "+254712345678",
      amountUsdc: "10.000000",
      amountLocal: "1290.00",
      localCurrency: "KES",
      fxRate: "129.00000000",
      rail: "mpesa",
      status: "requires_review",
      failureStage: "rail_disbursement",
      failureReason: "Provider timeout after final retry",
      failedAt: new Date("2026-06-18T09:00:00.000Z"),
    })
    .returning({ id: transactions.id });

  await db.insert(settlementEvents).values({
    transactionId: tx.id,
    step: "requires_review",
    metadata: {
      stage: "rail_disbursement",
      providerIdempotencyKey: "22222222-2222-4222-8222-222222222222",
      attemptsMade: 3,
    },
  });

  return tx.id;
}

describe("rail dead-letter ops flow", () => {
  test("lists rail review items with stable provider idempotency metadata", async () => {
    const transactionId = await createRailDeadLetter();

    const res = await apiFetch("/api/ops/rail/dead-letter?page=1&limit=10", {
      headers: opsHeaders(),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.pagination.total).toBe(1);
    expect(body.data.items[0]).toMatchObject({
      transactionId,
      rail: "mpesa",
      failureStage: "rail_disbursement",
      providerIdempotencyKey: "22222222-2222-4222-8222-222222222222",
    });
  });

  test("queues a retry with the same provider idempotency key", async () => {
    const transactionId = await createRailDeadLetter();

    const res = await apiFetch(
      `/api/ops/rail/dead-letter/${transactionId}/retry`,
      {
        method: "POST",
        headers: opsHeaders(),
      }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({
      transactionId,
      mode: "queued",
      status: "queued",
      providerIdempotencyKey: "22222222-2222-4222-8222-222222222222",
    });
  });
});
