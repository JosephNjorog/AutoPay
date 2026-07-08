import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  PAY_CONFIG,
  InitiatePaymentSchema,
  PayQuoteRequestSchema,
  dialCodeToCountry,
  type CountryPayConfig,
  type PayRail,
} from "@tuma/shared";
import { db } from "../db";
import { users, transactions } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { sendMoneyLimiter } from "../middleware/rateLimit";
import { createPayQuote, consumePayQuote } from "../services/pay";
import { transferPayUsdc, getPayUsdcBalance } from "../services/avalanche-pay";
import { recordSettlementStep } from "../services/settlement";
import { processPayB2BDisbursement } from "../services/pay-disbursement";
import { enqueuePayB2BDisburse } from "../lib/queue";
import {
  normalizeIdempotencyKey,
  acquireIdempotencyLock,
  releaseIdempotencyLock,
  markRequiresReview,
} from "../lib/idempotency";
import { generateTxRef } from "../lib/crypto";
import {
  FxQuoteExpiredError,
  InsufficientFundsError,
  NotFoundError,
  ValidationError,
  ConflictError,
  BlockchainError,
} from "../lib/errors";
import { setex, getJson } from "../lib/redis";
import { parseUnits } from "viem";
import type { Address } from "viem";

export const payRouter = new Hono();
payRouter.use("*", authMiddleware);

type PayTransaction = typeof transactions.$inferSelect;

const FALLBACK_PAY_CONFIG: CountryPayConfig = {
  countryCode: "XX",
  countryName: "your country",
  status: "coming_soon",
  currency: "USD",
  currencySymbol: "$",
  methods: [],
};

// Merchant Pay is sandbox-only and defaults OFF everywhere, including
// production — it only turns on where an operator has deliberately set
// PAY_FEATURE_ENABLED=true (e.g. local/demo environments with the Daraja
// sandbox credentials configured). Off/unset always reports every country
// as coming_soon, so /quote and /initiate reject before ever touching a
// balance check or on-chain call — the same gate a real "not launched yet"
// country goes through.
const PAY_FEATURE_ENABLED = process.env.PAY_FEATURE_ENABLED === "true";

async function resolveCountryPayConfig(userId: string, phone: string): Promise<CountryPayConfig> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { countryCode: true },
  });
  const countryCode = user?.countryCode ?? dialCodeToCountry(phone)?.code;
  if (!countryCode) return FALLBACK_PAY_CONFIG;
  const config = PAY_CONFIG[countryCode] ?? { ...FALLBACK_PAY_CONFIG, countryCode };
  if (!PAY_FEATURE_ENABLED && config.status === "available") {
    return { ...config, status: "coming_soon", methods: [] };
  }
  return config;
}

function txToPayResponse(tx: PayTransaction, idempotentReplay = false, extra: Record<string, unknown> = {}) {
  return {
    transactionId: tx.id,
    reference: tx.reference,
    txHash: tx.txHash,
    rail: tx.rail,
    amountLocal: parseFloat(tx.amountLocal),
    localCurrency: tx.localCurrency,
    status: tx.status,
    merchantPayMethod: tx.merchantPayMethod,
    merchantTillNumber: tx.merchantTillNumber,
    merchantPaybillNumber: tx.merchantPaybillNumber,
    merchantAccountNumber: tx.merchantAccountNumber,
    idempotentReplay,
    ...extra,
  };
}

// GET /api/pay/config
// Backend-driven merchant payment methods for the account's own country, so
// adding a country/method later is a config change, not a client release.
payRouter.get("/config", async (c) => {
  const { sub: userId, phone } = c.get("user");
  const config = await resolveCountryPayConfig(userId, phone);

  const cacheKey = `pay:config:${config.countryCode}`;
  const cached = await getJson<CountryPayConfig>(cacheKey);
  if (cached !== null) return c.json({ ok: true, data: cached });

  await setex(cacheKey, 3600, config);
  return c.json({ ok: true, data: config });
});

// POST /api/pay/quote
payRouter.post("/quote", zValidator("json", PayQuoteRequestSchema), async (c) => {
  const { amountUsd, payMethod } = c.req.valid("json");
  const { sub: userId, phone } = c.get("user");

  const config = await resolveCountryPayConfig(userId, phone);
  if (config.status !== "available" || !config.methods.some((m) => m.kind === payMethod)) {
    throw new ValidationError(`Pay is not available in ${config.countryName} yet`);
  }

  const rail: PayRail = payMethod === "buy_goods" ? "mpesa_b2b_till" : "mpesa_b2b_paybill";
  const quote = await createPayQuote(amountUsd, rail);
  return c.json({ ok: true, data: quote });
});

// POST /api/pay/initiate
payRouter.post(
  "/initiate",
  sendMoneyLimiter,
  zValidator("json", InitiatePaymentSchema),
  async (c) => {
    const {
      quoteId,
      payMethod,
      merchantNumber,
      accountNumber,
      amountUsd,
      idempotencyKey: bodyKey,
    } = c.req.valid("json");
    const { sub: userId, phone } = c.get("user");
    const idempotencyKey = normalizeIdempotencyKey(c, bodyKey);

    if (idempotencyKey) {
      const existing = await db.query.transactions.findFirst({
        where: and(eq(transactions.senderId, userId), eq(transactions.idempotencyKey, idempotencyKey)),
      });
      if (existing) return c.json({ ok: true, data: txToPayResponse(existing, true) });
    }

    const lockKey = await acquireIdempotencyLock("pay", userId, idempotencyKey);
    if (idempotencyKey && !lockKey) {
      const existing = await db.query.transactions.findFirst({
        where: and(eq(transactions.senderId, userId), eq(transactions.idempotencyKey, idempotencyKey)),
      });
      if (existing) return c.json({ ok: true, data: txToPayResponse(existing, true) });
      throw new ConflictError("A payment with this idempotency key is already processing.");
    }

    try {
      const config = await resolveCountryPayConfig(userId, phone);
      const methodConfig = config.methods.find((m) => m.kind === payMethod);
      if (config.status !== "available" || !methodConfig) {
        throw new ValidationError(`Pay is not available in ${config.countryName} yet`);
      }
      if (methodConfig.requiresAccountNumber && !accountNumber) {
        throw new ValidationError("Account number is required for PayBill");
      }

      let quote;
      try {
        quote = await consumePayQuote(quoteId);
      } catch {
        throw new FxQuoteExpiredError();
      }
      if (Math.abs(quote.fromAmountUsd - amountUsd) > 0.01) throw new FxQuoteExpiredError();

      const sender = await db.query.users.findFirst({ where: eq(users.id, userId) });
      if (!sender?.walletAddress) throw new NotFoundError("Sender wallet");

      const balanceRaw = await getPayUsdcBalance(sender.walletAddress as Address);
      const requiredRaw = parseUnits(amountUsd.toFixed(6), 6);
      if (balanceRaw < requiredRaw) throw new InsufficientFundsError();

      const treasuryAddress = process.env.TREASURY_ADDRESS as Address | undefined;
      if (!treasuryAddress) throw new BlockchainError("TREASURY_ADDRESS is not configured");

      const reference = generateTxRef();

      const [tx] = await db
        .insert(transactions)
        .values({
          reference,
          idempotencyKey,
          senderId: userId,
          recipientPhone: null,
          amountUsdc: amountUsd.toFixed(6),
          amountLocal: quote.toAmount.toFixed(2),
          localCurrency: quote.toCurrency,
          fxRate: quote.tumaRate.toFixed(8),
          fxLockedAt: new Date(quote.lockedUntil),
          token: "USDC",
          rail: quote.rail,
          merchantPayMethod: payMethod,
          merchantTillNumber: payMethod === "buy_goods" ? merchantNumber : null,
          merchantPaybillNumber: payMethod === "paybill" ? merchantNumber : null,
          merchantAccountNumber: payMethod === "paybill" ? accountNumber ?? null : null,
        })
        .returning();

      await recordSettlementStep(tx.id, "initiated");

      let stage = "pay_onchain_debit";
      try {
        // Debit the user's stablecoin to the Tuma treasury FIRST. If the
        // Daraja B2B call subsequently fails, the callback handler auto-
        // refunds this exact amount — see webhooks.ts's b2b/result handler.
        // Always Fuji testnet (see services/avalanche-pay.ts), regardless
        // of NODE_ENV, since Merchant Pay is sandbox-only.
        const txHash = await transferPayUsdc(
          sender.walletAddress as Address,
          treasuryAddress,
          amountUsd
        );

        await db.update(transactions).set({ txHash, updatedAt: new Date() }).where(eq(transactions.id, tx.id));
        await recordSettlementStep(tx.id, "onchain", { txHash });

        stage = "pay_b2b_disbursement";
        const disburseJob = {
          transactionId: tx.id,
          payMethod,
          merchantNumber,
          accountNumber,
          amountKes: quote.toAmount,
          reference,
        };

        const queued = await enqueuePayB2BDisburse(disburseJob);
        let railReference: string | null = null;
        let responseStatus = "onchain";

        if (!queued) {
          const result = await processPayB2BDisbursement(disburseJob);
          railReference = result.railReference;
          responseStatus = "routed";
        }

        return c.json({
          ok: true,
          data: txToPayResponse(tx, false, {
            txHash,
            status: responseStatus,
            amountLocal: quote.toAmount,
            railReference,
            railQueued: queued,
          }),
        });
      } catch (err) {
        // If we already have a txHash for this transaction, the on-chain
        // debit happened and the failure is in the B2B leg — needs a human,
        // same posture as every other unclear-money-movement case in this
        // app (see docs/adr/0002).
        await markRequiresReview(tx.id, stage, err);
        throw err;
      }
    } finally {
      await releaseIdempotencyLock(lockKey);
    }
  }
);
