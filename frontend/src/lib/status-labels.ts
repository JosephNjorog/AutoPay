import type { TxStatus } from "@/lib/api/client";

// Single source of truth for plain-language transaction status copy, shared
// across the tracker, history list, and anywhere else a status is shown.
export const STATUS_LABELS: Record<TxStatus, string> = {
  initiated: "On its way",
  onchain: "On its way",
  routed: "On its way",
  settled: "Delivered",
  requires_review: "We hit a snag, reviewing",
  failed: "Failed",
  expired: "Expired",
};

export function getStatusLabel(status: TxStatus): string {
  return STATUS_LABELS[status];
}

// Rail display labels — used anywhere a raw rail enum value would otherwise
// be shown verbatim (e.g. the tracker's "Rail" row). The "(Sandbox)" suffix
// on the Merchant Pay rails is a deliberate, high-visibility reminder that
// this integration hasn't gone through Safaricom's production go-live yet.
export const RAIL_LABELS: Record<string, string> = {
  mpesa: "M-Pesa",
  momo: "MTN MoMo",
  paystack: "Paystack",
  wave: "Wave",
  orange_money: "Orange Money",
  bank: "Bank transfer",
  crypto: "Crypto deposit",
  mpesa_b2b_till: "M-Pesa Till (Sandbox)",
  mpesa_b2b_paybill: "M-Pesa PayBill (Sandbox)",
};

export function getRailLabel(rail: string): string {
  return RAIL_LABELS[rail] ?? rail;
}

// Plain-language headline shown on Pay's "sending" screen while waiting for
// the Daraja B2B callback — mirrors Send's inline sending-step copy pattern.
export const PAY_SENDING_COPY: Record<TxStatus, string> = {
  initiated: "Preparing your payment…",
  onchain: "Debiting your balance…",
  routed: "Sending to the merchant (sandbox)…",
  settled: "Payment delivered",
  requires_review: "We hit a snag — reviewing your payment",
  failed: "Payment failed",
  expired: "Payment expired",
};
