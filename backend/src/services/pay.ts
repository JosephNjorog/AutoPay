import { randomUUID } from "crypto";
import { setex, getJson, del } from "../lib/redis";
import type { PayQuote, PayRail, PayableAsset } from "@tuma/shared";
import { getMidRate, QUOTE_TTL_SECONDS } from "./fx";
import { getAvaxPriceUsd } from "./avalanche";

const SPREAD = parseFloat(process.env.FX_SPREAD ?? "0.023");
const KES = "KES";

const payQuoteKey = (quoteId: string) => `pay_quote:${quoteId}`;

/**
 * Merchant Pay quote — Kenya/KES only for now. Mirrors createFxQuote's
 * one-time, Redis-backed, rate-locked quote (same 35s TTL).
 */
export async function createPayQuote(
  amountUsd: number,
  rail: PayRail,
  token: PayableAsset = "USDC"
): Promise<PayQuote> {
  const midRate = await getMidRate(KES);
  const tumaRate = midRate * (1 - SPREAD);
  const toAmount = parseFloat((amountUsd * tumaRate).toFixed(2));

  const bankRate = midRate * 0.95;
  const bankAmount = amountUsd * bankRate;
  const savingsVsBank = parseFloat((toAmount - bankAmount).toFixed(2));

  const quoteId = randomUUID();
  const lockedUntil = new Date(Date.now() + 30_000).toISOString();

  // See createFxQuote in fx.ts for why AVAX locks a price/quantity here.
  let tokenPriceUsd: number | undefined;
  let tokenAmount: number | undefined;
  if (token === "AVAX") {
    tokenPriceUsd = await getAvaxPriceUsd();
    tokenAmount = parseFloat((amountUsd / tokenPriceUsd).toFixed(8));
  }

  const quote: PayQuote = {
    quoteId,
    fromToken: token,
    fromAmountUsd: amountUsd,
    toAmount,
    toCurrency: KES,
    tumaRate,
    midRate,
    savingsVsBank,
    rail,
    lockedUntil,
    ...(tokenPriceUsd !== undefined ? { tokenPriceUsd, tokenAmount } : {}),
  };

  await setex<PayQuote>(payQuoteKey(quoteId), QUOTE_TTL_SECONDS, quote);
  return quote;
}

export async function consumePayQuote(quoteId: string): Promise<PayQuote> {
  const quote = await getJson<PayQuote>(payQuoteKey(quoteId));
  if (!quote) throw new Error("Pay quote expired or not found");

  // One-time use: delete after consumption
  await del(payQuoteKey(quoteId));

  return quote;
}
