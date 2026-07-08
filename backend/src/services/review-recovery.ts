import { eq } from "drizzle-orm";
import type { Hash } from "viem";
import { db } from "../db";
import {
  escrowPayments,
  settlementEvents,
  transactions,
  users,
} from "../db/schema";
import {
  enqueueWhatsAppNotify,
  enqueueRailDisburse,
  type EscrowExpireJob,
} from "../lib/queue";
import { processRailDisbursement, railProviderIdempotencyKey } from "./rail-disbursement";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../lib/errors";
import { publicClient } from "./avalanche";
import {
  markEscrowRefundRequiresReview,
  processEscrowExpiry,
} from "./escrow-expiry";
import { recordSettlementStep } from "./settlement";
import { sendClaimLink } from "./whatsapp";

type Transaction = typeof transactions.$inferSelect;
type EscrowPayment = typeof escrowPayments.$inferSelect;

export type ClaimLinkResendResult = {
  transactionId: string;
  escrowRef: string;
  claimUrl: string;
  mode: "queued" | "sent";
  status: "onchain";
};

export type ChainHashReconciliationResult = {
  transactionId: string;
  txHash: string;
  status: "requires_review";
  receiptStatus: "success";
  reviewStillRequired: boolean;
};

export type EscrowRefundRetryResult = {
  transactionId: string;
  escrowRef: string;
  status: "refunded" | "skipped";
};

function ensureReviewStage(
  tx: Transaction,
  allowedStages: string[],
  action: string
): void {
  if (tx.status !== "requires_review" || !tx.failureStage) {
    throw new ConflictError(`Transaction is not awaiting ${action}.`);
  }

  if (!allowedStages.includes(tx.failureStage)) {
    throw new ConflictError(
      `Transaction failure stage ${tx.failureStage} cannot be resolved by ${action}.`
    );
  }
}

function claimUrl(escrowRef: string): string {
  return `${process.env.APP_URL}/claim/${escrowRef}`;
}

async function loadTransaction(transactionId: string): Promise<Transaction> {
  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.id, transactionId),
  });

  if (!tx) throw new NotFoundError("Transaction");
  return tx;
}

async function loadEscrowForTransaction(
  transactionId: string
): Promise<EscrowPayment> {
  const escrow = await db.query.escrowPayments.findFirst({
    where: eq(escrowPayments.transactionId, transactionId),
  });

  if (!escrow) throw new NotFoundError("Escrow payment");
  return escrow;
}

export async function resendClaimLink(
  transactionId: string,
  requestedBy: string
): Promise<ClaimLinkResendResult> {
  const tx = await loadTransaction(transactionId);
  ensureReviewStage(tx, ["escrow_claim_link"], "claim-link resend");

  const escrow = await loadEscrowForTransaction(transactionId);
  if (escrow.status !== "pending") {
    throw new ConflictError(`Escrow is already ${escrow.status}.`);
  }

  // Escrow (non-TUMA-user Send) always has a recipientPhone — merchant Pay
  // transactions never create escrow rows.
  if (!tx.recipientPhone) {
    throw new ConflictError(`Transaction ${tx.id} has no recipientPhone to resend a claim link to.`);
  }

  const sender = await db.query.users.findFirst({
    where: eq(users.id, escrow.senderId),
  });
  if (!sender) throw new NotFoundError("Sender");

  const url = claimUrl(escrow.ref);
  const amountLocal = parseFloat(tx.amountLocal).toFixed(2);
  const params = [sender.phone, amountLocal, tx.localCurrency, url];

  const queued = await enqueueWhatsAppNotify({
    to: tx.recipientPhone,
    templateName: "tuma_claim_link",
    params,
    transactionId: tx.id,
    failureStage: "escrow_claim_link",
  });

  if (!queued) {
    await sendClaimLink(
      tx.recipientPhone,
      sender.phone,
      amountLocal,
      tx.localCurrency,
      url
    );
  }

  await recordSettlementStep(tx.id, "onchain", {
    stage: "escrow_claim_link",
    escrowRef: escrow.ref,
    claimUrl: url,
    notificationMode: queued ? "queued" : "sent",
    retrySource: "ops",
    retryRequestedBy: requestedBy,
  });

  return {
    transactionId: tx.id,
    escrowRef: escrow.ref,
    claimUrl: url,
    mode: queued ? "queued" : "sent",
    status: "onchain",
  };
}

export async function reconcileChainHash(
  transactionId: string,
  txHash: Hash,
  requestedBy: string,
  opts: { escrowRef?: string; note?: string | null } = {}
): Promise<ChainHashReconciliationResult> {
  const tx = await loadTransaction(transactionId);
  if (tx.status !== "requires_review") {
    throw new ConflictError("Transaction is not awaiting review.");
  }

  if (tx.txHash && tx.txHash.toLowerCase() !== txHash.toLowerCase()) {
    throw new ConflictError("Transaction already has a different txHash.");
  }

  let receipt;
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  } catch {
    throw new ValidationError(
      "Transaction receipt was not found on the configured Avalanche network."
    );
  }

  if (receipt.status !== "success") {
    throw new ConflictError("Transaction receipt is not successful.");
  }

  await db
    .update(transactions)
    .set({
      txHash,
      escrowRef: opts.escrowRef ?? tx.escrowRef,
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, tx.id));

  await db.insert(settlementEvents).values({
    transactionId: tx.id,
    step: "onchain",
    metadata: {
      txHash,
      escrowRef: opts.escrowRef ?? tx.escrowRef,
      note: opts.note ?? undefined,
      reconciledBy: requestedBy,
      source: "ops",
      reviewStillRequired: true,
    },
  });

  return {
    transactionId: tx.id,
    txHash,
    status: "requires_review",
    receiptStatus: "success",
    reviewStillRequired: true,
  };
}

export type DisbursementRetryResult = {
  transactionId: string;
  rail: string;
  railReference: string;
  status: string;
  queued: boolean;
};

/**
 * Retries the local-rail disbursement leg for a direct (non-escrow) transaction
 * that is stuck at "onchain" or "routed" — e.g. because the original B2C call
 * failed or never fired. All disbursements now go through Paystack Transfer.
 */
export async function retryRailDisbursement(
  transactionId: string,
  requestedBy: string
): Promise<DisbursementRetryResult> {
  const tx = await loadTransaction(transactionId);

  if (tx.isEscrow) {
    throw new ConflictError("Use resend-claim-link for escrow transactions.");
  }

  if (tx.status !== "onchain" && tx.status !== "routed" && tx.status !== "requires_review") {
    throw new ConflictError(
      `Transaction status is "${tx.status}" — only onchain/routed/requires_review can be retried.`
    );
  }

  // This retries the Paystack-backed rail-disbursement leg only — merchant
  // Pay (B2B) transactions have their own disbursement/refund pipeline and
  // always have a null recipientPhone.
  if (!tx.recipientPhone) {
    throw new ConflictError(
      `Transaction ${tx.id} has no recipientPhone — use the Pay dead-letter recovery path instead.`
    );
  }

  const job = {
    transactionId: tx.id,
    rail: tx.rail,
    recipientPhone: tx.recipientPhone,
    amountLocal: parseFloat(tx.amountLocal),
    localCurrency: tx.localCurrency,
    reference: tx.reference,
    providerIdempotencyKey: railProviderIdempotencyKey(tx.id, "disbursement_retry"),
    failureStage: "disbursement_retry",
    metadata: { retriedBy: requestedBy, retriedAt: new Date().toISOString() },
  };

  await recordSettlementStep(tx.id, "routed", {
    note: "Disbursement retry initiated via ops",
    retriedBy: requestedBy,
  });

  const queued = await enqueueRailDisburse(job);
  if (!queued) {
    const result = await processRailDisbursement(job);
    return {
      transactionId: tx.id,
      rail: result.rail,
      railReference: result.railReference,
      status: result.status,
      queued: false,
    };
  }

  return {
    transactionId: tx.id,
    rail: tx.rail,
    railReference: tx.railReference ?? "queued",
    status: "pending",
    queued: true,
  };
}

export async function retryEscrowRefund(
  transactionId: string,
  requestedBy: string
): Promise<EscrowRefundRetryResult> {
  const tx = await loadTransaction(transactionId);
  const escrow = await loadEscrowForTransaction(transactionId);

  const isRefundReview =
    tx.status === "requires_review" && tx.failureStage === "escrow_refund";
  const isExpiredPending =
    escrow.status === "pending" && new Date() >= escrow.expiresAt;

  if (!isRefundReview && !isExpiredPending) {
    throw new ConflictError("Escrow is not ready for refund retry.");
  }

  const sender = await db.query.users.findFirst({
    where: eq(users.id, escrow.senderId),
  });
  if (!sender?.walletAddress) {
    throw new ConflictError("Sender wallet is missing; cannot refund escrow.");
  }

  const job: EscrowExpireJob = {
    escrowRef: escrow.ref,
    transactionId: tx.id,
    senderWallet: sender.walletAddress,
    amountUsdc: escrow.amountUsdc,
    onchainRef: escrow.onchainRef ?? escrow.ref,
  };

  try {
    const retryMetadata = {
      retrySource: "ops",
      retryRequestedBy: requestedBy,
      retryRequestedAt: new Date().toISOString(),
    };
    const status = await processEscrowExpiry(job, "ops", retryMetadata);
    return {
      transactionId: tx.id,
      escrowRef: escrow.ref,
      status,
    };
  } catch (err) {
    await markEscrowRefundRequiresReview(job, err, "ops", {
      retrySource: "ops",
      retryRequestedBy: requestedBy,
      retryRequestedAt: new Date().toISOString(),
    });
    throw err;
  }
}
