/**
 * Escrow expiry worker.
 * Fires after 7 days for each unclaimed escrow payment.
 * Calls TumaEscrow.refund() on-chain and credits the sender's wallet.
 */

import { Worker, type Job } from "bullmq";
import { queueConnection, QUEUE_NAMES, type EscrowExpireJob } from "../lib/queue";
import { db } from "../db";
import { escrowPayments, transactions } from "../db/schema";
import { eq } from "drizzle-orm";
import { recordSettlementStep } from "../services/settlement";
import { publicClient, relayerClient, stringToBytes32 } from "../services/avalanche";
import type { Address } from "viem";

const ESCROW_ABI = [
  {
    name: "refund",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "claimRef", type: "bytes32" }],
    outputs: [],
  },
] as const;

const worker = new Worker<EscrowExpireJob>(
  QUEUE_NAMES.ESCROW_EXPIRE,
  async (job: Job<EscrowExpireJob>) => {
    const { escrowRef, transactionId, senderWallet, amountUsdc, onchainRef } = job.data;

    // Verify still pending
    const escrow = await db.query.escrowPayments.findFirst({
      where: eq(escrowPayments.ref, escrowRef),
    });

    if (!escrow || escrow.status !== "pending") {
      console.log(`[EscrowWorker] ${escrowRef} already resolved (${escrow?.status}) — skipping`);
      return;
    }

    if (new Date() < escrow.expiresAt) {
      console.warn(`[EscrowWorker] ${escrowRef} not yet expired — skipping`);
      return;
    }

    console.log(`[EscrowWorker] Processing expiry for ${escrowRef}`);

    try {
      // Call TumaEscrow.refund() on-chain
      const escrowAddress = process.env.TUMA_ESCROW_ADDRESS as Address;
      const hash = await relayerClient.writeContract({
        address: escrowAddress,
        abi: ESCROW_ABI,
        functionName: "refund",
        args: [stringToBytes32(onchainRef)],
      });

      await publicClient.waitForTransactionReceipt({ hash });

      // Mark as refunded
      await db
        .update(escrowPayments)
        .set({ status: "refunded", updatedAt: new Date() })
        .where(eq(escrowPayments.ref, escrowRef));

      await db
        .update(transactions)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(transactions.id, transactionId));

      await recordSettlementStep(transactionId, "expired", {
        reason: "Unclaimed after 7 days",
        refundTxHash: hash,
        refundedTo: senderWallet,
      });

      console.log(`[EscrowWorker] ✓ Refunded ${amountUsdc} USDC to ${senderWallet} for ${escrowRef}`);
    } catch (err) {
      console.error(`[EscrowWorker] ✗ Refund failed for ${escrowRef}:`, (err as Error).message);
      throw err; // triggers BullMQ retry
    }
  },
  {
    connection: queueConnection,
    concurrency: 5,
  }
);

worker.on("ready", () => {
  console.log("[EscrowWorker] Ready — monitoring escrow expiries");
});

worker.on("failed", (job, err) => {
  console.error(`[EscrowWorker] Job ${job?.id} failed:`, err.message);
});

process.on("SIGTERM", async () => {
  await worker.close();
  process.exit(0);
});
