import { eq, sql } from "drizzle-orm";
import type { Address, Hex } from "viem";
import { db } from "../db";
import {
  chainScanCursors,
  escrowPayments,
  settlementEvents,
  transactions,
  users,
} from "../db/schema";
import { scheduleEscrowExpiry, type EscrowExpireJob } from "../lib/queue";
import { publicClient } from "./avalanche";
import { amountUsdc, bytes32ToString, expiryDate } from "./escrow-chain-event-utils";
import {
  handoffClaimRailPayout,
  reconcileEscrowClaim,
  type EscrowClaimContext,
} from "./escrow-claim";
import { recordSettlementStep } from "./settlement";

const CURSOR_NAME = "escrow_contract_events";
const DEFAULT_LOOKBACK_BLOCKS = 100_000n;
const DEFAULT_BATCH_BLOCKS = 2_000n;
const DEFAULT_CONFIRMATIONS = 2n;

const ESCROW_DEPOSIT_FAILURE_STAGES = new Set([
  "escrow_deposit",
  "escrow_transaction_update",
  "escrow_record",
  "escrow_schedule_expiry",
]);

const ESCROW_EVENT_ABI = [
  {
    name: "Deposited",
    type: "event",
    inputs: [
      { name: "claimRef", type: "bytes32", indexed: true },
      { name: "sender", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "expiry", type: "uint256", indexed: false },
    ],
  },
  {
    name: "Claimed",
    type: "event",
    inputs: [
      { name: "claimRef", type: "bytes32", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "token", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    name: "Refunded",
    type: "event",
    inputs: [
      { name: "claimRef", type: "bytes32", indexed: true },
      { name: "sender", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

const DEPOSITED_EVENT = ESCROW_EVENT_ABI[0];
const CLAIMED_EVENT = ESCROW_EVENT_ABI[1];
const REFUNDED_EVENT = ESCROW_EVENT_ABI[2];

type EscrowEventKind = "deposit" | "claim" | "refund";

type ChainEvent = {
  kind: EscrowEventKind;
  blockNumber: bigint;
  logIndex: number;
  transactionHash: Hex;
  args: Record<string, unknown>;
};

export type EscrowChainEventScanResult = {
  fromBlock: number | null;
  toBlock: number | null;
  scanned: number;
  depositsReconciled: number;
  claimsReconciled: number;
  refundsReconciled: number;
  skipped: number;
  failed: number;
};

function bigintEnv(name: string, fallback: bigint): bigint {
  const value = BigInt(parseInt(process.env[name] ?? "", 10) || 0);
  return value > 0n ? value : fallback;
}

function escrowAddress(): Address | null {
  const address = process.env.AUTOPAYKE_ESCROW_ADDRESS;
  if (!address || address === "0x") return null;
  return address as Address;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function getOrCreateCursor(currentBlock: bigint): Promise<bigint> {
  const existing = await db.query.chainScanCursors.findFirst({
    where: eq(chainScanCursors.name, CURSOR_NAME),
  });
  if (existing) return BigInt(existing.lastScannedBlock);

  const lookback = bigintEnv(
    "CHAIN_EVENT_SCAN_LOOKBACK_BLOCKS",
    DEFAULT_LOOKBACK_BLOCKS
  );
  const startBlock = currentBlock > lookback ? currentBlock - lookback : 0n;
  const lastScannedBlock = startBlock > 0n ? startBlock - 1n : 0n;

  await db
    .insert(chainScanCursors)
    .values({
      name: CURSOR_NAME,
      lastScannedBlock: Number(lastScannedBlock),
    })
    .onConflictDoNothing();

  const cursor = await db.query.chainScanCursors.findFirst({
    where: eq(chainScanCursors.name, CURSOR_NAME),
  });

  return BigInt(cursor?.lastScannedBlock ?? lastScannedBlock);
}

async function advanceCursor(toBlock: bigint): Promise<void> {
  await db
    .update(chainScanCursors)
    .set({ lastScannedBlock: Number(toBlock), updatedAt: new Date() })
    .where(eq(chainScanCursors.name, CURSOR_NAME));
}

function shouldMarkDepositOnchain(
  tx: typeof transactions.$inferSelect
): boolean {
  if (tx.status === "initiated") return true;
  if (tx.status !== "requires_review") return false;
  return (
    !tx.failureStage || ESCROW_DEPOSIT_FAILURE_STAGES.has(tx.failureStage)
  );
}

function isTerminalStatus(status: string): boolean {
  return status === "routed" || status === "settled" || status === "expired";
}

async function findUserByWallet(wallet: Address) {
  return db.query.users.findFirst({
    where: sql`lower(${users.walletAddress}) = ${wallet.toLowerCase()}`,
  });
}

async function processDepositEvent(event: ChainEvent): Promise<boolean> {
  const claimRef = bytes32ToString(event.args.claimRef as Hex);
  if (!claimRef) return false;

  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.escrowRef, claimRef),
  });
  const escrow = await db.query.escrowPayments.findFirst({
    where: eq(escrowPayments.ref, claimRef),
  });

  if (!tx && !escrow) return false;

  const txHash = event.transactionHash;
  const token = event.args.token as Address;
  const amount = event.args.amount as bigint;
  const expiry = event.args.expiry as bigint;

  if (!escrow && tx) {
    if (!tx.senderId) return false;

    const sender = await db.query.users.findFirst({
      where: eq(users.id, tx.senderId),
    });
    const expiresAt = expiryDate(expiry);

    await db.transaction(async (txDb) => {
      await txDb.insert(escrowPayments).values({
        ref: claimRef,
        transactionId: tx.id,
        senderId: tx.senderId!,
        recipientPhone: tx.recipientPhone,
        tokenAddress: token,
        amountUsdc: amountUsdc(amount),
        onchainRef: claimRef,
        expiresAt,
      });

      await txDb
        .update(transactions)
        .set({
          escrowRef: claimRef,
          isEscrow: true,
          txHash,
          status: "onchain",
          failureStage: null,
          failureReason: null,
          failedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(transactions.id, tx.id));

      await txDb.insert(settlementEvents).values({
        transactionId: tx.id,
        step: "onchain",
        metadata: {
          txHash,
          escrowRef: claimRef,
          source: "chain_event_scan",
          repaired: "escrow_record",
        },
      });
    });

    if (sender?.walletAddress) {
      const job: EscrowExpireJob = {
        escrowRef: claimRef,
        transactionId: tx.id,
        senderWallet: sender.walletAddress,
        amountUsdc: amountUsdc(amount),
        onchainRef: claimRef,
      };
      try {
        await scheduleEscrowExpiry(job, expiresAt);
      } catch (err) {
        console.error(
          `[ChainEventScan] Failed to reschedule escrow expiry for ${claimRef}:`,
          errorMessage(err)
        );
      }
    }

    return true;
  }

  const transactionId = escrow?.transactionId ?? tx?.id;
  if (!transactionId) return false;

  const currentTx =
    tx ??
    (await db.query.transactions.findFirst({
      where: eq(transactions.id, transactionId),
    }));
  if (!currentTx) return false;

  if (currentTx.txHash === txHash && currentTx.status === "onchain") {
    return false;
  }

  await db
    .update(transactions)
    .set({
      escrowRef: claimRef,
      isEscrow: true,
      txHash,
      ...(shouldMarkDepositOnchain(currentTx)
        ? {
            status: "onchain" as const,
            failureStage: null,
            failureReason: null,
            failedAt: null,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, currentTx.id));

  await db.insert(settlementEvents).values({
    transactionId: currentTx.id,
    step: "onchain",
    metadata: {
      txHash,
      escrowRef: claimRef,
      source: "chain_event_scan",
      reviewStillRequired: !shouldMarkDepositOnchain(currentTx),
    },
  });

  if (currentTx.status === "failed") {
    await recordSettlementStep(currentTx.id, "requires_review", {
      stage: "chain_event_conflict",
      reason: "Escrow deposit event found for a failed transaction",
      txHash,
      escrowRef: claimRef,
      source: "chain_event_scan",
    });
  }

  return true;
}

async function processClaimEvent(event: ChainEvent): Promise<boolean> {
  const claimRef = bytes32ToString(event.args.claimRef as Hex);
  if (!claimRef) return false;

  const escrow = await db.query.escrowPayments.findFirst({
    where: eq(escrowPayments.ref, claimRef),
  });
  if (!escrow) return false;

  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.id, escrow.transactionId),
  });
  if (!tx) return false;

  const recipientWalletAddress = event.args.recipient as Address;
  const recipient = await findUserByWallet(recipientWalletAddress);
  if (!recipient) {
    await recordSettlementStep(tx.id, "requires_review", {
      stage: "escrow_claim_chain_event",
      reason: "Claimed recipient wallet is not linked to a local user",
      escrowRef: claimRef,
      claimTxHash: event.transactionHash,
      recipientWalletAddress,
      source: "chain_event_scan",
    });
    return true;
  }

  const ctx: EscrowClaimContext = {
    ref: claimRef,
    transactionId: tx.id,
    recipientUserId: recipient.id,
    recipientPhone: escrow.recipientPhone,
    recipientWalletAddress: recipient.walletAddress ?? recipientWalletAddress,
    claimTxHash: event.transactionHash,
    amountUsdc: escrow.amountUsdc,
    amountLocal: parseFloat(tx.amountLocal),
    localCurrency: tx.localCurrency,
    rail: tx.rail,
    reference: tx.reference,
  };

  if (escrow.status === "claimed") {
    if (
      escrow.claimTxHash &&
      escrow.claimTxHash.toLowerCase() !== event.transactionHash.toLowerCase()
    ) {
      await recordSettlementStep(tx.id, "requires_review", {
        stage: "escrow_claim_chain_conflict",
        reason: "Claim event hash differs from locally recorded claim hash",
        escrowRef: claimRef,
        localClaimTxHash: escrow.claimTxHash,
        chainClaimTxHash: event.transactionHash,
        source: "chain_event_scan",
      });
      return true;
    }

    if (!isTerminalStatus(tx.status)) {
      await handoffClaimRailPayout(ctx);
      return true;
    }

    return false;
  }

  if (escrow.status !== "pending") {
    await recordSettlementStep(tx.id, "requires_review", {
      stage: "escrow_claim_chain_conflict",
      reason: `Claim event found for locally ${escrow.status} escrow`,
      escrowRef: claimRef,
      claimTxHash: event.transactionHash,
      source: "chain_event_scan",
    });
    return true;
  }

  await reconcileEscrowClaim(ctx, "chain_event_scan");
  return true;
}

async function processRefundEvent(event: ChainEvent): Promise<boolean> {
  const claimRef = bytes32ToString(event.args.claimRef as Hex);
  if (!claimRef) return false;

  const escrow = await db.query.escrowPayments.findFirst({
    where: eq(escrowPayments.ref, claimRef),
  });
  if (!escrow) return false;

  if (escrow.status === "refunded" || escrow.status === "expired") {
    return false;
  }

  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.id, escrow.transactionId),
  });
  if (!tx) return false;

  if (escrow.status !== "pending") {
    await recordSettlementStep(tx.id, "requires_review", {
      stage: "escrow_refund_chain_conflict",
      reason: `Refund event found for locally ${escrow.status} escrow`,
      refundTxHash: event.transactionHash,
      escrowRef: claimRef,
      source: "chain_event_scan",
    });
    return true;
  }

  await db.transaction(async (txDb) => {
    await txDb
      .update(escrowPayments)
      .set({ status: "refunded", updatedAt: new Date() })
      .where(eq(escrowPayments.ref, claimRef));

    await txDb
      .update(transactions)
      .set({
        status: "expired",
        failureStage: null,
        failureReason: null,
        failedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, tx.id));

    await txDb.insert(settlementEvents).values({
      transactionId: tx.id,
      step: "expired",
      metadata: {
        reason: "Escrow refund found on-chain",
        refundTxHash: event.transactionHash,
        escrowRef: claimRef,
        source: "chain_event_scan",
      },
    });
  });

  return true;
}

async function loadEvents(
  address: Address,
  fromBlock: bigint,
  toBlock: bigint
): Promise<ChainEvent[]> {
  const [deposits, claims, refunds] = await Promise.all([
    publicClient.getLogs({
      address,
      event: DEPOSITED_EVENT,
      fromBlock,
      toBlock,
    }),
    publicClient.getLogs({
      address,
      event: CLAIMED_EVENT,
      fromBlock,
      toBlock,
    }),
    publicClient.getLogs({
      address,
      event: REFUNDED_EVENT,
      fromBlock,
      toBlock,
    }),
  ]);

  return [
    ...deposits.map((log) => ({
      kind: "deposit" as const,
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      transactionHash: log.transactionHash,
      args: log.args as Record<string, unknown>,
    })),
    ...claims.map((log) => ({
      kind: "claim" as const,
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      transactionHash: log.transactionHash,
      args: log.args as Record<string, unknown>,
    })),
    ...refunds.map((log) => ({
      kind: "refund" as const,
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      transactionHash: log.transactionHash,
      args: log.args as Record<string, unknown>,
    })),
  ].sort((a, b) => {
    if (a.blockNumber === b.blockNumber) return a.logIndex - b.logIndex;
    return a.blockNumber < b.blockNumber ? -1 : 1;
  });
}

export async function scanEscrowChainEvents(): Promise<EscrowChainEventScanResult> {
  const result: EscrowChainEventScanResult = {
    fromBlock: null,
    toBlock: null,
    scanned: 0,
    depositsReconciled: 0,
    claimsReconciled: 0,
    refundsReconciled: 0,
    skipped: 0,
    failed: 0,
  };

  const address = escrowAddress();
  if (!address) return result;

  const currentBlock = await publicClient.getBlockNumber();
  const confirmations = bigintEnv(
    "CHAIN_EVENT_SCAN_CONFIRMATIONS",
    DEFAULT_CONFIRMATIONS
  );
  if (currentBlock <= confirmations) return result;

  const safeBlock = currentBlock - confirmations;
  const cursor = await getOrCreateCursor(safeBlock);
  const fromBlock = cursor + 1n;
  if (fromBlock > safeBlock) return result;

  const batchBlocks = bigintEnv(
    "CHAIN_EVENT_SCAN_BATCH_BLOCKS",
    DEFAULT_BATCH_BLOCKS
  );
  const toBlock =
    fromBlock + batchBlocks - 1n < safeBlock
      ? fromBlock + batchBlocks - 1n
      : safeBlock;

  result.fromBlock = Number(fromBlock);
  result.toBlock = Number(toBlock);

  const events = await loadEvents(address, fromBlock, toBlock);
  result.scanned = events.length;

  for (const event of events) {
    try {
      const reconciled =
        event.kind === "deposit"
          ? await processDepositEvent(event)
          : event.kind === "claim"
            ? await processClaimEvent(event)
            : await processRefundEvent(event);

      if (!reconciled) {
        result.skipped += 1;
        continue;
      }

      if (event.kind === "deposit") result.depositsReconciled += 1;
      else if (event.kind === "claim") result.claimsReconciled += 1;
      else result.refundsReconciled += 1;
    } catch (err) {
      result.failed += 1;
      console.error(
        `[ChainEventScan] Failed ${event.kind} event ${event.transactionHash}:`,
        errorMessage(err)
      );
      return result;
    }
  }

  await advanceCursor(toBlock);
  return result;
}
