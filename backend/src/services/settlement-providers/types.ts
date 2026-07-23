// Off-ramp settlement provider abstraction — Minisend is the first
// implementation (KE/NG/GH/UG). HoneyCoin (broader coverage, including
// Tanzania) is expected to be added later as a second implementation behind
// this same interface, routed by country in ./index.ts — adding it should be
// a new file + a routing entry, not a rewrite of the withdraw flow.

export type PayoutRecipient =
  | { method: "mobile"; phone: string; mobileNetwork: string; accountName: string }
  | { method: "bank"; accountNumber: string; institution: string; accountName: string };

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

  /** Creates the payout order and returns the on-chain deposit address to send to. */
  createPayoutOrder(input: {
    amountUsd: number;
    currency: string;
    recipient: PayoutRecipient;
    /** Where the provider auto-refunds to if the payout fails — always the sender's own wallet. */
    refundAddress: string;
    reference: string;
    idempotencyKey: string;
  }): Promise<PayoutOrder>;

  /** Notifies the provider the on-chain deposit was sent. No-op for currencies/providers that auto-detect deposits. */
  submitDeposit(orderId: string, txHash: string): Promise<PayoutOrder | null>;

  getOrder(orderId: string): Promise<PayoutOrder>;

  verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean;

  parseWebhookEvent(rawBody: string): PayoutWebhookEvent;
}
