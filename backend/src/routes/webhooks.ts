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
 *   /webhooks/minisend            ← Minisend off-ramp payout callback
 */

import { Hono } from "hono";
import { db } from "../db";
import { transactions, users } from "../db/schema";
import { eq } from "drizzle-orm";
import { recordSettlementStep } from "../services/settlement";
import { creditPayFromFloat } from "../services/avalanche-pay";
import { minisendProvider } from "../services/settlement-providers/minisend";
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

// ── Minisend (contributor withdraw off-ramp) ────────────────────────────────

export const minisendWebhookRouter = new Hono();

// POST /webhooks/minisend — offramp.completed / offramp.failed / offramp.expired
minisendWebhookRouter.post("/", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("x-minisend-signature") ?? "";

  if (!minisendProvider.verifyWebhookSignature(rawBody, signature)) {
    console.error("[Webhook:Minisend] Invalid signature — rejecting");
    return c.json({ error: "Invalid signature" }, 401);
  }

  const event = minisendProvider.parseWebhookEvent(rawBody);

  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.railReference, event.orderId),
  });

  if (!tx) {
    console.warn(`[Webhook:Minisend] No TX found for order_id=${event.orderId}`);
    return c.json({ received: true });
  }

  if (tx.status === "settled" || tx.status === "failed") {
    return c.json({ received: true });
  }

  if (event.status === "completed") {
    await recordSettlementStep(tx.id, "settled", {
      orderId: event.orderId,
      settlementReceipt: event.settlementReceipt,
    });
    console.log(`[Webhook:Minisend] ✓ Payout settled TX=${tx.id} order=${event.orderId}`);
  } else {
    // Minisend auto-refunds the USDC to the contributor's own wallet on
    // failure/expiry (refund_address set at order creation) — nothing
    // on-chain to do here. Marked failed (not requires_review) since the
    // funds aren't at risk; failureReason/failedAt already surface it for
    // manual review in history/ops.
    await recordSettlementStep(tx.id, "failed", {
      orderId: event.orderId,
      reason: event.reason ?? `Minisend reported "${event.status}"`,
    });
    console.error(`[Webhook:Minisend] ✗ Payout ${event.status} TX=${tx.id} order=${event.orderId}`);
  }

  return c.json({ received: true });
});
