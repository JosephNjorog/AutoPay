/**
 * Inbound webhook handlers for external payment rails.
 * All endpoints are public (no JWT) but verified via
 * body parsing / header signatures.
 *
 * Mounted at:
 *   /webhooks/mpesa/result       ← M-Pesa B2C disbursement result
 *   /webhooks/mpesa/timeout      ← M-Pesa B2C queue timeout
 *   /webhooks/mpesa/stk          ← M-Pesa STK Push (fund) callback
 *   /webhooks/mpesa/b2b/result   ← Merchant Pay (Daraja B2B) result
 *   /webhooks/mpesa/b2b/timeout  ← Merchant Pay (Daraja B2B) queue timeout
 *   /webhooks/momo               ← MTN MoMo disbursement callback
 *   /webhooks/pretium/offramp     ← Pretium send/withdraw/pay payout callback
 *   /webhooks/pretium/onramp      ← Pretium funding (add money) callback
 */

import { Hono } from "hono";
import { db } from "../db";
import { transactions, users } from "../db/schema";
import { eq } from "drizzle-orm";
import { recordSettlementStep } from "../services/settlement";
import { creditPayFromFloat } from "../services/avalanche-pay";
import { pretiumProvider } from "../services/settlement-providers/pretium";
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

// POST /webhooks/mpesa/b2b/result — Merchant Pay (Till/PayBill) async result.
// A ResultCode != 0 here is an unambiguous "the KES never reached the
// merchant" — since the on-chain stablecoin debit already happened at
// initiate time, we auto-refund it once (guarded by refundTxHash so a
// retried/duplicate callback can't double-refund) and mark the transaction
// requires_review so it stays visible rather than silently closed.
mpesaWebhookRouter.post("/b2b/result", async (c) => {
  const body = await c.req.json() as {
    Result: {
      ResultCode: number;
      ResultDesc: string;
      ConversationID: string;
      TransactionID?: string;
    };
  };

  const { ResultCode, ConversationID, TransactionID, ResultDesc } = body.Result;

  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.railReference, ConversationID),
  });

  if (!tx) {
    console.warn(`[Webhook:MpesaB2B] No TX found for ConversationID=${ConversationID}`);
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
    console.log(`[Webhook:MpesaB2B] ✓ Settled TX=${tx.id} MPESA=${TransactionID}`);
  } else {
    if (!tx.refundTxHash && tx.senderId) {
      try {
        const sender = await db.query.users.findFirst({ where: eq(users.id, tx.senderId) });
        if (sender?.walletAddress) {
          const refundTxHash = await creditPayFromFloat(
            sender.walletAddress as Address,
            parseFloat(tx.amountUsdc)
          );
          await db
            .update(transactions)
            .set({ refundTxHash, refundedAt: new Date() })
            .where(eq(transactions.id, tx.id));
          console.log(`[Webhook:MpesaB2B] ↩ Refunded TX=${tx.id} hash=${refundTxHash}`);
        }
      } catch (refundErr) {
        console.error(
          `[Webhook:MpesaB2B] Refund failed for TX=${tx.id}:`,
          (refundErr as Error).message
        );
      }
    }

    await recordSettlementStep(tx.id, "requires_review", {
      stage: "pay_b2b_result",
      resultCode: ResultCode,
      reason: ResultDesc,
    });
    console.error(`[Webhook:MpesaB2B] ✗ B2B failed TX=${tx.id} code=${ResultCode}: ${ResultDesc}`);
  }

  return c.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

// POST /webhooks/mpesa/b2b/timeout — Merchant Pay queue timeout (treat as pending)
mpesaWebhookRouter.post("/b2b/timeout", async (c) => {
  const body = await c.req.json() as { ConversationID?: string };
  console.warn(`[Webhook:MpesaB2B] Timeout ConversationID=${body.ConversationID ?? "unknown"}`);
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

// ── Pretium ──────────────────────────────────────────────────────────────────
// Pretium has no documented webhook signature scheme (see pretium.ts header
// comment) — Pretium's own docs describe webhooks as "at-least-once hints"
// and say to reconcile via the status API. So neither handler below trusts
// the webhook body for the actual credited amount/receipt: it only reads the
// tracking id off the payload, then re-fetches authoritative status via
// getOrder()/getOnrampSession() before recording anything as settled.

export const pretiumOfframpWebhookRouter = new Hono();

// POST /webhooks/pretium/offramp — send/withdraw/pay payout result
pretiumOfframpWebhookRouter.post("/", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("x-pretium-signature") ?? "";
  pretiumProvider.verifyWebhookSignature(rawBody, signature); // always true — see pretium.ts

  const hint = pretiumProvider.parseWebhookEvent(rawBody);

  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.railReference, hint.orderId),
  });

  if (!tx) {
    console.warn(`[Webhook:Pretium] No TX found for transaction_code=${hint.orderId}`);
    return c.json({ received: true });
  }

  if (tx.status === "settled" || tx.status === "failed") {
    return c.json({ received: true });
  }

  const order = await pretiumProvider.getOrder(hint.orderId);

  if (order.status === "completed") {
    await recordSettlementStep(tx.id, "settled", {
      orderId: order.orderId,
      settlementReceipt: order.settlementReceipt,
    });
    console.log(`[Webhook:Pretium] ✓ Payout settled TX=${tx.id} order=${order.orderId}`);
  } else if (order.status === "failed" || order.status === "expired") {
    await recordSettlementStep(tx.id, "failed", {
      orderId: order.orderId,
      reason: `Pretium reported "${order.status}"`,
    });
    console.error(`[Webhook:Pretium] ✗ Payout ${order.status} TX=${tx.id} order=${order.orderId}`);
  }
  // pending/settling: no action, let the settlement poller handle it

  return c.json({ received: true });
});

export const pretiumOnrampWebhookRouter = new Hono();

// POST /webhooks/pretium/onramp — funding (add money) collection result
pretiumOnrampWebhookRouter.post("/", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("x-pretium-signature") ?? "";
  pretiumProvider.verifyOnrampWebhookSignature(rawBody, signature); // always true — see pretium.ts

  const hint = pretiumProvider.parseOnrampWebhookEvent(rawBody);

  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.railReference, hint.sessionId),
  });

  if (!tx) {
    console.warn(`[Webhook:Pretium] No TX found for onramp session=${hint.sessionId}`);
    return c.json({ received: true });
  }

  if (tx.status === "settled" || tx.status === "failed") {
    return c.json({ received: true });
  }

  const session = await pretiumProvider.getOnrampSession(hint.sessionId);

  if (session.status === "completed") {
    // The USDC amount at session-creation time was an estimate (Pretium's
    // onramp response doesn't always populate it up front — see pretium.ts)
    // — this is the authoritative, actually-settled figure, straight from
    // the same on-chain-backed status check, never an optimistic guess.
    if (session.amountUsdc > 0) {
      await db
        .update(transactions)
        .set({ amountUsdc: session.amountUsdc.toFixed(6), updatedAt: new Date() })
        .where(eq(transactions.id, tx.id));
    }
    await recordSettlementStep(tx.id, "settled", { sessionId: session.sessionId });
    console.log(`[Webhook:Pretium] ✓ Funding settled TX=${tx.id} session=${session.sessionId}`);
  } else if (session.status === "failed" || session.status === "expired") {
    await recordSettlementStep(tx.id, "failed", {
      sessionId: session.sessionId,
      reason: `Pretium reported "${session.status}"`,
    });
    console.error(`[Webhook:Pretium] ✗ Funding ${session.status} TX=${tx.id} session=${session.sessionId}`);
  }
  // pending/processing: no action, let the settlement poller handle it

  return c.json({ received: true });
});
