// Backend-local mirror of frontend/src/lib/status-labels.ts's RAIL_LABELS —
// used anywhere a raw rail enum value needs plain-language copy server-side
// (currently just the PDF receipt).
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
