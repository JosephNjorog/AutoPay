/**
 * Pretium — settlement provider covering both on-ramp (funding) and
 * off-ramp (send/withdraw/pay) via Avalanche USDC/USDT.
 * Docs: https://docs.pretium.africa
 *
 * ── What's CONFIRMED against the live docs (2026-08-06) ──────────────────────
 *   - Auth: header `x-api-key: <consumer_key>` on every partner endpoint
 *     (no token exchange). `Content-Type: application/json`.
 *   - Response envelope: success -> { code, message, data }; error -> the
 *     same shape but `data` is omitted. HTTP 400/401/403/404 per docs/errors.
 *   - POST /account/networks — empty JSON body, returns the account's
 *     enabled networks/assets. This is the workstream-1 verification call;
 *     see scripts/verify-pretium-networks.ts. Exact response field names are
 *     NOT confirmed (docs only describe them in prose: network name, icon,
 *     settlement wallet address, checkout status, assets) — parsed
 *     defensively below rather than typed, and the raw response is what the
 *     verification script prints for a human to read.
 *   - The general platform network list includes AVALANCHE with both USDC
 *     and USDT — but the on-ramp guide separately states on-ramp is
 *     currently limited to BASE (USDC) and CELO (USDT) chains only. This is
 *     exactly the gap the hard constraint in the integration spec warns
 *     about: do not assume off-ramp availability implies on-ramp
 *     availality. supportsCountry() and supportsOnrampCountry() are
 *     deliberately gated by separate env vars for this reason, and BOTH
 *     default to empty (nothing enabled) until a human confirms via
 *     /account/networks and sets PRETIUM_VERIFIED_{OFFRAMP,ONRAMP}_MARKETS.
 *   - Off-ramp: POST /v1/validation/{currency}, POST /v1/exchange-rate (or
 *     /v2 for ramp-availability flags), POST /v1/pay/{currency} (body
 *     includes `transaction_hash` directly), POST /v1/status/{currency}.
 *   - On-ramp: POST /v1/onramp/{currency} with { shortcode, amount,
 *     mobile_network, address, chain, asset, callback_url }.
 *   - Webhook payload fields (confirmed names): status, transaction_code,
 *     receipt_number, message, public_name.
 *   - Webhooks have NO documented signature scheme. Pretium's own docs say
 *     to "treat webhooks as at-least-once hints and reconcile with the
 *     status API" — so verify*WebhookSignature() below cannot do real
 *     cryptographic verification (there is nothing to verify against) and
 *     the webhook handlers built on top of this provider MUST re-fetch
 *     authoritative status via getOrder()/getOnrampSession() before
 *     crediting anything, never trust the webhook body directly.
 *
 * ── What's UNVERIFIED / best-effort (confirm once sandbox access exists) ────
 *   - Exact request/response field names for /v1/validation, /v1/exchange-
 *     rate, and the /v1/status request body — mapped below with a fallback
 *     chain across plausible field names rather than a single hard-coded
 *     key, and every such spot is commented individually.
 *   - The `type` enum Pretium expects for /v1/pay/{currency} distinguishing
 *     mobile/bank/paybill/till (PRETIUM_PAY_TYPE below) — inferred from
 *     Daraja-style terminology, not from a documented enum list.
 *   - Sandbox/production base URLs — the docs only show a `{{base_url}}`
 *     placeholder; PRETIUM_BASE_URL has no default and must be set from
 *     whatever Pretium provides during onboarding.
 *
 * ── Architecture note ─────────────────────────────────────────────────────
 *   POST /v1/pay/{currency} takes `transaction_hash` directly in the same
 *   call that creates the payout, implying a FIXED settlement wallet address
 *   per chain/asset (resolved via /account/networks) rather than a fresh
 *   per-order address. So this provider's off-ramp is two phases, matching
 *   the SettlementProvider interface's getDepositAddress()/initiatePayout()
 *   split: getDepositAddress() only resolves the settlement wallet (no
 *   Pretium order exists yet); initiatePayout() is where POST
 *   /v1/pay/{currency} actually runs, once txHash exists, and its response's
 *   transaction_code becomes the order's real tracking id.
 */

import { RailError } from "../../lib/errors";
import type {
  OnrampPayer,
  OnrampSession,
  OnrampSessionStatus,
  OnrampWebhookEvent,
  PayoutOrder,
  PayoutOrderStatus,
  PayoutQuote,
  PayoutRecipient,
  PayoutWebhookEvent,
  SettlementProvider,
} from "./types";

const BASE_URL = process.env.PRETIUM_BASE_URL;
const API_KEY = process.env.PRETIUM_API_KEY;

// Countries Pretium *might* support per the public platform docs. This is
// NOT the same as "enabled for this account" — supportsCountry() below
// additionally requires the country to appear in the verified-markets env
// vars, which stay empty until a human runs the /account/networks check.
const CANDIDATE_CURRENCY_BY_COUNTRY: Record<string, string> = {
  KE: "KES",
  UG: "UGX",
  NG: "NGN",
  GH: "GHS",
  TZ: "TZS",
};

const ACCEPTED_CHAINS = ["avalanche", "avalanche-c-chain", "avax", "avax-c-chain"];

// Pretium's mobile endpoints (both on-ramp `mobile_network` and off-ramp
// payout) need a specific network (Safaricom/Airtel/MTN/…), which isn't
// always collected upstream (e.g. Send/claim never asks the recipient which
// network they're on). This is a best-effort default — the market-leading
// network per country — not a real lookup; shared across Fund and the
// off-ramp claim-cashout path so there's one place to fix once either phone-
// prefix detection or a UX prompt replaces it.
export const DEFAULT_MOBILE_NETWORK_BY_COUNTRY: Record<string, string> = {
  KE: "Safaricom",
  UG: "MTN",
  GH: "MTN",
  TZ: "Vodacom",
  NG: "MTN",
};

function parseVerifiedMarkets(envVar: string | undefined): Set<string> {
  return new Set(
    (envVar ?? "")
      .split(",")
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean)
  );
}

// Comma-separated country codes, e.g. "KE,UG" — populated only after a human
// has run scripts/verify-pretium-networks.ts and confirmed the market is
// actually enabled on this Pretium account. See the hard constraint in the
// integration spec: the public markets list must never be assumed to apply.
const VERIFIED_OFFRAMP_MARKETS = parseVerifiedMarkets(process.env.PRETIUM_VERIFIED_OFFRAMP_MARKETS);
const VERIFIED_ONRAMP_MARKETS = parseVerifiedMarkets(process.env.PRETIUM_VERIFIED_ONRAMP_MARKETS);

type PretiumEnvelope<T> = { code: number; message: string; data?: T };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries only transient network failures and 5xx responses — never a 4xx,
 * since a 4xx means Pretium already received and evaluated the request
 * (retrying could double-submit a payout). For POST /v1/pay/{currency}
 * specifically, Pretium's own documented error "Hash already processed"
 * indicates the transaction_hash itself is the idempotency key server-side,
 * which is an additional safety net if a retry ever did re-reach that
 * endpoint.
 */
async function pretiumFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!API_KEY) throw new RailError("pretium", "PRETIUM_API_KEY is not configured");
  if (!BASE_URL) throw new RailError("pretium", "PRETIUM_BASE_URL is not configured");

  const maxAttempts = 3;
  let delayMs = 300;
  let res: Response | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      res = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: {
          "x-api-key": API_KEY,
          "Content-Type": "application/json",
          ...options.headers,
        },
      });
    } catch (err) {
      if (attempt === maxAttempts) {
        throw new RailError("pretium", `Network error after ${maxAttempts} attempts: ${(err as Error).message}`);
      }
      await sleep(delayMs);
      delayMs *= 2;
      continue;
    }

    if (res.status >= 500 && attempt < maxAttempts) {
      await sleep(delayMs);
      delayMs *= 2;
      continue;
    }
    break;
  }

  const raw = (await res!.json().catch(() => null)) as PretiumEnvelope<T> | null;
  if (!res!.ok || !raw || raw.data === undefined) {
    throw new RailError("pretium", raw?.message ?? `HTTP ${res!.status}`);
  }
  return raw.data;
}

/** Workstream-1 verification call — see scripts/verify-pretium-networks.ts. */
export async function verifyPretiumAccountNetworks(): Promise<unknown> {
  return pretiumFetch<unknown>("/account/networks", { method: "POST", body: "{}" });
}

/**
 * Resolves the fixed settlement wallet address for a chain/asset from
 * /account/networks. Field names in the response are unconfirmed (see file
 * header), so this parses defensively across plausible key spellings and
 * throws rather than guessing — sending USDC to a misparsed address is
 * unrecoverable.
 */
async function getSettlementWalletAddress(chain: string, asset: "USDC" | "USDT"): Promise<string> {
  const data = await verifyPretiumAccountNetworks();
  const entries = Array.isArray(data) ? data : (data as { networks?: unknown[] })?.networks;
  if (!Array.isArray(entries)) {
    throw new RailError("pretium", "Unexpected /account/networks response shape — cannot resolve settlement address");
  }

  const entry = entries.find((e) => {
    const rec = e as Record<string, unknown>;
    const network = String(rec.network ?? rec.chain ?? "").toLowerCase();
    const assets = rec.assets ?? rec.tokens ?? [];
    const assetList = Array.isArray(assets) ? assets.map((a) => String(a).toUpperCase()) : [];
    return ACCEPTED_CHAINS.includes(network) && assetList.includes(asset);
  }) as Record<string, unknown> | undefined;

  const address =
    entry?.settlement_wallet_address ?? entry?.settlementWalletAddress ?? entry?.wallet_address ?? entry?.address;

  if (!entry || typeof address !== "string" || !address) {
    throw new RailError(
      "pretium",
      `No verified ${chain}/${asset} settlement wallet in /account/networks — refusing to send`
    );
  }
  return address;
}

// Inferred from Daraja-style terminology used elsewhere in Pretium's KES
// examples — NOT a documented enum. Confirm against a real sandbox response
// before relying on this for a live payout.
const PRETIUM_PAY_TYPE: Record<PayoutRecipient["method"], string> = {
  mobile: "MOBILE",
  bank: "BANK",
  paybill: "PAYBILL",
  till: "BUY_GOODS",
};

function toPretiumShortcode(recipient: PayoutRecipient): string {
  switch (recipient.method) {
    case "mobile":
      return recipient.phone;
    case "bank":
      return recipient.accountNumber;
    case "paybill":
    case "till":
      return recipient.businessNumber;
  }
}

function mapPretiumStatus(status: string): PayoutOrderStatus {
  const normalized = status.toLowerCase();
  if (normalized.includes("success") || normalized.includes("complete")) return "completed";
  if (normalized.includes("fail")) return "failed";
  if (normalized.includes("expire")) return "expired";
  if (normalized.includes("settl")) return "settling";
  return "pending";
}

function mapOnrampStatus(status: string): OnrampSessionStatus {
  const normalized = status.toLowerCase();
  if (normalized.includes("success") || normalized.includes("complete")) return "completed";
  if (normalized.includes("fail")) return "failed";
  if (normalized.includes("expire")) return "expired";
  if (normalized.includes("process") || normalized.includes("settl")) return "processing";
  return "pending";
}

export const pretiumProvider: SettlementProvider = {
  name: "pretium",

  supportsCountry(countryCode) {
    return countryCode in CANDIDATE_CURRENCY_BY_COUNTRY && VERIFIED_OFFRAMP_MARKETS.has(countryCode);
  },

  async getQuote({ amountUsd, currency }) {
    // Field names unconfirmed — see file header. Falls back across
    // plausible spellings rather than a single hard-coded key.
    const data = await pretiumFetch<Record<string, unknown>>("/v2/exchange-rate", {
      method: "POST",
      body: JSON.stringify({ currency, amount: amountUsd }),
    });

    const rate = Number(data.rate ?? data.sell_rate ?? data.buy_rate ?? 0);
    const amountLocal = Number(data.amount_local ?? amountUsd * rate);
    const feeLocal = Number(data.fee ?? data.fee_local ?? 0);

    return {
      amountUsdc: amountUsd,
      currency,
      rate,
      amountLocal,
      feeLocal,
      recipientAmount: amountLocal - feeLocal,
      recipientName: null,
      expiresAt: String(data.expires_at ?? new Date(Date.now() + 60_000).toISOString()),
    };
  },

  async validateRecipient({ currency, recipient }) {
    const data = await pretiumFetch<Record<string, unknown>>(`/v1/validation/${encodeURIComponent(currency)}`, {
      method: "POST",
      body: JSON.stringify({
        type: PRETIUM_PAY_TYPE[recipient.method],
        shortcode: toPretiumShortcode(recipient),
      }),
    });
    const recipientName = data.public_name ?? data.recipient_name ?? data.account_name ?? null;
    return { valid: Boolean(data.valid ?? recipientName), recipientName: recipientName ? String(recipientName) : null };
  },

  async getDepositAddress({ chain, asset }) {
    const depositAddress = await getSettlementWalletAddress(chain, asset);
    return { depositAddress, depositChain: "avalanche" };
  },

  // The actual POST /v1/pay/{currency} call — see the file header's
  // "Architecture note". Only runs once txHash exists, and its
  // transaction_code becomes the payout's authoritative tracking id.
  async initiatePayout({ amountUsd, currency, recipient, txHash, reference }) {
    const data = await pretiumFetch<Record<string, unknown>>(`/v1/pay/${encodeURIComponent(currency)}`, {
      method: "POST",
      body: JSON.stringify({
        transaction_hash: txHash,
        chain: "AVALANCHE",
        type: PRETIUM_PAY_TYPE[recipient.method],
        shortcode: toPretiumShortcode(recipient),
        amount: amountUsd,
        mobile_network: recipient.method === "mobile" ? recipient.mobileNetwork : undefined,
        callback_url: reference,
      }),
    });

    const orderId = String(data.transaction_code ?? "");
    if (!orderId) {
      throw new RailError("pretium", "Pay call succeeded but returned no transaction_code — cannot track this payout");
    }

    return {
      orderId,
      status: mapPretiumStatus(String(data.status ?? "pending")),
      amountUsdc: amountUsd,
      totalDepositUsdc: amountUsd,
      currency,
      rate: Number(data.rate ?? 0),
      amountLocal: Number(data.amount_local ?? 0),
      feeLocal: Number(data.fee ?? 0),
      recipientAmount: Number(data.recipient_amount ?? 0),
      depositAddress: "",
      depositChain: "avalanche",
      expiresAt: String(data.expires_at ?? ""),
      externalReference: orderId,
      settlementReceipt: data.receipt_number ? String(data.receipt_number) : null,
    };
  },

  async getOrder(orderId) {
    // Request body field unconfirmed — assumed to be transaction_code
    // matching the webhook payload's field name.
    const data = await pretiumFetch<Record<string, unknown>>("/v1/status/lookup", {
      method: "POST",
      body: JSON.stringify({ transaction_code: orderId }),
    });
    return {
      orderId: String(data.transaction_code ?? orderId),
      status: mapPretiumStatus(String(data.status ?? "pending")),
      amountUsdc: Number(data.amount_usdc ?? 0),
      totalDepositUsdc: Number(data.amount_usdc ?? 0),
      currency: String(data.currency ?? ""),
      rate: Number(data.rate ?? 0),
      amountLocal: Number(data.amount_local ?? 0),
      feeLocal: Number(data.fee ?? 0),
      recipientAmount: Number(data.recipient_amount ?? 0),
      depositAddress: String(data.deposit_address ?? ""),
      depositChain: "avalanche",
      expiresAt: String(data.expires_at ?? ""),
      externalReference: data.transaction_code ? String(data.transaction_code) : null,
      settlementReceipt: data.receipt_number ? String(data.receipt_number) : null,
    };
  },

  // Pretium has no documented webhook signature scheme (see file header).
  // Always "true" here is intentional, not a placeholder bug — the actual
  // safety net is that webhook handlers must call getOrder()/
  // getOnrampSession() for authoritative status before crediting anything,
  // never trust the webhook body directly.
  verifyWebhookSignature() {
    console.warn("[Pretium] No signature scheme documented — treating webhook as an unverified hint, reconcile via status API");
    return true;
  },

  parseWebhookEvent(rawBody): PayoutWebhookEvent {
    const event = JSON.parse(rawBody) as {
      transaction_code: string;
      status: string;
      message?: string;
      receipt_number?: string | null;
    };
    const mapped = mapPretiumStatus(event.status);
    const status: PayoutWebhookEvent["status"] =
      mapped === "completed" ? "completed" : mapped === "expired" ? "expired" : "failed";
    return {
      orderId: event.transaction_code,
      externalReference: event.transaction_code,
      status,
      settlementReceipt: event.receipt_number ?? null,
      reason: status !== "completed" ? event.message ?? `Pretium reported "${event.status}"` : undefined,
    };
  },

  // ── On-ramp (funding) ──────────────────────────────────────────────────────

  supportsOnrampCountry(countryCode) {
    return countryCode in CANDIDATE_CURRENCY_BY_COUNTRY && VERIFIED_ONRAMP_MARKETS.has(countryCode);
  },

  async createOnrampSession({ amountLocal, currency, payer, walletAddress, chain, asset, reference }) {
    if (!ACCEPTED_CHAINS.includes(chain.toLowerCase())) {
      throw new RailError("pretium", `Refusing to fund on chain "${chain}" — expected Avalanche`);
    }
    if (payer.method !== "mobile") {
      throw new RailError("pretium", "Only mobile-money on-ramp is currently mapped for Pretium");
    }

    const data = await pretiumFetch<Record<string, unknown>>(`/v1/onramp/${encodeURIComponent(currency)}`, {
      method: "POST",
      body: JSON.stringify({
        shortcode: payer.phone,
        amount: amountLocal,
        mobile_network: payer.mobileNetwork,
        address: walletAddress,
        chain,
        asset,
        callback_url: reference,
      }),
    });

    return {
      sessionId: String(data.transaction_code ?? data.session_id ?? ""),
      status: mapOnrampStatus(String(data.status ?? "pending")),
      currency,
      amountLocal,
      amountUsdc: Number(data.amount_usdc ?? 0),
      walletAddress,
      chain,
      asset,
      paymentInstructions: data.message ? String(data.message) : "Approve the payment prompt on your phone.",
      externalReference: data.transaction_code ? String(data.transaction_code) : null,
    };
  },

  async getOnrampSession(sessionId): Promise<OnrampSession> {
    const data = await pretiumFetch<Record<string, unknown>>("/v1/status/lookup", {
      method: "POST",
      body: JSON.stringify({ transaction_code: sessionId }),
    });
    return {
      sessionId: String(data.transaction_code ?? sessionId),
      status: mapOnrampStatus(String(data.status ?? "pending")),
      currency: String(data.currency ?? ""),
      amountLocal: Number(data.amount_local ?? 0),
      amountUsdc: Number(data.amount_usdc ?? 0),
      walletAddress: String(data.address ?? ""),
      chain: String(data.chain ?? "avalanche"),
      asset: (data.asset === "USDT" ? "USDT" : "USDC") as "USDC" | "USDT",
      paymentInstructions: null,
      externalReference: data.transaction_code ? String(data.transaction_code) : null,
    };
  },

  verifyOnrampWebhookSignature() {
    console.warn("[Pretium] No signature scheme documented — treating webhook as an unverified hint, reconcile via status API");
    return true;
  },

  parseOnrampWebhookEvent(rawBody): OnrampWebhookEvent {
    const event = JSON.parse(rawBody) as {
      transaction_code: string;
      status: string;
      message?: string;
      receipt_number?: string | null;
    };
    const mapped = mapOnrampStatus(event.status);
    const status: OnrampWebhookEvent["status"] =
      mapped === "completed" ? "completed" : mapped === "expired" ? "expired" : "failed";
    return {
      sessionId: event.transaction_code,
      externalReference: event.transaction_code,
      status,
      receiptNumber: event.receipt_number ?? null,
      reason: status !== "completed" ? event.message ?? `Pretium reported "${event.status}"` : undefined,
    };
  },
};

// Re-exported so scripts/verify-pretium-networks.ts (and callers gating on
// current verification state) don't need to reach into env parsing directly.
export const PRETIUM_CANDIDATE_MARKETS = Object.keys(CANDIDATE_CURRENCY_BY_COUNTRY);
export const PRETIUM_VERIFIED_OFFRAMP_MARKETS = VERIFIED_OFFRAMP_MARKETS;
export const PRETIUM_VERIFIED_ONRAMP_MARKETS = VERIFIED_ONRAMP_MARKETS;
