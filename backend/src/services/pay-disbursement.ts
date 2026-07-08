import { eq } from "drizzle-orm";
import { db } from "../db";
import { transactions } from "../db/schema";
import { sendB2B } from "./rails/mpesa";
import { recordSettlementStep } from "./settlement";
import type { PayDisburseJob } from "../lib/queue";

export type { PayDisburseJob };

/**
 * Calls Daraja B2B to push the confirmed KES amount to the merchant's
 * Till/PayBill. Unlike the Paystack rail-disbursement pipeline, this is
 * webhook-only — Daraja's B2B result arrives at /webhooks/mpesa/b2b/result,
 * so no settlement-poll job is scheduled here (mirrors the B2C posture in
 * settlement.ts's `if (rail !== "mpesa")` polling exemption).
 */
export async function processPayB2BDisbursement(
  job: PayDisburseJob
): Promise<{ railReference: string }> {
  const result = await sendB2B({
    payMethod: job.payMethod,
    merchantNumber: job.merchantNumber,
    accountNumber: job.accountNumber,
    amountKes: job.amountKes,
    ref: job.reference,
  });

  await db
    .update(transactions)
    .set({ railReference: result.railReference, updatedAt: new Date() })
    .where(eq(transactions.id, job.transactionId));

  await recordSettlementStep(job.transactionId, "routed", {
    rail: job.payMethod === "buy_goods" ? "mpesa_b2b_till" : "mpesa_b2b_paybill",
    railReference: result.railReference,
  });

  return { railReference: result.railReference };
}
