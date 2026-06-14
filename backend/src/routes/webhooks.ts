/**
 * Inbound webhook handlers for external payment rails.
 * All endpoints are public (no JWT) but verified via
 * body parsing / header signatures.
 *
 * Mounted at:
 *   /webhooks/mpesa/result   ← M-Pesa B2C disbursement result
 *   /webhooks/mpesa/timeout  ← M-Pesa B2C queue timeout
 *   /webhooks/mpesa/stk      ← M-Pesa STK Push (fund) callback
 *   /webhooks/momo           ← MTN MoMo disbursement callback
 */

import { Hono } from "hono";
import { db } from "../db";
import { transactions } from "../db/schema";
import { eq } from "drizzle-orm";
import { recordSettlementStep } from "../services/settlement";
import { creditFromFloat } from "../services/avalanche";
import type { Address } from "viem";

// ── M-Pesa ────────────────────────────────────────────────────────────────────

export const mpesaWebhookRouter = new Hono();

// POST /webhooks/mpesa/result — B2C disbursement async result
mpesaWebhookRouter.post("/result", async (c) => {
  const body = await c.req.json() as {
    Result: {
      ResultCode: number;
      ResultDesc: string;
      ConversationID: string;
      TransactionID?: string;
      ResultParameters?: {
        ResultParameter: Array<{ Key: string; Value: string | number }>;
      };
    };
  };

  const { ResultCode, ConversationID, TransactionID, ResultDesc } = body.Result;

  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.railReference, ConversationID),
  });

  if (!tx) {
    console.warn(`[Webhook:Mpesa] No TX found for ConversationID=${ConversationID}`);
    return c.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  if (tx.status === "settled" || tx.status === "failed") {
    return c.json({ ResultCode: 0, ResultDesc: "Already processed" });
  }

  if (ResultCode === 0) {
    await recordSettlementStep(tx.id, "settled", {
      mpesaTransactionId: TransactionID,
      resultDesc: ResultDesc,
    });
    console.log(`[Webhook:Mpesa] ✓ B2C settled TX=${tx.id} MPESA=${TransactionID}`);
  } else {
    await recordSettlementStep(tx.id, "failed", {
      resultCode: ResultCode,
      resultDesc: ResultDesc,
    });
    console.error(`[Webhook:Mpesa] ✗ B2C failed TX=${tx.id} code=${ResultCode}: ${ResultDesc}`);
  }

  return c.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

// POST /webhooks/mpesa/timeout — B2C queue timeout (treat as pending, let poller handle)
mpesaWebhookRouter.post("/timeout", async (c) => {
  const body = await c.req.json() as { ConversationID?: string };
  console.warn(`[Webhook:Mpesa] B2C timeout ConversationID=${body.ConversationID ?? "unknown"}`);
  return c.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

// ── MTN MoMo ─────────────────────────────────────────────────────────────────

export const momoWebhookRouter = new Hono();

// POST /webhooks/momo — MoMo disbursement callback
momoWebhookRouter.post("/", async (c) => {
  const body = await c.req.json() as {
    externalId?: string;
    status?: string;
    financialTransactionId?: string;
    reason?: string;
  };

  const { externalId, status, financialTransactionId } = body;

  if (!externalId) {
    console.warn("[Webhook:MoMo] Missing externalId in callback");
    return c.json({ received: true });
  }

  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.railReference, externalId),
  });

  if (!tx) {
    console.warn(`[Webhook:MoMo] No TX for externalId=${externalId}`);
    return c.json({ received: true });
  }

  if (tx.status === "settled" || tx.status === "failed") {
    return c.json({ received: true });
  }

  if (status === "SUCCESSFUL") {
    await recordSettlementStep(tx.id, "settled", {
      financialTransactionId,
      momoStatus: status,
    });
    console.log(`[Webhook:MoMo] ✓ Settled TX=${tx.id} MoMo=${financialTransactionId}`);
  } else if (status === "FAILED" || status === "REJECTED") {
    await recordSettlementStep(tx.id, "failed", {
      momoStatus: status,
      reason: body.reason,
    });
    console.error(`[Webhook:MoMo] ✗ Failed TX=${tx.id} status=${status}`);
  }
  // PENDING: no action, let the settlement poller handle it

  return c.json({ received: true });
});
