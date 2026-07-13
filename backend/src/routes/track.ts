import { Hono } from "hono";
import { db } from "../db";
import { transactions, merchantSettings, receiptEvents } from "../db/schema";
import { eq } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { receiptLimiter } from "../middleware/rateLimit";
import { getSettlementTimeline } from "../services/settlement";
import { reconcilePaystackFunding } from "./fund";
import { NotFoundError, AuthError, ConflictError } from "../lib/errors";
import { explorerUrl } from "../services/avalanche";
import { generateReceiptPdf, type ReceiptTransactionData } from "../services/receipt";
import { getRailLabel } from "../lib/rail-labels";

export const trackRouter = new Hono();
trackRouter.use("*", authMiddleware);

const RECEIPT_ELIGIBLE_STATUSES = new Set(["settled", "failed", "expired", "requires_review"]);

// GET /api/track/:id
trackRouter.get("/:id", async (c) => {
  const { id } = c.req.param();
  const { sub: userId } = c.get("user");

  let tx = await db.query.transactions.findFirst({
    where: eq(transactions.id, id),
  });

  if (!tx) throw new NotFoundError("Transaction");

  // Only sender or recipient can view
  if (tx.senderId !== userId && tx.recipientUserId !== userId) {
    throw new AuthError("Access denied");
  }

  // Backstop for missed/delayed Paystack webhooks — check directly with
  // Paystack on every poll while a funding transaction is still pending, so
  // it resolves within a poll cycle or two instead of waiting indefinitely
  // on a webhook that may never arrive.
  if (tx.status === "initiated" && tx.rail === "paystack") {
    await reconcilePaystackFunding(tx.id);
    tx = (await db.query.transactions.findFirst({ where: eq(transactions.id, id) })) ?? tx;
  }

  const timeline = await getSettlementTimeline(id);

  return c.json({
    ok: true,
    data: {
      transaction: {
        id: tx.id,
        reference: tx.reference,
        direction: tx.recipientUserId === userId ? "in" : "out",
        counterparty:
          tx.senderId === userId
            ? tx.recipientPhone ??
              (tx.merchantTillNumber
                ? `Till ${tx.merchantTillNumber}`
                : tx.merchantPaybillNumber
                ? `PayBill ${tx.merchantPaybillNumber}`
                : "Merchant")
            : (tx.senderId ?? "Autopayke"),
        amountUsd: parseFloat(tx.amountUsdc),
        amountLocal: parseFloat(tx.amountLocal),
        localCurrency: tx.localCurrency,
        fxRate: parseFloat(tx.fxRate),
        token: tx.token,
        rail: tx.rail,
        status: tx.status,
        txHash: tx.txHash,
        txExplorerUrl: tx.txHash ? explorerUrl(tx.txHash) : null,
        railReference: tx.railReference,
        note: tx.note,
        failureStage: tx.failureStage,
        failureReason: tx.failureReason,
        failedAt: tx.failedAt?.toISOString() ?? null,
        isEscrow: tx.isEscrow,
        escrowRef: tx.escrowRef,
        recipientPhone: tx.recipientPhone,
        merchantPayMethod: tx.merchantPayMethod,
        merchantTillNumber: tx.merchantTillNumber,
        merchantPaybillNumber: tx.merchantPaybillNumber,
        merchantAccountNumber: tx.merchantAccountNumber,
        refundTxHash: tx.refundTxHash,
        refundedAt: tx.refundedAt?.toISOString() ?? null,
        feeUsdc: parseFloat(tx.feeUsdc),
        createdAt: tx.createdAt.toISOString(),
        settledAt: tx.settledAt?.toISOString() ?? null,
      },
      timeline,
    },
  });
});

// GET /api/track/:id/receipt — generates a branded PDF receipt on demand.
// Only available once a transfer has reached a terminal state; each hit logs
// a receiptEvents row, which is what the admin "Receipts" tab counts.
trackRouter.get("/:id/receipt", receiptLimiter, async (c) => {
  const { id } = c.req.param();
  const { sub: userId } = c.get("user");

  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.id, id),
  });

  if (!tx) throw new NotFoundError("Transaction");
  if (tx.senderId !== userId && tx.recipientUserId !== userId) {
    throw new AuthError("Access denied");
  }
  if (!RECEIPT_ELIGIBLE_STATUSES.has(tx.status)) {
    throw new ConflictError("Receipt available once this transfer reaches a final state");
  }

  const merchant = tx.merchantId
    ? await db.query.merchantSettings.findFirst({ where: eq(merchantSettings.userId, tx.merchantId) })
    : null;

  const appUrl = process.env.APP_URL ?? "https://www.autopayke.com";
  const receiptData: ReceiptTransactionData = {
    reference: tx.reference,
    status: tx.status as ReceiptTransactionData["status"],
    direction: tx.recipientUserId === userId ? "in" : "out",
    counterparty:
      tx.senderId === userId
        ? tx.recipientPhone ??
          (tx.merchantTillNumber
            ? `Till ${tx.merchantTillNumber}`
            : tx.merchantPaybillNumber
            ? `PayBill ${tx.merchantPaybillNumber}`
            : "Merchant")
        : (tx.senderId ?? "AutoPayKe"),
    amountUsdc: parseFloat(tx.amountUsdc),
    amountLocal: tx.amountLocal ? parseFloat(tx.amountLocal) : null,
    localCurrency: tx.localCurrency,
    fxRate: tx.fxRate ? parseFloat(tx.fxRate) : null,
    feeUsdc: parseFloat(tx.feeUsdc),
    token: tx.token,
    railLabel: getRailLabel(tx.rail),
    txHash: tx.txHash,
    txExplorerUrl: tx.txHash ? explorerUrl(tx.txHash) : null,
    railReference: tx.railReference,
    note: tx.note,
    merchantBusinessName: merchant?.businessName ?? null,
    merchantTillNumber: tx.merchantTillNumber,
    merchantPaybillNumber: tx.merchantPaybillNumber,
    merchantAccountNumber: tx.merchantAccountNumber,
    failureReason: tx.failureReason,
    refundTxHash: tx.refundTxHash,
    refundedAt: tx.refundedAt?.toISOString() ?? null,
    createdAt: tx.createdAt.toISOString(),
    settledAt: tx.settledAt?.toISOString() ?? null,
    trackUrl: `${appUrl}/track/${tx.id}`,
  };

  const pdfBuffer = await generateReceiptPdf(receiptData);

  await db.insert(receiptEvents).values({ transactionId: tx.id, userId });

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="autopayke-receipt-${tx.reference}.pdf"`,
    },
  });
});
