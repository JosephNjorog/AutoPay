import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { WithdrawSchema, dialCodeToCountry, type CountryConfig, type Rail } from "@tuma/shared";
import { db } from "../db";
import { users, transactions } from "../db/schema";
import { eq } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { withdrawLimiter } from "../middleware/rateLimit";
import { getMidRate, computeCashoutFeeUsd } from "../services/fx";
import { transferUsdc, getUsdcBalance } from "../services/avalanche";
import { disburseToRail } from "../services/rails";
import { railProviderIdempotencyKey } from "../services/rail-disbursement";
import { startSettlementFlow, recordSettlementStep } from "../services/settlement";
import { getProviderForCountry, type PayoutRecipient } from "../services/settlement-providers";
import { generateTxRef } from "../lib/crypto";
import { getJson, setex, del, keys } from "../lib/redis";
import { InsufficientFundsError, NotFoundError, ValidationError, BlockchainError } from "../lib/errors";
import { parseUnits, formatUnits } from "viem";
import type { Address } from "viem";
import { randomUUID } from "crypto";

export const withdrawRouter = new Hono();
withdrawRouter.use("*", authMiddleware);

// POST /api/withdraw — cash out USDC to mobile money / bank in the user's home country.
withdrawRouter.post(
  "/",
  withdrawLimiter,
  zValidator("json", WithdrawSchema),
  async (c) => {
    const { amountUsd } = c.req.valid("json");
    const { sub: userId, phone } = c.get("user");

    const country = dialCodeToCountry(phone);
    if (!country) throw new ValidationError("Withdrawals are not yet available for your country");

    const treasuryAddress = process.env.TREASURY_ADDRESS as Address | undefined;
    if (!treasuryAddress) throw new BlockchainError("TREASURY_ADDRESS is not configured");

    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user?.walletAddress) throw new NotFoundError("Wallet");

    const feeUsd = computeCashoutFeeUsd(amountUsd);
    const netUsd = parseFloat((amountUsd - feeUsd).toFixed(6));
    if (netUsd <= 0) throw new ValidationError("Amount too small to cover the network fee");

    const balanceRaw = await getUsdcBalance(user.walletAddress as Address);
    const requiredRaw = parseUnits(amountUsd.toFixed(6), 6);
    if (balanceRaw < requiredRaw) throw new InsufficientFundsError();

    const midRate = await getMidRate(country.currency);
    const amountLocal = parseFloat((netUsd * midRate).toFixed(2));
    const reference = generateTxRef();

    // Pull the full withdrawn amount out of the user's wallet into the TUMA treasury —
    // the fee portion stays there, the rest backs the fiat payout below.
    const txHash = await transferUsdc(
      user.phoneHash,
      user.walletAddress as Address,
      treasuryAddress,
      amountUsd
    );

    const [tx] = await db
      .insert(transactions)
      .values({
        reference,
        senderId: userId,
        recipientPhone: phone,
        recipientUserId: userId,
        recipientWalletAddress: user.walletAddress,
        amountUsdc: amountUsd.toFixed(6),
        amountLocal: amountLocal.toFixed(2),
        localCurrency: country.currency,
        fxRate: midRate.toFixed(8),
        fxLockedAt: new Date(),
        token: "USDC",
        rail: country.primaryRail,
        feeUsdc: feeUsd.toFixed(6),
        txHash,
        note: "Cash-out withdrawal",
      })
      .returning();

    await recordSettlementStep(tx.id, "onchain", { txHash });

    const { railReference } = await disburseToRail({
      recipientPhone: phone,
      amountLocal,
      localCurrency: country.currency,
      reference,
      providerIdempotencyKey: railProviderIdempotencyKey(
        tx.id,
        "withdraw_rail_disbursement"
      ),
    });

    await startSettlementFlow(tx.id, txHash, country.primaryRail as Rail, railReference);

    return c.json({
      ok: true,
      data: {
        transactionId: tx.id,
        reference,
        txHash,
        amountLocal,
        localCurrency: country.currency,
        feeUsd,
        rail: country.primaryRail,
        status: "routed",
      },
    });
  }
);

// ── Contributor self-withdraw (Minisend off-ramp) ──────────────────────────────
// Sends directly from the contributor's own wallet to a Minisend-supplied
// deposit address — no treasury involved. Kept as separate routes from the
// treasury cash-out above (which has no frontend caller today) to avoid any
// risk of the two flows interfering with each other.

const RecipientInputSchema = z.union([
  z.object({
    method: z.literal("mobile"),
    phone: z.string().min(6),
    mobileNetwork: z.string().min(2),
  }),
  z.object({
    method: z.literal("bank"),
    accountNumber: z.string().min(4),
    institution: z.string().min(2),
  }),
]);

const PayoutQuoteSchema = z.object({
  amountUsd: z.number().positive().optional(),
  recipient: RecipientInputSchema,
});

const PayoutConfirmSchema = z.object({ quoteId: z.string().min(1) });

type StoredPayoutQuote = {
  userId: string;
  amountUsd: number;
  currency: string;
  countryCode: string;
  recipient: PayoutRecipient;
};

// Minisend's KES mobile recipient expects local format (0XXXXXXXXX); GHS/UGX
// accept either — see docs.minisend.xyz/offramp/recipients.
function toMinisendPhone(phone: string, country: CountryConfig): string {
  return country.code === "KE" ? phone.replace(country.dialCode, "0") : phone;
}

function buildRecipient(
  input: z.infer<typeof RecipientInputSchema>,
  country: CountryConfig,
  accountName: string
): PayoutRecipient {
  if (input.method === "bank") {
    return {
      method: "bank",
      accountNumber: input.accountNumber,
      institution: input.institution,
      accountName,
    };
  }
  return {
    method: "mobile",
    phone: toMinisendPhone(input.phone, country),
    mobileNetwork: input.mobileNetwork,
    accountName,
  };
}

function requireWithdrawCountry(phone: string): CountryConfig {
  const country = dialCodeToCountry(phone);
  if (!country) throw new ValidationError("Withdrawals are not yet available for your country");
  return country;
}

function requireWithdrawProvider(country: CountryConfig) {
  const provider = getProviderForCountry(country.code);
  if (!provider) {
    throw new ValidationError(`Mobile money withdrawals aren't available in ${country.name} yet`);
  }
  return provider;
}

// POST /api/withdraw/payout/quote — preview the Minisend rate/fee for a
// contributor cash-out, no side effects (no order created yet).
withdrawRouter.post(
  "/payout/quote",
  withdrawLimiter,
  zValidator("json", PayoutQuoteSchema),
  async (c) => {
    const { amountUsd: requestedAmountUsd, recipient: recipientInput } = c.req.valid("json");
    const { sub: userId, phone } = c.get("user");

    const country = requireWithdrawCountry(phone);
    const provider = requireWithdrawProvider(country);

    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new NotFoundError("User");
    if (!user.walletAddress) {
      throw new ValidationError("Your wallet is still being set up — try again in a moment");
    }
    if (!user.fullName) {
      throw new ValidationError("Add your name to your profile before withdrawing");
    }

    const balanceRaw = await getUsdcBalance(user.walletAddress as Address);
    const balanceUsd = parseFloat(formatUnits(balanceRaw, 6));
    if (balanceUsd <= 0) throw new InsufficientFundsError();

    const amountUsd = requestedAmountUsd ?? balanceUsd;
    const requiredRaw = parseUnits(amountUsd.toFixed(6), 6);
    if (balanceRaw < requiredRaw) throw new InsufficientFundsError();

    const recipient = buildRecipient(recipientInput, country, user.fullName);
    const quote = await provider.getQuote({ amountUsd, currency: country.currency, recipient });

    // Cosmetic only — reuses the existing OXR-backed mid rate purely so the
    // shared FX UI's "savings vs banks" figure has something to compare
    // against. Minisend's own quote.rate is always what's actually used.
    const midRate = await getMidRate(country.currency).catch(() => quote.rate);

    const quoteId = randomUUID();
    const ttlSeconds = Math.max(
      15,
      Math.min(280, Math.round((new Date(quote.expiresAt).getTime() - Date.now()) / 1000))
    );
    const stored: StoredPayoutQuote = {
      userId,
      amountUsd,
      currency: country.currency,
      countryCode: country.code,
      recipient,
    };
    await setex(keys.withdrawPayoutQuote(quoteId), ttlSeconds, stored);

    return c.json({
      ok: true,
      data: {
        quoteId,
        fromAmountUsd: amountUsd,
        toAmount: quote.recipientAmount,
        toCurrency: quote.currency,
        tumaRate: quote.rate,
        midRate,
        savingsVsBank: parseFloat(((midRate - quote.rate) * amountUsd).toFixed(2)),
        lockedUntil: quote.expiresAt,
        networkFeeUsd: 0,
        feeLocal: quote.feeLocal,
        recipientName: quote.recipientName,
        provider: provider.name,
      },
    });
  }
);

// POST /api/withdraw/payout/confirm — creates the Minisend order, sends the
// on-chain USDC from the contributor's own wallet, and returns a pending
// status. Not marked "settled" until the Minisend webhook confirms it.
withdrawRouter.post(
  "/payout/confirm",
  withdrawLimiter,
  zValidator("json", PayoutConfirmSchema),
  async (c) => {
    const { quoteId } = c.req.valid("json");
    const { sub: userId, phone } = c.get("user");

    const stored = await getJson<StoredPayoutQuote>(keys.withdrawPayoutQuote(quoteId));
    if (!stored || stored.userId !== userId) {
      throw new ValidationError("Quote expired or not found — request a new one");
    }
    await del(keys.withdrawPayoutQuote(quoteId)); // one-time use

    const country = requireWithdrawCountry(phone);
    const provider = requireWithdrawProvider(country);

    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user?.walletAddress) {
      throw new ValidationError("Your wallet is still being set up — try again in a moment");
    }

    const balanceRaw = await getUsdcBalance(user.walletAddress as Address);
    const requiredRaw = parseUnits(stored.amountUsd.toFixed(6), 6);
    if (balanceRaw < requiredRaw) throw new InsufficientFundsError();

    const reference = generateTxRef();

    // Funds auto-refund to refundAddress (the contributor's own wallet) if
    // the payout fails on Minisend's side — never a treasury, never lost.
    const order = await provider.createPayoutOrder({
      amountUsd: stored.amountUsd,
      currency: stored.currency,
      recipient: stored.recipient,
      refundAddress: user.walletAddress,
      reference,
      idempotencyKey: `withdraw:${userId}:${reference}`,
    });

    const [tx] = await db
      .insert(transactions)
      .values({
        reference,
        senderId: userId,
        recipientPhone: phone,
        recipientUserId: userId,
        recipientWalletAddress: order.depositAddress,
        amountUsdc: order.totalDepositUsdc.toFixed(6),
        amountLocal: order.amountLocal.toFixed(2),
        localCurrency: order.currency,
        fxRate: order.rate.toFixed(8),
        fxLockedAt: new Date(),
        token: "USDC",
        rail: "minisend",
        railReference: order.orderId,
        feeUsdc: (order.feeLocal / order.rate).toFixed(6),
        note: "Contributor payout via Minisend",
      })
      .returning();

    await recordSettlementStep(tx.id, "initiated");

    let txHash: string;
    try {
      txHash = await transferUsdc(
        user.phoneHash,
        user.walletAddress as Address,
        order.depositAddress as Address,
        order.totalDepositUsdc
      );
    } catch (err) {
      await recordSettlementStep(tx.id, "failed", {
        stage: "onchain_send",
        error: (err as Error).message,
      });
      throw err;
    }

    await db.update(transactions).set({ txHash }).where(eq(transactions.id, tx.id));
    await recordSettlementStep(tx.id, "onchain", { txHash });

    // NGN deposits are auto-detected by Minisend; KES/GHS/UGX need the hash
    // submitted explicitly to trigger the fiat payout.
    if (order.currency !== "NGN") {
      try {
        await provider.submitDeposit(order.orderId, txHash);
      } catch (err) {
        // The USDC has already left the wallet at this point — this isn't a
        // failed withdrawal, it's an unconfirmed one that needs a human to
        // check Minisend's dashboard for order.orderId. Surface as
        // requires_review rather than failed (which would incorrectly imply
        // the funds are safe/unmoved).
        await recordSettlementStep(tx.id, "requires_review", {
          stage: "submit_deposit",
          error: (err as Error).message,
          orderId: order.orderId,
          txHash,
        });
        return c.json({
          ok: true,
          data: {
            transactionId: tx.id,
            reference,
            orderId: order.orderId,
            txHash,
            status: "requires_review",
          },
        });
      }
    }

    await recordSettlementStep(tx.id, "routed", { orderId: order.orderId });

    return c.json({
      ok: true,
      data: {
        transactionId: tx.id,
        reference,
        orderId: order.orderId,
        txHash,
        amountLocal: order.amountLocal,
        localCurrency: order.currency,
        status: "routed",
      },
    });
  }
);
