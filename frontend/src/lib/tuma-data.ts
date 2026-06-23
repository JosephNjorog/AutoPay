import type { DisplayCurrency } from "./currency-store";

export type Contact = {
  id: string;
  name: string;
  msisdn: string;
  country: string;
  flag: string;
  rail: string;
  registered?: boolean;
};

export const countries = [
  { code: "GH", flag: "🇬🇭", name: "Ghana", dial: "+233" },
  { code: "NG", flag: "🇳🇬", name: "Nigeria", dial: "+234" },
  { code: "KE", flag: "🇰🇪", name: "Kenya", dial: "+254" },
  { code: "SN", flag: "🇸🇳", name: "Senegal", dial: "+221" },
  { code: "CI", flag: "🇨🇮", name: "Côte d'Ivoire", dial: "+225" },
  { code: "ZA", flag: "🇿🇦", name: "South Africa", dial: "+27" },
  { code: "TZ", flag: "🇹🇿", name: "Tanzania", dial: "+255" },
  { code: "UG", flag: "🇺🇬", name: "Uganda", dial: "+256" },
];

// Mid-market rates (mocked CoinGecko) — local currency per 1 USDC
export const midRates: Record<string, { ccy: string; rate: number; flag: string; rail: string }> = {
  GH: { ccy: "GHS", rate: 15.20, flag: "🇬🇭", rail: "MTN MoMo" },
  NG: { ccy: "NGN", rate: 1582, flag: "🇳🇬", rail: "Paystack bank" },
  KE: { ccy: "KES", rate: 129.4, flag: "🇰🇪", rail: "M-Pesa STK" },
  SN: { ccy: "XOF", rate: 605, flag: "🇸🇳", rail: "Wave" },
  CI: { ccy: "XOF", rate: 605, flag: "🇨🇮", rail: "Wave" },
  ZA: { ccy: "ZAR", rate: 18.6, flag: "🇿🇦", rail: "Instant EFT" },
  TZ: { ccy: "TZS", rate: 2640, flag: "🇹🇿", rail: "M-Pesa" },
  UG: { ccy: "UGX", rate: 3720, flag: "🇺🇬", rail: "MTN MoMo" },
};

// Formats a USD amount for display, converting to KES when requested.
export function formatMoney(usd: number, currency: DisplayCurrency, kesRate: number): string {
  if (currency === "USD") return `$${usd.toFixed(2)}`;
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(usd * kesRate);
}
