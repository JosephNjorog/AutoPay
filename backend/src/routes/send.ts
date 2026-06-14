import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { SendMoneySchema } from "@tuma/shared";
import { db } from "../db";
import { users, transactions } from "../db/schema";
import { eq } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { sendMoneyLimiter } from "../middleware/rateLimit";
import { consumeQuote } from "../services/fx";
import {
  transferUsdc,
  approveEscrow,
  depositToEscrow,
  getUsdcBalance,
} from "../services/avalanche";
import { disburseToRail } from "../services/rails";
import { startSettlementFlow, recordSettlementStep } from "../services/settlement";
import { sendClaimLink, sendReceivedNotification } from "../services/whatsapp";
import { hashPhone, generateTxRef, generateEscrowRef } from "../lib/crypto";
import { FxQuoteExpiredError, InsufficientFundsError, NotFoundError } from "../lib/errors";
import { escrowPayments } from "../db/schema";
import { scheduleEscrowExpiry } from "../lib/queue";
import { parseUnits } from "viem";
import type { Address } from "viem";

export const sendRouter = new Hono();
sendRouter.use("*", authMiddleware);

// POST /api/send
sendRouter.post(
  "/",
  sendMoneyLimiter,
  zValidator("json", SendMoneySchema),
  async (c) => {
    const { quoteId, recipientPhone, amountUsd, token, note } = c.req.valid("json");
    const { sub: userId } = c.get("user");

    // 1. Load and consume the rate-locked quote
    let quote;
    try {
      quote = await consumeQuote(quoteId);
    } catch {
      throw new FxQuoteExpiredError();
    }

    // 2. Validate quote matches request
    if (
      Math.abs(quote.fromAmountUsd - amountUsd) > 0.01 ||
      quote.recipientPhone !== recipientPhone
    ) {
      throw new FxQuoteExpiredError();
    }

    // 3. Load sender
    const sender = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!sender?.walletAddress) throw new NotFoundError("Sender wallet");

    // 4. Check USDC balance
    const balanceRaw = await getUsdcBalance(sender.walletAddress as Address);
    const requiredRaw = parseUnits(amountUsd.toFixed(6), 6);
    if (balanceRaw < requiredRaw) throw new InsufficientFundsError();

    // 5. Detect if recipient is a TUMA user
    const recipientHash = hashPhone(recipientPhone);
    const recipient = await db.query.users.findFirst({
      where: eq(users.phoneHash, recipientHash),
    });

    const isTumaUser = !!recipient?.walletAddress;
    const reference = generateTxRef();

    // 6. Create transaction record (initiated)
    const [tx] = await db
      .insert(transactions)
      .values({
        reference,
        senderId: userId,
        recipientPhone,
        recipientUserId: recipient?.id ?? null,
        recipientWalletAddress: recipient?.walletAddress ?? null,
        amountUsdc: amountUsd.toFixed(6),
        amountLocal: quote.toAmount.toFixed(2),
        localCurrency: quote.toCurrency,
        fxRate: quote.tumaRate.toFixed(8),
        fxLockedAt: new Date(quote.lockedUntil),
        token: token ?? "USDC",
        rail: quote.rail,
        isEscrow: !isTumaUser,
        note: note ?? null,
      })
      .returning();

    await recordSettlementStep(tx.id, "initiated");

    if (isTumaUser) {
      // ── Direct TUMA-to-TUMA transfer ──────────────────────────────────────
      const txHash = await transferUsdc(
        recipientHash,
        sender.walletAddress as Address,
        recipient!.walletAddress as Address,
        amountUsd
      );

      // Disburse to local rail
      const { railReference } = await disburseToRail({
        recipientPhone,
        amountLocal: quote.toAmount,
        localCurrency: quote.toCurrency,
        reference,
      });

      await startSettlementFlow(tx.id, txHash, quote.rail, railReference);

      // Notify recipient via WhatsApp
      sendReceivedNotification(
        recipientPhone,
        quote.toAmount.toFixed(2),
        quote.toCurrency,
        sender.phone
      ).catch(console.error);

      return c.json({
        ok: true,
        data: {
          transactionId: tx.id,
          reference,
          txHash,
          type: "direct",
          rail: quote.rail,
          amountLocal: quote.toAmount,
          localCurrency: quote.toCurrency,
          status: "routed",
        },
      });
    } else {
      // ── Escrow for non-TUMA recipient ────────────────────────────────────
      const escrowRef = generateEscrowRef();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      // Approve escrow contract to pull USDC from sender's smart wallet
      await approveEscrow(sender.walletAddress as Address, amountUsd);

      // Lock USDC in TumaEscrow on-chain (sender's wallet calls escrow.deposit())
      const escrowTxHash = await depositToEscrow(
        sender.walletAddress as Address,
        escrowRef,
        amountUsd
      );

      // Create escrow record
      const [escrow] = await db
        .insert(escrowPayments)
        .values({
          ref: escrowRef,
          transactionId: tx.id,
          senderId: userId,
          recipientPhone,
          tokenAddress: process.env.USDC_ADDRESS!,
          amountUsdc: amountUsd.toFixed(6),
          expiresAt,
        })
        .returning();

      // Update tx with escrow ref and on-chain deposit hash
      await db
        .update(transactions)
        .set({ escrowRef, isEscrow: true, txHash: escrowTxHash })
        .where(eq(transactions.id, tx.id));

      // Schedule expiry job
      await scheduleEscrowExpiry(
        {
          escrowRef,
          transactionId: tx.id,
          senderWallet: sender.walletAddress,
          amountUsdc: amountUsd.toFixed(6),
          onchainRef: escrowRef,
        },
        expiresAt
      );

      // Send claim link via WhatsApp
      const claimUrl = `${process.env.APP_URL}/claim/${escrowRef}`;
      await sendClaimLink(
        recipientPhone,
        sender.phone,
        quote.toAmount.toFixed(2),
        quote.toCurrency,
        claimUrl
      );

      return c.json({
        ok: true,
        data: {
          transactionId: tx.id,
          reference,
          escrowRef,
          type: "escrow",
          claimUrl,
          amountLocal: quote.toAmount,
          localCurrency: quote.toCurrency,
          expiresAt: expiresAt.toISOString(),
          status: "initiated",
          message: "Claim link sent via WhatsApp to recipient",
        },
      });
    }
  }
);
