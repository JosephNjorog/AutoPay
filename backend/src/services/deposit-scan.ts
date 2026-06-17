import { formatUnits } from "viem";
import type { Address } from "viem";
import { db } from "../db";
import { users, transactions } from "../db/schema";
import { eq } from "drizzle-orm";
import { publicClient, getIncomingTransfers } from "./avalanche";
import { recordSettlementStep } from "./settlement";
import { generateTxRef } from "../lib/crypto";

const LOOKBACK_BLOCKS = 10_000n; // first-ever scan only looks back this far

/**
 * Scans for USDC/USDT transfers sent directly to a user's wallet from
 * outside the app and backfills them into transaction history — otherwise
 * a deposit made by pasting the wallet address into an external wallet
 * leaves no record anywhere, since nothing in the backend initiated it.
 */
export async function backfillCryptoDeposits(userId: string, walletAddress: Address): Promise<void> {
  try {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) return;

    const currentBlock = await publicClient.getBlockNumber();
    const fromBlock =
      user.lastCryptoScanBlock != null
        ? BigInt(user.lastCryptoScanBlock) + 1n
        : currentBlock > LOOKBACK_BLOCKS
        ? currentBlock - LOOKBACK_BLOCKS
        : 0n;

    if (fromBlock > currentBlock) return;

    const transfers = await getIncomingTransfers(walletAddress, fromBlock, currentBlock);

    for (const t of transfers) {
      const existing = await db.query.transactions.findFirst({ where: eq(transactions.txHash, t.txHash) });
      if (existing) continue;

      const amountUsd = parseFloat(formatUnits(t.amount, 6));
      if (amountUsd <= 0) continue;

      const [tx] = await db
        .insert(transactions)
        .values({
          reference: generateTxRef(),
          senderId: null,
          recipientPhone: user.phone,
          recipientUserId: userId,
          recipientWalletAddress: walletAddress,
          amountUsdc: amountUsd.toFixed(6),
          amountLocal: amountUsd.toFixed(2),
          localCurrency: "USD",
          fxRate: "1.00000000",
          token: t.token,
          rail: "crypto",
          txHash: t.txHash,
          note: `Crypto deposit from ${t.from.slice(0, 6)}…${t.from.slice(-4)}`,
        })
        .returning();

      await recordSettlementStep(tx.id, "initiated");
      await recordSettlementStep(tx.id, "onchain", { txHash: t.txHash });
      await recordSettlementStep(tx.id, "routed", { note: "direct on-chain deposit" });
      await recordSettlementStep(tx.id, "settled");
    }

    await db.update(users).set({ lastCryptoScanBlock: Number(currentBlock) }).where(eq(users.id, userId));
  } catch (err) {
    console.error(`[DepositScan] Failed for user ${userId}:`, (err as Error).message);
  }
}
