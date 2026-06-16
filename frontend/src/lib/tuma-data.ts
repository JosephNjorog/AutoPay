export type Asset = {
  symbol: "AVAX" | "USDC" | "USDT";
  name: string;
  balance: number;
  usd: number;
  color: string;
};

export type Contact = {
  id: string;
  name: string;
  msisdn: string;
  country: string;
  flag: string;
  rail: string;
};

export type Tx = {
  id: string;
  direction: "in" | "out";
  counterparty: string;
  countryFlag: string;
  timestamp: string;
  asset: "USDC" | "USDT" | "AVAX";
  amount: string;
  localAmount: string;
  rail: string;
  fx?: string;
  status?: "settled" | "pending";
  merchant?: boolean;
};

export const user = {
  name: "Ama Mensah",
  msisdn: "+233 24 567 8910",
  country: "Ghana",
  flag: "🇬🇭",
  smartWallet: "0x7F3a9c8b2eD4F1c6A8E2b9D5c7F4a1B3E6c9D2A8",
  localCurrency: "GHS",
  totalLocal: 10367.46,
  totalUsd: 682.41,
  change24h: 2.4,
};

export const assets: Asset[] = [
  { symbol: "USDC", name: "USD Coin", balance: 412.18, usd: 412.18, color: "bg-[oklch(0.7_0.13_240)]" },
  { symbol: "USDT", name: "Tether", balance: 198.04, usd: 198.04, color: "bg-[oklch(0.7_0.15_155)]" },
  { symbol: "AVAX", name: "Avalanche", balance: 2.41, usd: 72.19, color: "bg-[oklch(0.65_0.22_25)]" },
];

export const transactions: Tx[] = [
  { id: "tx1", direction: "out", counterparty: "Kwame Boateng", countryFlag: "🇬🇭", timestamp: "Just now", asset: "USDC", amount: "-25.00", localAmount: "GHS 380.00", rail: "MTN MoMo", fx: "1 USDC = 15.20 GHS", status: "pending" },
  { id: "tx2", direction: "in", counterparty: "Aïcha Diop", countryFlag: "🇸🇳", timestamp: "2h ago", asset: "USDT", amount: "+48.50", localAmount: "GHS 737.20", rail: "Wave", fx: "1 USDT = 15.20 GHS", status: "settled" },
  { id: "tx3", direction: "out", counterparty: "Tunde Adebayo", countryFlag: "🇳🇬", timestamp: "Yesterday", asset: "USDC", amount: "-120.00", localAmount: "NGN 186,000", rail: "GTB Bank", fx: "1 USDC = 1550 NGN", status: "settled", merchant: true },
  { id: "tx4", direction: "in", counterparty: "Merchant: Accra Bites", countryFlag: "🇬🇭", timestamp: "Yesterday", asset: "USDC", amount: "+12.30", localAmount: "GHS 187.00", rail: "TUMA QR", status: "settled", merchant: true },
  { id: "tx5", direction: "out", counterparty: "Wanjiru Kamau", countryFlag: "🇰🇪", timestamp: "2 days ago", asset: "USDT", amount: "-60.00", localAmount: "KES 7,740", rail: "M-Pesa", fx: "1 USDT = 129 KES", status: "settled" },
  { id: "tx6", direction: "in", counterparty: "Samuel Owusu", countryFlag: "🇬🇭", timestamp: "3 days ago", asset: "USDC", amount: "+200.00", localAmount: "GHS 3,040", rail: "MTN MoMo", status: "settled" },
  { id: "tx7", direction: "out", counterparty: "Fatou Ndiaye", countryFlag: "🇸🇳", timestamp: "4 days ago", asset: "USDC", amount: "-35.00", localAmount: "XOF 21,000", rail: "Orange Money", fx: "1 USDC = 600 XOF", status: "settled" },
];

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

export const rails = [
  { name: "MTN MoMo", country: "Ghana", flag: "🇬🇭", logo: "M" },
  { name: "Orange Money", country: "Senegal", flag: "🇸🇳", logo: "O" },
  { name: "Wave", country: "Senegal", flag: "🇸🇳", logo: "W" },
  { name: "M-Pesa", country: "Kenya", flag: "🇰🇪", logo: "M" },
  { name: "Bank Transfer", country: "Nigeria", flag: "🇳🇬", logo: "B" },
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

export const SPREAD = 0.023; // 2.3% baked into quote

export function quoteFx(countryCode: string) {
  const m = midRates[countryCode] ?? midRates.GH;
  const tumaRate = m.rate * (1 - SPREAD);
  return { ...m, mid: m.rate, tumaRate, spread: SPREAD };
}

export function dialToCountry(dial: string): string {
  const c = countries.find((c) => dial.startsWith(c.dial));
  return c?.code ?? "GH";
}

