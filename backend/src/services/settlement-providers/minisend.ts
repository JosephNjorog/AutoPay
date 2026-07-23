/**
 * Minisend — off-ramp for contributor self-withdraw (KE/NG/GH/UG).
 * API docs: https://docs.minisend.xyz/offramp/overview
 *
 * The docs still describe deposits as Base-only ("deposit_chain": "base"),
 * but Minisend's founder confirmed direct that this account is provisioned
 * for Avalanche C-Chain deposits too — the docs just haven't caught up.
 * createPayoutOrder() below reads deposit_chain off the live API response
 * rather than assuming, and refuses to proceed if it isn't Avalanche, since
 * sending real USDC to the wrong chain's address is unrecoverable.
 */

import { createHmac } from "crypto";
import { RailError } from "../../lib/errors";
import type {
  PayoutOrder,
  PayoutOrderStatus,
  PayoutQuote,
  PayoutRecipient,
  PayoutWebhookEvent,
  SettlementProvider,
} from "./types";

const BASE_URL = process.env.MINISEND_BASE_URL ?? "https://merchant.minisend.xyz";
const API_KEY = process.env.MINISEND_API_KEY;

const SUPPORTED_CURRENCY_BY_COUNTRY: Record<string, string> = {
  KE: "KES",
  NG: "NGN",
  GH: "GHS",
  UG: "UGX",
};

const ACCEPTED_DEPOSIT_CHAINS = ["avalanche", "avalanche-c-chain", "avax", "avax-c-chain"];

type MinisendRecipientPayload = Record<string, string>;

type MinisendQuoteResponse = {
  amount_usdc: number;
  currency: string;
  rate: number;
  amount_local: number;
  fee: number;
  recipient_amount: number;
  recipient_name?: string | null;
  expires_at: string;
};

type MinisendOrderResponse = {
  order_id: string;
  status: PayoutOrderStatus;
  amount_usdc: number;
  total_deposit_usdc?: number;
  currency: string;
  rate: number;
  amount_local: number;
  fee: number;
  recipient_amount: number;
  deposit_address: string;
  deposit_chain: string;
  expires_at: string;
  external_reference?: string | null;
  settlement_receipt?: string | null;
};

type MinisendErrorResponse = { error?: string; message?: string };

async function minisendFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!API_KEY) throw new RailError("minisend", "MINISEND_API_KEY is not configured");

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const raw = (await res.json().catch(() => null)) as (T & MinisendErrorResponse) | null;
  if (!res.ok) {
    throw new RailError("minisend", raw?.error ?? raw?.message ?? `HTTP ${res.status}`);
  }
  return raw as T;
}

function toMinisendRecipient(recipient: PayoutRecipient): MinisendRecipientPayload {
  if (recipient.method === "bank") {
    return {
      account_number: recipient.accountNumber,
      institution: recipient.institution,
      account_name: recipient.accountName,
    };
  }
  return {
    phone: recipient.phone,
    mobile_network: recipient.mobileNetwork,
    account_name: recipient.accountName,
  };
}

function mapQuote(data: MinisendQuoteResponse): PayoutQuote {
  return {
    amountUsdc: data.amount_usdc,
    currency: data.currency,
    rate: data.rate,
    amountLocal: data.amount_local,
    feeLocal: data.fee,
    recipientAmount: data.recipient_amount,
    recipientName: data.recipient_name ?? null,
    expiresAt: data.expires_at,
  };
}

function mapOrder(data: MinisendOrderResponse): PayoutOrder {
  return {
    orderId: data.order_id,
    status: data.status,
    amountUsdc: data.amount_usdc,
    totalDepositUsdc: data.total_deposit_usdc ?? data.amount_usdc,
    currency: data.currency,
    rate: data.rate,
    amountLocal: data.amount_local,
    feeLocal: data.fee,
    recipientAmount: data.recipient_amount,
    depositAddress: data.deposit_address,
    depositChain: data.deposit_chain,
    expiresAt: data.expires_at,
    externalReference: data.external_reference ?? null,
    settlementReceipt: data.settlement_receipt ?? null,
  };
}

export const minisendProvider: SettlementProvider = {
  name: "minisend",

  supportsCountry(countryCode) {
    return countryCode in SUPPORTED_CURRENCY_BY_COUNTRY;
  },

  async getQuote({ amountUsd, currency, recipient }) {
    const data = await minisendFetch<MinisendQuoteResponse>("/api/offramp/quote", {
      method: "POST",
      body: JSON.stringify({
        amount: amountUsd,
        currency,
        ...(recipient ? { recipient: toMinisendRecipient(recipient) } : {}),
      }),
    });
    return mapQuote(data);
  },

  async validateRecipient({ currency, recipient }) {
    const data = await minisendFetch<{ valid: boolean; recipient_name: string | null }>(
      "/api/offramp/validate-account",
      {
        method: "POST",
        body: JSON.stringify({ currency, recipient: toMinisendRecipient(recipient) }),
      }
    );
    return { valid: data.valid, recipientName: data.recipient_name };
  },

  async createPayoutOrder({ amountUsd, currency, recipient, refundAddress, reference, idempotencyKey }) {
    const data = await minisendFetch<MinisendOrderResponse>("/api/offramp/orders", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({
        amount: amountUsd,
        currency,
        recipient: toMinisendRecipient(recipient),
        refund_address: refundAddress,
        reference,
      }),
    });

    const order = mapOrder(data);
    if (!ACCEPTED_DEPOSIT_CHAINS.includes(order.depositChain.toLowerCase())) {
      throw new RailError(
        "minisend",
        `Order ${order.orderId} expects a deposit on "${order.depositChain}", not Avalanche — refusing to send`
      );
    }
    return order;
  },

  async submitDeposit(orderId, txHash) {
    // NGN orders auto-detect the deposit and reject this call — callers skip it for NGN.
    const data = await minisendFetch<MinisendOrderResponse>(
      `/api/offramp/orders/${encodeURIComponent(orderId)}/deposit`,
      { method: "POST", body: JSON.stringify({ transaction_hash: txHash }) }
    );
    return mapOrder(data);
  },

  async getOrder(orderId) {
    const data = await minisendFetch<MinisendOrderResponse>(
      `/api/offramp/orders/${encodeURIComponent(orderId)}`
    );
    return mapOrder(data);
  },

  verifyWebhookSignature(rawBody, signatureHeader) {
    const secret = process.env.MINISEND_WEBHOOK_SECRET;
    if (!secret) {
      console.error("[Minisend] MINISEND_WEBHOOK_SECRET is not configured — rejecting webhook");
      return false;
    }
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    return expected === signatureHeader;
  },

  parseWebhookEvent(rawBody): PayoutWebhookEvent {
    const event = JSON.parse(rawBody) as {
      event: "offramp.completed" | "offramp.failed" | "offramp.expired";
      order_id: string;
      external_reference: string | null;
      status: "completed" | "failed" | "expired";
      settlement_receipt?: string | null;
    };
    return {
      orderId: event.order_id,
      externalReference: event.external_reference,
      status: event.status,
      settlementReceipt: event.settlement_receipt ?? null,
      reason: event.status !== "completed" ? `Minisend reported "${event.status}"` : undefined,
    };
  },
};

export const MINISEND_LOCAL_AMOUNT_BOUNDS: Record<string, { min: number; max: number }> = {
  KES: { min: 20, max: 250_000 },
  GHS: { min: 5, max: 5_000 },
  UGX: { min: 500, max: 5_000_000 },
  NGN: { min: 0, max: Infinity }, // Docs give no explicit NGN bounds beyond the shared 0.5-50,000 USDC cap.
};

export const MINISEND_USDC_BOUNDS = { min: 0.5, max: 50_000 };
