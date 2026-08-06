// Settlement provider abstraction — Pretium is the sole implementation,
// covering both on-ramp (funding) and off-ramp (send/withdraw/pay) via
// Avalanche USDC/USDT, routed by country in ./index.ts. Adding a further
// provider (e.g. for Senegal/Côte d'Ivoire, which Pretium doesn't cover)
// should be a new file + a routing entry, not a rewrite of the
// withdraw/fund routes.
//
// Off-ramp is a two-phase flow, not a single "create order" call: unlike a
// typical provider that hands back a fresh per-order deposit address up
// front, Pretium settles to a FIXED settlement wallet address per
// chain/asset and only creates a payout record once it has the on-chain
// transaction_hash (POST /v1/pay/{currency} takes transaction_hash directly
// in the same call that creates the payout). So the interface splits into
// getDepositAddress() (before the on-chain send) and initiatePayout() (after
// it, once txHash exists) rather than createPayoutOrder()/submitDeposit().

export type PayoutRecipient =
  | { method: "mobile"; phone: string; mobileNetwork: string; accountName: string }
  | { method: "bank"; accountNumber: string; institution: string; accountName: string }
  | { method: "paybill"; businessNumber: string; accountNumber: string }
  | { method: "till"; businessNumber: string };

export type PayoutQuote = {
  amountUsdc: number;
  currency: string;
  /** Local currency units per 1 USDC. */
  rate: number;
  amountLocal: number;
  feeLocal: number;
  /** What the recipient actually nets, in local currency. */
  recipientAmount: number;
  recipientName: string | null;
  expiresAt: string;
};

export type PayoutOrderStatus = "pending" | "settling" | "completed" | "failed" | "expired";

export type PayoutOrder = {
  orderId: string;
  status: PayoutOrderStatus;
  amountUsdc: number;
  /** The exact USDC amount to send on-chain — may exceed amountUsdc (e.g. NGN network-fee delta). */
  totalDepositUsdc: number;
  currency: string;
  rate: number;
  amountLocal: number;
  feeLocal: number;
  recipientAmount: number;
  depositAddress: string;
  depositChain: string;
  expiresAt: string;
  externalReference: string | null;
  settlementReceipt: string | null;
};

export type PayoutWebhookEvent = {
  orderId: string;
  externalReference: string | null;
  status: "completed" | "failed" | "expired";
  reason?: string;
  settlementReceipt: string | null;
};

// ── On-ramp (funding) types ──────────────────────────────────────────────────

export type OnrampPayer =
  | { method: "mobile"; phone: string; mobileNetwork: string }
  | { method: "bank"; accountNumber: string; institution: string };

export type OnrampQuote = {
  currency: string;
  amountLocal: number;
  /** Local currency units per 1 USDC. */
  rate: number;
  feeLocal: number;
  /** What actually lands on-chain, net of fee. */
  amountUsdc: number;
  expiresAt: string;
};

export type OnrampSessionStatus = "pending" | "processing" | "completed" | "failed" | "expired";

export type OnrampSession = {
  sessionId: string;
  status: OnrampSessionStatus;
  currency: string;
  amountLocal: number;
  amountUsdc: number;
  walletAddress: string;
  chain: string;
  asset: "USDC" | "USDT";
  /** Plain-language instructions for the user, e.g. "Approve the STK push on your phone." */
  paymentInstructions: string | null;
  externalReference: string | null;
};

export type OnrampWebhookEvent = {
  sessionId: string;
  externalReference: string | null;
  status: "completed" | "failed" | "expired";
  reason?: string;
  receiptNumber: string | null;
};

export interface SettlementProvider {
  readonly name: string;

  supportsCountry(countryCode: string): boolean;

  /** Rate/fee preview — no side effects on the provider's side. */
  getQuote(input: {
    amountUsd: number;
    currency: string;
    recipient?: PayoutRecipient;
  }): Promise<PayoutQuote>;

  validateRecipient(input: {
    currency: string;
    recipient: PayoutRecipient;
  }): Promise<{ valid: boolean; recipientName: string | null }>;

  /** Resolves where the on-chain deposit should go — no order/tracking id exists yet. */
  getDepositAddress(input: { currency: string; chain: string; asset: "USDC" | "USDT" }): Promise<{
    depositAddress: string;
    depositChain: string;
  }>;

  /** Creates the payout record now that the on-chain deposit has actually happened. */
  initiatePayout(input: {
    amountUsd: number;
    currency: string;
    recipient: PayoutRecipient;
    txHash: string;
    reference: string;
    idempotencyKey: string;
  }): Promise<PayoutOrder>;

  getOrder(orderId: string): Promise<PayoutOrder>;

  verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean;

  parseWebhookEvent(rawBody: string): PayoutWebhookEvent;

  // ── On-ramp (funding) ──────────────────────────────────────────────────────
  // Kept as a separate capability check from supportsCountry: a provider's
  // on-ramp coverage/chain support can differ from its off-ramp coverage
  // (confirmed true for Pretium — see the header comment in pretium.ts).

  supportsOnrampCountry(countryCode: string): boolean;

  createOnrampSession(input: {
    amountLocal: number;
    currency: string;
    payer: OnrampPayer;
    walletAddress: string;
    chain: string;
    asset: "USDC" | "USDT";
    reference: string;
    idempotencyKey: string;
  }): Promise<OnrampSession>;

  getOnrampSession(sessionId: string): Promise<OnrampSession>;

  verifyOnrampWebhookSignature(rawBody: string, signatureHeader: string): boolean;

  parseOnrampWebhookEvent(rawBody: string): OnrampWebhookEvent;
}
