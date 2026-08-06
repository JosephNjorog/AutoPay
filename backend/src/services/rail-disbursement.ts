import { eq } from "drizzle-orm";
import { dialCodeToCountry } from "@tuma/shared";
import type { Address } from "viem";
import { db } from "../db";
import { transactions } from "../db/schema";
import { scheduleSettlementPoll, type RailDisburseJob } from "../lib/queue";
import { recordSettlementStep } from "./settlement";
import { pretiumProvider, DEFAULT_MOBILE_NETWORK_BY_COUNTRY } from "./settlement-providers/pretium";
import type { PayoutRecipient } from "./settlement-providers/types";
import { transferToken } from "./avalanche";
import { RailError } from "../lib/errors";
import { railJobWithProviderIdempotency } from "./rail-idempotency";

export { railProviderIdempotencyKey, railJobWithProviderIdempotency } from "./rail-idempotency";

export type DisburseResult = {
  rail: string;
  railReference: string;
  status: "pending" | "settled";
};

const ACCEPTED_CHAINS = ["avalanche", "avalanche-c-chain", "avax", "avax-c-chain"];

/**
 * Pays out a Send recipient's already-claimed on-chain balance to their
 * mobile money, via Pretium. Forwards from the recipient's OWN wallet (see
 * RailDisburseJob's recipientWalletAddress) to Pretium's settlement address
 * — never a Tuma-owned float. This replaces the prior disburseToRail
 * (Paystack Transfer, funded from Autopayke's own balance) which ran
 * *alongside* the on-chain escrow release rather than consuming it, so a
 * claimed Send paid the recipient twice: once on-chain, once in cash. See
 * escrow-claim.ts's header for the full trace.
 */
export async function processRailDisbursement(
  job: RailDisburseJob
): Promise<DisburseResult> {
  const idempotentJob = railJobWithProviderIdempotency(job);

  const country = dialCodeToCountry(idempotentJob.recipientPhone);
  if (!country) {
    throw new RailError("unknown", `Cannot determine country for ${idempotentJob.recipientPhone}`);
  }

  const mobileNetwork = DEFAULT_MOBILE_NETWORK_BY_COUNTRY[country.code];
  if (!mobileNetwork) {
    throw new RailError("pretium", `No default mobile network configured for ${country.code}`);
  }

  const { depositAddress, depositChain } = await pretiumProvider.getDepositAddress({
    currency: idempotentJob.localCurrency,
    chain: "avalanche",
    asset: idempotentJob.token,
  });
  if (!ACCEPTED_CHAINS.includes(depositChain.toLowerCase())) {
    throw new RailError("pretium", `Non-Avalanche deposit chain "${depositChain}" — refusing to send`);
  }

  // Forwards the recipient's own on-chain balance — same relayer-executes-
  // on-wallet pattern as withdraw.ts. Still non-custodial: the smart wallet
  // contract enforces ownership on-chain, the relayer only relays a call the
  // wallet itself authorizes, it never holds the funds.
  const txHash = await transferToken(
    idempotentJob.token,
    "",
    idempotentJob.recipientWalletAddress as Address,
    depositAddress as Address,
    idempotentJob.amountUsdc
  );

  await db
    .update(transactions)
    .set({ txHash, updatedAt: new Date() })
    .where(eq(transactions.id, idempotentJob.transactionId));
  await recordSettlementStep(idempotentJob.transactionId, "onchain", { txHash });

  const recipient: PayoutRecipient = {
    method: "mobile",
    phone: idempotentJob.recipientPhone,
    mobileNetwork,
    accountName: "Autopayke Recipient",
  };

  const order = await pretiumProvider.initiatePayout({
    amountUsd: idempotentJob.amountUsdc,
    currency: idempotentJob.localCurrency,
    recipient,
    txHash,
    reference: idempotentJob.reference,
    idempotencyKey: idempotentJob.providerIdempotencyKey!,
  });

  await db
    .update(transactions)
    .set({ railReference: order.orderId, updatedAt: new Date() })
    .where(eq(transactions.id, idempotentJob.transactionId));

  await recordSettlementStep(idempotentJob.transactionId, "routed", {
    ...(idempotentJob.metadata ?? {}),
    rail: "pretium",
    railReference: order.orderId,
  });

  const result: DisburseResult = {
    rail: "pretium",
    railReference: order.orderId,
    status: order.status === "completed" ? "settled" : "pending",
  };

  if (result.status === "settled") {
    await recordSettlementStep(idempotentJob.transactionId, "settled", {
      ...(idempotentJob.metadata ?? {}),
      rail: result.rail,
      railReference: result.railReference,
      note: "Pretium reported immediate settlement",
    });
  } else {
    await scheduleSettlementPoll(idempotentJob.transactionId, result.rail, result.railReference, 15_000);
  }

  return result;
}
