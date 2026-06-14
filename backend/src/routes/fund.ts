/**
 * Fund wallet routes — all card payments go through Paystack.
 * Bank transfer returns a generated virtual account.
 * Crypto shows the user's Avalanche wallet address directly.
 */

import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../db";
import { users, transactions } from "../db/schema";
import { eq } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import {
  initializeCardPayment,
  verifyPaystackWebhook,
} from "../services/rails/paystack";
import { initiateSTKPush } from "../services/rails/mpesa";
import { creditFromFloat } from "../services/avalanche";
import { generateTxRef } from "../lib/crypto";
import { setex } from "../lib/redis";
import { keys } from "../lib/redis";
import { NotFoundError } from "../lib/errors";
import type { Address } from "viem";

export const fundRouter = new Hono();
fundRouter.use("*", authMiddleware);

// POST /api/fund/card  ─── Paystack card checkout
fundRouter.post(
  "/card",
  zValidator("json", z.object({ amountUsd: z.number().positive().max(5000) })),
  async (c) => {
    const { amountUsd } = c.req.valid("json");
    const { sub: userId, phone } = c.get("user");

    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new NotFoundError("User");

    const reference = generateTxRef();
    const successUrl = `${process.env.APP_URL}/dashboard?funded=1&ref=${reference}`;

    // Paystack uses email — we use the user's phone as a proxy email for now
    const email = `${phone.replace("+", "")}@tuma.user`;

    const { authorizationUrl, accessCode } = await initializeCardPayment(
      email,
      amountUsd,
      reference,
      successUrl
    );

    // Record a pending fund transaction
    await db.insert(transactions).values({
      reference,
      senderId: null,
      recipientPhone: phone,
      recipientUserId: userId,
      recipientWalletAddress: user.walletAddress,
      amountUsdc: amountUsd.toFixed(6),
      amountLocal: amountUsd.toFixed(2),
      localCurrency: "USD",
      fxRate: "1.00000000",
      token: "USDC",
      rail: "paystack",
      status: "initiated",
      note: "Card funding via Paystack",
    });

    return c.json({
      ok: true,
      data: {
        authorizationUrl,
        accessCode,
        reference,
        // Fee breakdown
        fee: parseFloat((amountUsd * 0.015).toFixed(2)),
        feePercent: "1.5%",
        youReceive: parseFloat((amountUsd * 0.985).toFixed(2)),
        currency: "USDC",
      },
    });
  }
);

// POST /api/fund/mobile  ─── M-Pesa STK Push (Kenya only)
fundRouter.post("/mobile", async (c: Context) => {
    const body = await c.req.json();
    const parsed = z.object({ amountKes: z.number().positive().max(500_000) }).safeParse(body);
    if (!parsed.success) {
      return c.json({ ok: false, error: "amountKes must be a positive number up to 500,000" }, 422);
    }
    const { amountKes } = parsed.data;
    const { sub: userId, phone } = c.get("user");

    if (!phone.startsWith("+254")) {
      return c.json({ ok: false, error: "M-Pesa is only available for Kenyan numbers" }, 400);
    }

    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new NotFoundError("User");

    const reference = generateTxRef();
    const { checkoutRequestId } = await initiateSTKPush(phone, amountKes, reference);

    // Store CheckoutRequestID → reference in Redis so the STK webhook can reconcile
    await setex(keys.stkRef(checkoutRequestId), 600, reference);

    // Approximate USD value for ledger (live rate used at settlement time)
    const amountUsd = parseFloat((amountKes / 130).toFixed(6));

    await db.insert(transactions).values({
      reference,
      senderId: null,
      recipientPhone: phone,
      recipientUserId: userId,
      recipientWalletAddress: user.walletAddress,
      amountUsdc: amountUsd.toFixed(6),
      amountLocal: amountKes.toFixed(2),
      localCurrency: "KES",
      fxRate: "130.00000000",
      token: "USDC",
      rail: "mpesa",
      status: "initiated",
      note: "M-Pesa STK Push funding",
    });

    return c.json({
      ok: true,
      data: {
        checkoutRequestId,
        reference,
        amountKes,
        estimatedUsdc: amountUsd,
        message: "Check your phone for the M-Pesa prompt and enter your PIN.",
      },
    });
  }
);

// GET /api/fund/bank  ─── Virtual bank account (static per user)
fundRouter.get("/bank", async (c) => {
  const { sub: userId, phone } = c.get("user");

  // In production this would call Paystack's Dedicated Virtual Accounts API
  // or similar to generate a unique account per user.
  // For now we return a deterministic placeholder.
  const lastDigits = phone.slice(-4);

  return c.json({
    ok: true,
    data: {
      bankName: "Guaranty Trust Bank",
      accountName: "TUMA / " + phone,
      accountNumber: `020${lastDigits}0001`,
      routingReference: `TMA-${userId.slice(0, 8).toUpperCase()}`,
      fee: 0.30,
      feeCurrency: "USD",
      note: "Transfer exact amount. Funds credited within 1-3 business hours.",
      expiresIn: "24h",
    },
  });
});

// GET /api/fund/crypto  ─── Direct on-chain deposit
fundRouter.get("/crypto", async (c) => {
  const { sub: userId } = c.get("user");
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new NotFoundError("User");

  return c.json({
    ok: true,
    data: {
      walletAddress: user.walletAddress,
      network: "Avalanche C-Chain",
      chainId: process.env.NODE_ENV === "production" ? 43114 : 43113,
      supportedTokens: ["USDC", "USDT", "AVAX"],
      usdcAddress: process.env.USDC_ADDRESS,
      usdtAddress: process.env.USDT_ADDRESS,
      fee: "Free",
      note: "Only send tokens on Avalanche C-Chain (not Avalanche X-Chain or P-Chain).",
    },
  });
});

// POST /api/webhooks/paystack  ─── Paystack payment webhook
// Note: this endpoint is NOT behind authMiddleware — it's called by Paystack
export const paystackWebhookRouter = new Hono();

paystackWebhookRouter.post("/", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("x-paystack-signature") ?? "";

  if (!verifyPaystackWebhook(rawBody, signature)) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const event = JSON.parse(rawBody) as {
    event: string;
    data: { reference: string; status: string; amount: number; currency: string };
  };

  if (event.event === "charge.success") {
    const { reference, amount, currency } = event.data;

    // Find the pending fund transaction
    const tx = await db.query.transactions.findFirst({
      where: eq(transactions.reference, reference),
      with: { recipient: true },
    });

    if (tx && tx.status === "initiated") {
      await db
        .update(transactions)
        .set({ status: "settled", settledAt: new Date(), updatedAt: new Date() })
        .where(eq(transactions.reference, reference));

      // Credit USDC from TUMA float to the user's smart wallet (non-blocking)
      const walletAddress = (tx as unknown as { recipient?: { walletAddress?: string } })
        ?.recipient?.walletAddress;
      const amountUsdc = parseFloat(tx.amountUsdc);

      if (walletAddress && amountUsdc > 0) {
        creditFromFloat(walletAddress as `0x${string}`, amountUsdc).catch((err: Error) =>
          console.error(`[Paystack] USDC credit failed ref=${reference}:`, err.message)
        );
      }

      console.log(`[Paystack] ✓ Card funded ref=${reference} amount=${amount / 100} ${currency}`);
    }
  }

  return c.json({ received: true });
});
