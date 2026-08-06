import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  WithdrawSchema,
  dialCodeToCountry,
  type CountryConfig,
  type Rail,
} from "@tuma/shared";
import { db } from "../db";
import { users, transactions } from "../db/schema";
import { eq } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { withdrawLimiter } from "../middleware/rateLimit";
import {
  getMidRate,
  computeCashoutFeeUsd,
  computeNetworkFeeUsd,
} from "../services/fx";
import { transferUsdc, getUsdcBalance } from "../services/avalanche";
import { disburseToRail } from "../services/rails";
import { railProviderIdempotencyKey } from "../services/rail-disbursement";
import {
  startSettlementFlow,
  recordSettlementStep,
} from "../services/settlement";
import {
  getProviderForCountry,
  type PayoutRecipient,
} from "../services/settlement-providers";
import { generateTxRef } from "../lib/crypto";
import { getJson, setex, del, keys } from "../lib/redis";
import {
  InsufficientFundsError,
  NotFoundError,
  ValidationError,
  BlockchainError,
} from "../lib/errors";
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
    if (!country)
      throw new ValidationError(
        "Withdrawals are not yet available for your country",
      );

    const treasuryAddress = process.env.TREASURY_ADDRESS as Address | undefined;
    if (!treasuryAddress)
      throw new BlockchainError("TREASURY_ADDRESS is not configured");

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!user?.walletAddress) throw new NotFoundError("Wallet");

    const feeUsd = computeCashoutFeeUsd(amountUsd);
    const netUsd = parseFloat((amountUsd - feeUsd).toFixed(6));
    if (netUsd <= 0)
      throw new ValidationError("Amount too small to cover the network fee");

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
      amountUsd,
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
        "withdraw_rail_disbursement",
      ),
    });

    await startSettlementFlow(
      tx.id,
      txHash,
      country.primaryRail as Rail,
      railReference,
    );

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
  },
);

// ── Contributor self-withdraw (Pretium off-ramp) ────────────────────────────────
// Sends directly from the contributor's own wallet to Pretium's settlement
// wallet address — no treasury involved. Kept as separate routes from the
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
  networkFeeUsd: number;
  currency: string;
  countryCode: string;
  recipient: PayoutRecipient;
  // Captured at quote time — Pretium doesn't create a payout record (and
  // therefore doesn't return fresh rate/amountLocal figures) until
  // initiatePayout() runs post-on-chain-send, so the initial transaction row
  // uses these locked-in values and gets corrected from initiatePayout()'s
  // response afterward.
  rate: number;
  amountLocal: number;
  feeLocal: number;
  recipientAmount: number;
};

// KES mobile recipients expect local format (0XXXXXXXXX); GHS/UGX accept
// either — confirm this still holds for Pretium's shortcode field once
// sandbox access exists (carried over from the prior Minisend integration).
function toPretiumPhone(phone: string, country: CountryConfig): string {
  return country.code === "KE" ? phone.replace(country.dialCode, "0") : phone;
}

function buildRecipient(
  input: z.infer<typeof RecipientInputSchema>,
  country: CountryConfig,
  accountName: string,
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
    phone: toPretiumPhone(input.phone, country),
    mobileNetwork: input.mobileNetwork,
    accountName,
  };
}

function requireWithdrawCountry(phone: string): CountryConfig {
  const country = dialCodeToCountry(phone);
  if (!country)
    throw new ValidationError(
      "Withdrawals are not yet available for your country",
    );
  return country;
}

function requireWithdrawProvider(country: CountryConfig) {
  const provider = getProviderForCountry(country.code);
  if (!provider) {
    throw new ValidationError(
      `Mobile money withdrawals aren't available in ${country.name} yet`,
    );
  }
  return provider;
}

// POST /api/withdraw/payout/quote — preview the Pretium rate/fee for a
// contributor cash-out, no side effects (no order created yet).
withdrawRouter.post(
  "/payout/quote",
  withdrawLimiter,
  zValidator("json", PayoutQuoteSchema),
  async (c) => {
    const { amountUsd: requestedAmountUsd, recipient: recipientInput } =
      c.req.valid("json");
    const { sub: userId, phone } = c.get("user");

    const country = requireWithdrawCountry(phone);
    const provider = requireWithdrawProvider(country);

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!user) throw new NotFoundError("User");
    if (!user.walletAddress) {
      throw new ValidationError(
        "Your wallet is still being set up — try again in a moment",
      );
    }
    if (!user.fullName) {
      throw new ValidationError(
        "Add your name to your profile before withdrawing",
      );
    }

    const treasuryAddress = process.env.TREASURY_ADDRESS as Address | undefined;
    const networkFeeUsd = treasuryAddress ? computeNetworkFeeUsd() : 0;

    const balanceRaw = await getUsdcBalance(user.walletAddress as Address);
    const balanceUsd = parseFloat(formatUnits(balanceRaw, 6));
    if (balanceUsd <= networkFeeUsd) throw new InsufficientFundsError();

    // Requested amount is what actually reaches the recipient — the network
    // fee is charged on top, not carved out of it, so a "withdraw everything"
    // request (no amountUsd) uses the wallet's spare balance above the fee.
    const amountUsd =
      requestedAmountUsd ?? parseFloat((balanceUsd - networkFeeUsd).toFixed(6));
    const requiredRaw = parseUnits((amountUsd + networkFeeUsd).toFixed(6), 6);
    if (balanceRaw < requiredRaw) throw new InsufficientFundsError();

    const recipient = buildRecipient(recipientInput, country, user.fullName);
    const quote = await provider.getQuote({
      amountUsd,
      currency: country.currency,
      recipient,
    });

    // Cosmetic only — reuses the existing OXR-backed mid rate purely so the
    // shared FX UI's "savings vs banks" figure has something to compare
    // against. Pretium's own quote.rate is always what's actually used.
    const midRate = await getMidRate(country.currency).catch(() => quote.rate);

    const quoteId = randomUUID();
    const ttlSeconds = Math.max(
      15,
      Math.min(
        280,
        Math.round((new Date(quote.expiresAt).getTime() - Date.now()) / 1000),
      ),
    );
    const stored: StoredPayoutQuote = {
      userId,
      amountUsd,
      networkFeeUsd,
      currency: country.currency,
      countryCode: country.code,
      recipient,
      rate: quote.rate,
      amountLocal: quote.amountLocal,
      feeLocal: quote.feeLocal,
      recipientAmount: quote.recipientAmount,
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
        savingsVsBank: parseFloat(
          ((midRate - quote.rate) * amountUsd).toFixed(2),
        ),
        lockedUntil: quote.expiresAt,
        networkFeeUsd,
        feeLocal: quote.feeLocal,
        recipientName: quote.recipientName,
        provider: provider.name,
      },
    });
  },
);

// POST /api/withdraw/payout/confirm — resolves Pretium's settlement wallet,
// sends the on-chain USDC from the contributor's own wallet, then creates
// the Pretium payout record with the resulting tx hash. Not marked "settled"
// until the Pretium webhook (reconciled against the status API) confirms it.
withdrawRouter.post(
  "/payout/confirm",
  withdrawLimiter,
  zValidator("json", PayoutConfirmSchema),
  async (c) => {
    const { quoteId } = c.req.valid("json");
    const { sub: userId, phone } = c.get("user");

    const stored = await getJson<StoredPayoutQuote>(
      keys.withdrawPayoutQuote(quoteId),
    );
    if (!stored || stored.userId !== userId) {
      throw new ValidationError(
        "Quote expired or not found — request a new one",
      );
    }
    await del(keys.withdrawPayoutQuote(quoteId)); // one-time use

    const country = requireWithdrawCountry(phone);
    const provider = requireWithdrawProvider(country);

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!user?.walletAddress) {
      throw new ValidationError(
        "Your wallet is still being set up — try again in a moment",
      );
    }

    const treasuryAddress = process.env.TREASURY_ADDRESS as Address | undefined;

    const balanceRaw = await getUsdcBalance(user.walletAddress as Address);
    const requiredRaw = parseUnits(
      (stored.amountUsd + stored.networkFeeUsd).toFixed(6),
      6,
    );
    if (balanceRaw < requiredRaw) throw new InsufficientFundsError();

    const reference = generateTxRef();

    const { depositAddress, depositChain } = await provider.getDepositAddress({
      currency: stored.currency,
      chain: "avalanche",
      asset: "USDC",
    });
    if (!["avalanche", "avalanche-c-chain", "avax", "avax-c-chain"].includes(depositChain.toLowerCase())) {
      throw new BlockchainError(`Pretium returned a non-Avalanche deposit chain "${depositChain}" — refusing to send`);
    }

    // railReference holds `reference` (our own id) until initiatePayout()
    // returns Pretium's transaction_code below — no Pretium payout record
    // exists until the on-chain send has actually happened.
    const [tx] = await db
      .insert(transactions)
      .values({
        reference,
        senderId: userId,
        recipientPhone: phone,
        recipientUserId: userId,
        recipientWalletAddress: depositAddress,
        amountUsdc: stored.amountUsd.toFixed(6),
        amountLocal: stored.amountLocal.toFixed(2),
        localCurrency: stored.currency,
        fxRate: stored.rate.toFixed(8),
        fxLockedAt: new Date(),
        token: "USDC",
        rail: "pretium",
        railReference: reference,
        feeUsdc: (stored.feeLocal / stored.rate).toFixed(6),
        networkFeeUsdc: stored.networkFeeUsd.toFixed(6),
        note: "Contributor payout via Pretium",
      })
      .returning();

    await recordSettlementStep(tx.id, "initiated");

    let txHash: string;
    try {
      txHash = await transferUsdc(
        user.phoneHash,
        user.walletAddress as Address,
        depositAddress as Address,
        stored.amountUsd,
      );
    } catch (err) {
      await recordSettlementStep(tx.id, "failed", {
        stage: "onchain_send",
        error: (err as Error).message,
      });
      throw err;
    }

    await db
      .update(transactions)
      .set({ txHash })
      .where(eq(transactions.id, tx.id));
    await recordSettlementStep(tx.id, "onchain", { txHash });

    // Separate leg from the Pretium deposit above — recoups the relayer's
    // gas cost for this send, charged on the contributor's side.
    if (stored.networkFeeUsd > 0 && treasuryAddress) {
      transferUsdc(
        user.phoneHash,
        user.walletAddress as Address,
        treasuryAddress,
        stored.networkFeeUsd,
      ).catch((err) =>
        console.error(
          `[Withdraw] Network fee transfer failed for ${reference}:`,
          err.message,
        ),
      );
    }

    let orderId: string;
    try {
      const order = await provider.initiatePayout({
        amountUsd: stored.amountUsd,
        currency: stored.currency,
        recipient: stored.recipient,
        txHash,
        reference,
        idempotencyKey: `withdraw:${userId}:${reference}`,
      });
      orderId = order.orderId;
      await db
        .update(transactions)
        .set({ railReference: orderId })
        .where(eq(transactions.id, tx.id));
    } catch (err) {
      // The USDC has already left the wallet at this point — this isn't a
      // failed withdrawal, it's an unconfirmed one that needs a human to
      // check Pretium's dashboard for txHash. Surface as requires_review
      // rather than failed (which would incorrectly imply the funds are
      // safe/unmoved).
      await recordSettlementStep(tx.id, "requires_review", {
        stage: "initiate_payout",
        error: (err as Error).message,
        txHash,
      });
      return c.json({
        ok: true,
        data: {
          transactionId: tx.id,
          reference,
          txHash,
          status: "requires_review",
        },
      });
    }

    await recordSettlementStep(tx.id, "routed", { orderId });

    return c.json({
      ok: true,
      data: {
        transactionId: tx.id,
        reference,
        orderId,
        txHash,
        amountLocal: stored.amountLocal,
        localCurrency: stored.currency,
        status: "routed",
      },
    });
  },
);
