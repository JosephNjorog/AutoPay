import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { SendMoneySchema, COUNTRY_CONFIG, dialCodeToCountry, type Rail } from "@tuma/shared";
import { db } from "../db";
import { users, transactions, merchantSettings } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { sendMoneyLimiter } from "../middleware/rateLimit";
import { consumeQuote } from "../services/fx";
import {
  transferToken,
  transferNativeAvax,
  approveEscrowToken,
  depositToEscrowToken,
  getTokenBalance,
  getAvaxBalance,
  TOKEN_ADDRESSES,
  type StablecoinToken,
} from "../services/avalanche";
import { recordSettlementStep } from "../services/settlement";
import {
  processRailDisbursement,
  railProviderIdempotencyKey,
} from "../services/rail-disbursement";
import { lookupRailAccountName } from "../services/rails";
import { sendClaimLink, sendReceivedNotification } from "../services/whatsapp";
import { hashPhone, generateTxRef, generateEscrowRef } from "../lib/crypto";
import {
  FxQuoteExpiredError,
  InsufficientFundsError,
  NotFoundError,
  ValidationError,
  ConflictError,
} from "../lib/errors";
import { escrowPayments } from "../db/schema";
import {
  enqueueRailDisburse,
  enqueueWhatsAppNotify,
  scheduleEscrowExpiry,
  type RailDisburseJob,
} from "../lib/queue";
import { setex, getJson } from "../lib/redis";
import {
  normalizeIdempotencyKey,
  acquireIdempotencyLock,
  releaseIdempotencyLock,
  markRequiresReview,
} from "../lib/idempotency";
import { parseUnits } from "viem";
import type { Address } from "viem";

export const sendRouter = new Hono();
sendRouter.use("*", authMiddleware);

type SendTransaction = typeof transactions.$inferSelect;

function txToSendResponse(
  tx: SendTransaction,
  idempotentReplay = false,
  extra: Record<string, unknown> = {}
) {
  return {
    transactionId: tx.id,
    reference: tx.reference,
    txHash: tx.txHash,
    type: tx.isEscrow ? "escrow" : "direct",
    rail: tx.rail,
    amountLocal: parseFloat(tx.amountLocal),
    localCurrency: tx.localCurrency,
    status: tx.status,
    escrowRef: tx.escrowRef,
    claimUrl: tx.escrowRef ? `${process.env.APP_URL}/claim/${tx.escrowRef}` : null,
    failureStage: tx.failureStage,
    failureReason: tx.failureReason,
    idempotentReplay,
    ...extra,
  };
}

// GET /api/send/lookup?phone=+254...
// Fast check: is this phone number a registered Autopayke user?
// Cached in Redis for 60 s so repeated keystrokes don't hammer the DB.
sendRouter.get("/lookup", async (c) => {
  const phone = (c.req.query("phone") ?? "").trim();
  if (!/^\+[1-9]\d{6,18}$/.test(phone)) {
    throw new ValidationError("phone must be E.164 format e.g. +254712345678");
  }

  const phoneHash = hashPhone(phone);
  const cacheKey = `lookup:phone:${phoneHash}`;
  const cached = await getJson<{ registered: boolean }>(cacheKey);
  if (cached !== null) return c.json({ ok: true, data: cached });

  const user = await db.query.users.findFirst({
    where: eq(users.phoneHash, phoneHash),
    columns: { id: true, walletAddress: true },
  });

  const result = { registered: !!(user?.walletAddress) };
  await setex(cacheKey, 60, result);
  return c.json({ ok: true, data: result });
});

// GET /api/send/corridors
// Backend-driven list of supported destination countries, so adding a new
// corridor is a config change, not a client release.
sendRouter.get("/corridors", async (c) => {
  const cacheKey = "corridors:all";
  const cached = await getJson<unknown>(cacheKey);
  if (cached !== null) return c.json({ ok: true, data: cached });

  const corridors = Object.values(COUNTRY_CONFIG).map((country) => ({
    code: country.code,
    name: country.name,
    dial: country.dialCode,
    currency: country.currency,
    currencySymbol: country.currencySymbol,
    flag: country.flag,
    phoneLength: country.phoneLength,
    rail: country.primaryRail,
  }));

  await setex(cacheKey, 3600, corridors);
  return c.json({ ok: true, data: corridors });
});

// GET /api/send/verify-recipient?phone=+254...&country=KE
// Attempts to resolve the registered account name for the recipient name
// verification step. Returns available: false when no name can be resolved
// (today, always — see lookupRailAccountName) so the frontend can skip the
// confirmation step gracefully rather than block the send flow.
sendRouter.get("/verify-recipient", async (c) => {
  const phone = (c.req.query("phone") ?? "").trim();
  const countryCode = (c.req.query("country") ?? "").trim().toUpperCase();
  if (!/^\+[1-9]\d{6,18}$/.test(phone)) {
    throw new ValidationError("phone must be E.164 format e.g. +254712345678");
  }

  const phoneHash = hashPhone(phone);
  const cacheKey = `verify-recipient:${phoneHash}:${countryCode}`;
  const cached = await getJson<{ available: boolean; recipientName: string | null; source: string | null }>(cacheKey);
  if (cached !== null) return c.json({ ok: true, data: cached });

  const tumaUser = await db.query.users.findFirst({
    where: eq(users.phoneHash, phoneHash),
    columns: { id: true, walletAddress: true },
  });

  let result: { available: boolean; recipientName: string | null; source: "tuma_user" | "rail" | null };

  if (tumaUser?.walletAddress) {
    // Registered Autopayke users have no stored display name today — known
    // gap, not blocking; the frontend skips the verification step.
    console.warn("[Send] TUMA user name lookup unavailable — no stored display name");
    result = { available: false, recipientName: null, source: null };
  } else {
    const country = COUNTRY_CONFIG[countryCode] ?? dialCodeToCountry(phone);
    const rail = (country?.primaryRail ?? "bank") as Rail;
    const lookup = await lookupRailAccountName(rail, phone);
    result = lookup.available
      ? { available: true, recipientName: lookup.name, source: "rail" }
      : { available: false, recipientName: null, source: null };
  }

  await setex(cacheKey, 60, result);
  return c.json({ ok: true, data: result });
});

// POST /api/send
sendRouter.post(
  "/",
  sendMoneyLimiter,
  zValidator("json", SendMoneySchema),
  async (c) => {
    const { quoteId, recipientPhone, amountUsd, token, note, idempotencyKey: bodyKey } =
      c.req.valid("json");
    const { sub: userId } = c.get("user");
    const idempotencyKey = normalizeIdempotencyKey(c, bodyKey);

    if (idempotencyKey) {
      const existing = await db.query.transactions.findFirst({
        where: and(
          eq(transactions.senderId, userId),
          eq(transactions.idempotencyKey, idempotencyKey)
        ),
      });

      if (existing) {
        return c.json({
          ok: true,
          data: txToSendResponse(existing, true),
        });
      }
    }

    const lockKey = await acquireIdempotencyLock("send", userId, idempotencyKey);
    if (idempotencyKey && !lockKey) {
      const existing = await db.query.transactions.findFirst({
        where: and(
          eq(transactions.senderId, userId),
          eq(transactions.idempotencyKey, idempotencyKey)
        ),
      });

      if (existing) {
        return c.json({
          ok: true,
          data: txToSendResponse(existing, true),
        });
      }

      throw new ConflictError("A send with this idempotency key is already processing.");
    }

    try {
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
      quote.recipientPhone !== recipientPhone ||
      quote.fromToken !== token
    ) {
      throw new FxQuoteExpiredError();
    }

    // 3. Load sender
    const sender = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!sender?.walletAddress) throw new NotFoundError("Sender wallet");

    // 4. Detect if recipient is a TUMA user
    const recipientHash = hashPhone(recipientPhone);
    const recipient = await db.query.users.findFirst({
      where: eq(users.phoneHash, recipientHash),
    });

    const isTumaUser = !!recipient?.walletAddress;
    const isAvax = token === "AVAX";

    // AVAX is a native asset — AutopayEscrow only accepts ERC20 deposits, so
    // it can never back a send to a recipient who isn't already a TUMA user.
    if (isAvax && !isTumaUser) {
      throw new ValidationError(
        "AVAX transfers need the recipient to already have an Autopayke account — pick USDC/USDT, or ask them to sign up first."
      );
    }

    // 5. Check balance in the chosen token
    if (isAvax) {
      const avaxAmount = quote.tokenAmount;
      if (avaxAmount === undefined) throw new FxQuoteExpiredError();
      const balanceRaw = await getAvaxBalance(sender.walletAddress as Address);
      if (balanceRaw < parseUnits(avaxAmount.toFixed(18), 18)) {
        throw new InsufficientFundsError();
      }
    } else {
      const balanceRaw = await getTokenBalance(token as StablecoinToken, sender.walletAddress as Address);
      const requiredRaw = parseUnits(amountUsd.toFixed(6), 6);
      if (balanceRaw < requiredRaw) throw new InsufficientFundsError();
    }

    const reference = generateTxRef();

    // 6. Create transaction record (initiated)
    const [tx] = await db
      .insert(transactions)
      .values({
        reference,
        idempotencyKey,
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
      let stage = "direct_merchant_lookup";
      try {
        // Detect merchant payments: recipient has merchant mode on and till open.
        const recipientMerchant = recipient!.isMerchant
          ? await db.query.merchantSettings.findFirst({
              where: eq(merchantSettings.userId, recipient!.id),
            })
          : null;
        const isMerchantPayment = !!recipientMerchant?.tillOpen;
        const feeUsd = isMerchantPayment
          ? parseFloat(((amountUsd * recipientMerchant!.feeBps) / 10_000).toFixed(6))
          : 0;
        const netAmountUsd = parseFloat((amountUsd - feeUsd).toFixed(6));
        const netAmountLocal = isMerchantPayment
          ? parseFloat((netAmountUsd * quote.tumaRate).toFixed(2))
          : quote.toAmount;

        stage = "direct_onchain_transfer";
        const txHash = isAvax
          ? await transferNativeAvax(
              sender.walletAddress as Address,
              recipient!.walletAddress as Address,
              netAmountUsd / quote.tokenPriceUsd!
            )
          : await transferToken(
              token as StablecoinToken,
              recipientHash,
              sender.walletAddress as Address,
              recipient!.walletAddress as Address,
              netAmountUsd
            );

        stage = "direct_transaction_update";
        await db
          .update(transactions)
          .set({
            txHash,
            isMerchantPayment,
            merchantId: isMerchantPayment ? recipient!.id : null,
            feeUsdc: feeUsd.toFixed(6),
            updatedAt: new Date(),
          })
          .where(eq(transactions.id, tx.id));

        const treasuryAddress = process.env.TREASURY_ADDRESS as Address | undefined;
        if (isMerchantPayment && feeUsd > 0 && treasuryAddress) {
          const feePromise = isAvax
            ? transferNativeAvax(
                sender.walletAddress as Address,
                treasuryAddress,
                feeUsd / quote.tokenPriceUsd!
              )
            : transferToken(
                token as StablecoinToken,
                recipientHash,
                sender.walletAddress as Address,
                treasuryAddress,
                feeUsd
              );
          feePromise.catch((err) =>
            console.error(`[Send] Merchant fee transfer failed for ${reference}:`, err.message)
          );
        }

        stage = "direct_onchain_record";
        await recordSettlementStep(tx.id, "onchain", { txHash });

        // AVAX settles purely on-chain, straight to the recipient's own
        // wallet — there's no rail disbursement for it (M-Pesa payouts are
        // backed by stablecoin treasury liquidity, not AVAX), so once the
        // transfer above lands, the send is done. Routing it through the
        // rail-disbursement path would try to pay the recipient a *second*
        // time via M-Pesa for money they already received in their wallet.
        if (isAvax) {
          stage = "direct_settled";
          await recordSettlementStep(tx.id, "settled", { txHash, reason: "AVAX settles directly to recipient wallet" });

          enqueueWhatsAppNotify({
            to: recipientPhone,
            templateName: "tuma_received",
            params: [quote.toAmount.toFixed(2), quote.toCurrency, sender.phone],
          })
            .then((queued) => {
              if (!queued) {
                return sendReceivedNotification(
                  recipientPhone,
                  quote.toAmount.toFixed(2),
                  quote.toCurrency,
                  sender.phone
                );
              }
            })
            .catch(console.error);

          return c.json({
            ok: true,
            data: txToSendResponse(tx, false, {
              txHash,
              status: "settled",
              amountLocal: netAmountLocal,
              railReference: null,
              railQueued: false,
            }),
          });
        }

        const railJob: RailDisburseJob = {
          transactionId: tx.id,
          rail: quote.rail,
          recipientPhone,
          amountLocal: netAmountLocal,
          localCurrency: quote.toCurrency,
          reference,
          providerIdempotencyKey: railProviderIdempotencyKey(
            tx.id,
            "direct_rail_disbursement"
          ),
          failureStage: "direct_rail_disbursement",
          metadata: { txHash },
        };

        stage = "direct_rail_enqueue";
        const railQueued = await enqueueRailDisburse(railJob);
        let railReference: string | null = null;
        let responseStatus = "onchain";

        if (!railQueued) {
          stage = "direct_rail_disbursement";
          const result = await processRailDisbursement(railJob);
          railReference = result.railReference;
          responseStatus = result.status === "settled" ? "settled" : "routed";
        }

        // Notify recipient via WhatsApp; do not roll back money movement if
        // notification delivery has a transient provider issue.
        enqueueWhatsAppNotify({
          to: recipientPhone,
          templateName: "tuma_received",
          params: [quote.toAmount.toFixed(2), quote.toCurrency, sender.phone],
        })
          .then((queued) => {
            if (!queued) {
              return sendReceivedNotification(
                recipientPhone,
                quote.toAmount.toFixed(2),
                quote.toCurrency,
                sender.phone
              );
            }
          })
          .catch(console.error);

        return c.json({
          ok: true,
          data: txToSendResponse(tx, false, {
            txHash,
            status: responseStatus,
            amountLocal: netAmountLocal,
            railReference,
            railQueued,
          }),
        });
      } catch (err) {
        await markRequiresReview(tx.id, stage, err);
        throw err;
      }
    } else {
      // ── Escrow for non-TUMA recipient ────────────────────────────────────
      const escrowRef = generateEscrowRef();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      // isAvax is guaranteed false here (guarded above — escrow is ERC20-only).
      const escrowToken = token as StablecoinToken;

      let stage = "escrow_approve";
      try {
        // Approve escrow contract to pull the token from sender's smart wallet
        await approveEscrowToken(escrowToken, sender.walletAddress as Address, amountUsd);

        // Lock the token in TumaEscrow on-chain (sender's wallet calls escrow.deposit())
        stage = "escrow_deposit";
        const escrowTxHash = await depositToEscrowToken(
          escrowToken,
          sender.walletAddress as Address,
          escrowRef,
          amountUsd
        );

        // Store the on-chain hash immediately so recovery has the chain anchor
        // even if a later DB/queue/provider step fails.
        stage = "escrow_transaction_update";
        await db
          .update(transactions)
          .set({
            escrowRef,
            isEscrow: true,
            txHash: escrowTxHash,
            updatedAt: new Date(),
          })
          .where(eq(transactions.id, tx.id));
        await recordSettlementStep(tx.id, "onchain", { txHash: escrowTxHash, escrowRef });

        stage = "escrow_record";
        await db.insert(escrowPayments).values({
          ref: escrowRef,
          transactionId: tx.id,
          senderId: userId,
          recipientPhone,
          tokenAddress: TOKEN_ADDRESSES[escrowToken]!,
          amountUsdc: amountUsd.toFixed(6),
          onchainRef: escrowRef,
          expiresAt,
        });

        stage = "escrow_schedule_expiry";
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

        const claimUrl = `${process.env.APP_URL}/claim/${escrowRef}`;
        let notificationQueued = false;

        try {
          stage = "escrow_claim_link_enqueue";
          notificationQueued = await enqueueWhatsAppNotify({
            to: recipientPhone,
            templateName: "tuma_claim_link",
            params: [sender.phone, quote.toAmount.toFixed(2), quote.toCurrency, claimUrl],
            transactionId: tx.id,
            failureStage: "escrow_claim_link",
          });

          if (!notificationQueued) {
            stage = "escrow_claim_link";
            await sendClaimLink(
              recipientPhone,
              sender.phone,
              quote.toAmount.toFixed(2),
              quote.toCurrency,
              claimUrl
            );
          }
        } catch (err) {
          await markRequiresReview(tx.id, "escrow_claim_link", err);
          return c.json({
            ok: true,
            data: txToSendResponse(tx, false, {
              txHash: escrowTxHash,
              escrowRef,
              claimUrl,
              expiresAt: expiresAt.toISOString(),
              status: "requires_review",
              notificationStatus: "failed",
              message:
                "Funds are escrowed, but the claim link could not be sent automatically.",
            }),
          });
        }

        return c.json({
          ok: true,
          data: txToSendResponse(tx, false, {
            txHash: escrowTxHash,
            escrowRef,
            claimUrl,
            expiresAt: expiresAt.toISOString(),
            status: "onchain",
            notificationQueued,
            message: notificationQueued
              ? "Claim link queued for WhatsApp delivery"
              : "Claim link sent via WhatsApp to recipient",
          }),
        });
      } catch (err) {
        await markRequiresReview(tx.id, stage, err);
        throw err;
      }
    }
    } finally {
      await releaseIdempotencyLock(lockKey);
    }
  }
);
