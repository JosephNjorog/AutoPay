import { eq } from "drizzle-orm";
import { db } from "../db";
import { transactions } from "../db/schema";
import { pretiumProvider } from "./settlement-providers/pretium";
import { recordSettlementStep } from "./settlement";
import type { PayDisburseJob } from "../lib/queue";
import type { PayoutRecipient } from "./settlement-providers/types";

export type { PayDisburseJob };

/**
 * Calls Pretium's offramp (POST /v1/pay/{currency}) to push the confirmed
 * amount to the merchant's Till/PayBill. The on-chain deposit has already
 * happened by the time this runs (see routes/pay.ts) — this is the
 * initiatePayout() leg, keyed by the tx hash. Status arrives via
 * /webhooks/pretium/offramp, which reconciles against the status API rather
 * than trusting the webhook body (Pretium has no documented signature
 * scheme — see pretium.ts).
 */
export async function processPayB2BDisbursement(
  job: PayDisburseJob
): Promise<{ railReference: string }> {
  const recipient: PayoutRecipient =
    job.payMethod === "buy_goods"
      ? { method: "till", businessNumber: job.merchantNumber }
      : { method: "paybill", businessNumber: job.merchantNumber, accountNumber: job.accountNumber ?? "" };

  const order = await pretiumProvider.initiatePayout({
    amountUsd: job.amountUsd,
    currency: job.currency,
    recipient,
    txHash: job.txHash,
    reference: job.reference,
    idempotencyKey: `pay:${job.transactionId}`,
  });

  await db
    .update(transactions)
    .set({ railReference: order.orderId, updatedAt: new Date() })
    .where(eq(transactions.id, job.transactionId));

  await recordSettlementStep(job.transactionId, "routed", {
    rail: job.payMethod === "buy_goods" ? "pretium_till" : "pretium_paybill",
    railReference: order.orderId,
  });

  return { railReference: order.orderId };
}
