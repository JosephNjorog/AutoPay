import { z } from "zod";

// ── Country / Rail config ─────────────────────────────────────────────────────

export const SUPPORTED_RAILS = [
  "mpesa",
  "momo",
  "paystack",
  "wave",
  "orange_money",
  "bank",
] as const;
export type Rail = (typeof SUPPORTED_RAILS)[number];
// Settlement rails recorded on a transaction — broader than Rail, which is
// specifically "where a country's payout goes." Crypto deposits aren't tied
// to a country/payout rail at all, and the Daraja B2B merchant-pay rails are
// a separate dispatch path from Rail's Paystack-backed payout corridors.
export type TransactionRail = Rail | "crypto" | "mpesa_b2b_till" | "mpesa_b2b_paybill";

export const SUPPORTED_TOKENS = ["USDC", "USDT"] as const;
export type Token = (typeof SUPPORTED_TOKENS)[number];

// AVAX is a settleable asset like USDC/USDT but, being a native (non-ERC20)
// token, needs different handling wherever code branches on Token — kept as
// a separate union rather than folded into SUPPORTED_TOKENS/Token so that
// exhaustive Token switches (escrow/token-address logic, which is ERC20-only)
// don't silently need an AVAX case added everywhere.
export const PAYABLE_ASSETS = ["USDC", "USDT", "AVAX"] as const;
export type PayableAsset = (typeof PAYABLE_ASSETS)[number];

export type CountryConfig = {
  name: string;
  code: string;
  dialCode: string;
  currency: string;
  currencySymbol: string;
  primaryRail: Rail;
  fallbackRail?: Rail;
  // Flag emoji shown in country pickers.
  flag: string;
  // Expected local (national-format) digit count, i.e. the phone number's
  // length once the dial code / leading trunk "0" is stripped. Used to
  // validate recipient numbers against the selected destination country.
  phoneLength: number;
};

export const COUNTRY_CONFIG: Record<string, CountryConfig> = {
  KE: {
    name: "Kenya",
    code: "KE",
    dialCode: "+254",
    currency: "KES",
    currencySymbol: "KSh",
    primaryRail: "mpesa",
    flag: "🇰🇪",
    phoneLength: 9,
  },
  GH: {
    name: "Ghana",
    code: "GH",
    dialCode: "+233",
    currency: "GHS",
    currencySymbol: "GH₵",
    primaryRail: "momo",
    flag: "🇬🇭",
    phoneLength: 9,
  },
  NG: {
    name: "Nigeria",
    code: "NG",
    dialCode: "+234",
    currency: "NGN",
    currencySymbol: "₦",
    primaryRail: "paystack",
    flag: "🇳🇬",
    phoneLength: 10,
  },
  SN: {
    name: "Senegal",
    code: "SN",
    dialCode: "+221",
    currency: "XOF",
    currencySymbol: "CFA",
    primaryRail: "wave",
    fallbackRail: "orange_money",
    flag: "🇸🇳",
    phoneLength: 9,
  },
  CI: {
    name: "Côte d'Ivoire",
    code: "CI",
    dialCode: "+225",
    currency: "XOF",
    currencySymbol: "CFA",
    primaryRail: "orange_money",
    flag: "🇨🇮",
    phoneLength: 10,
  },
  TZ: {
    name: "Tanzania",
    code: "TZ",
    dialCode: "+255",
    currency: "TZS",
    currencySymbol: "TSh",
    primaryRail: "mpesa",
    flag: "🇹🇿",
    phoneLength: 9,
  },
  UG: {
    name: "Uganda",
    code: "UG",
    dialCode: "+256",
    currency: "UGX",
    currencySymbol: "USh",
    primaryRail: "momo",
    flag: "🇺🇬",
    phoneLength: 9,
  },
};

export function dialCodeToCountry(phone: string): CountryConfig | null {
  const normalized = phone.replace(/\s+/g, "");
  for (const config of Object.values(COUNTRY_CONFIG)) {
    if (normalized.startsWith(config.dialCode)) return config;
  }
  return null;
}

// ── Merchant Pay (Till/PayBill) config ────────────────────────────────────────
// Backend-served (see GET /api/pay/config) so adding a country/method is a
// config change, not a client release — same rationale as COUNTRY_CONFIG.

export type PayMethodKind = "buy_goods" | "paybill";

export type PayMethodConfig = {
  kind: PayMethodKind;
  label: string;
  numberLabel: string;
  minDigits: number;
  maxDigits: number;
  requiresAccountNumber: boolean;
};

export type CountryPayConfig = {
  countryCode: string;
  countryName: string;
  status: "available" | "coming_soon";
  currency: string;
  currencySymbol: string;
  methods: PayMethodConfig[];
};

const KENYA_PAY_METHODS: PayMethodConfig[] = [
  {
    kind: "buy_goods",
    label: "Buy Goods (Till)",
    numberLabel: "Till number",
    minDigits: 5,
    maxDigits: 7,
    requiresAccountNumber: false,
  },
  {
    kind: "paybill",
    label: "PayBill",
    numberLabel: "Business number",
    minDigits: 5,
    maxDigits: 7,
    requiresAccountNumber: true,
  },
];

export const PAY_CONFIG: Record<string, CountryPayConfig> = {
  KE: { countryCode: "KE", countryName: "Kenya", status: "available", currency: "KES", currencySymbol: "KSh", methods: KENYA_PAY_METHODS },
  GH: { countryCode: "GH", countryName: "Ghana", status: "coming_soon", currency: "GHS", currencySymbol: "GH₵", methods: [] },
  NG: { countryCode: "NG", countryName: "Nigeria", status: "coming_soon", currency: "NGN", currencySymbol: "₦", methods: [] },
  SN: { countryCode: "SN", countryName: "Senegal", status: "coming_soon", currency: "XOF", currencySymbol: "CFA", methods: [] },
  CI: { countryCode: "CI", countryName: "Côte d'Ivoire", status: "coming_soon", currency: "XOF", currencySymbol: "CFA", methods: [] },
  TZ: { countryCode: "TZ", countryName: "Tanzania", status: "coming_soon", currency: "TZS", currencySymbol: "TSh", methods: [] },
  UG: { countryCode: "UG", countryName: "Uganda", status: "coming_soon", currency: "UGX", currencySymbol: "USh", methods: [] },
};

// Safaricom Till (Buy Goods) and PayBill business numbers are both 5-7 digits.
export const TILL_PAYBILL_NUMBER_RE = /^\d{5,7}$/;
// Free-text PayBill account reference (invoice/account/policy number, etc).
export const PAY_ACCOUNT_NUMBER_RE = /^[A-Za-z0-9 .\-]{1,20}$/;

export const InitiatePaymentSchema = z.object({
  quoteId: z.string().uuid(),
  payMethod: z.enum(["buy_goods", "paybill"]),
  merchantNumber: z.string().regex(TILL_PAYBILL_NUMBER_RE, "Enter a 5-7 digit number"),
  accountNumber: z.string().regex(PAY_ACCOUNT_NUMBER_RE).max(20).optional(),
  amountUsd: z.number().positive().max(10_000),
  token: z.enum(PAYABLE_ASSETS).default("USDC"),
  idempotencyKey: z
    .string()
    .min(8)
    .max(128)
    .regex(/^[A-Za-z0-9._:-]+$/, "Use letters, numbers, '.', '_', ':', or '-'")
    .optional(),
});

export const PayQuoteRequestSchema = z.object({
  amountUsd: z.number().positive().max(10_000),
  payMethod: z.enum(["buy_goods", "paybill"]),
  token: z.enum(PAYABLE_ASSETS).default("USDC"),
});

export type PayRail = "mpesa_b2b_till" | "mpesa_b2b_paybill";

export type PayQuote = {
  quoteId: string;
  fromToken: PayableAsset;
  fromAmountUsd: number;
  toAmount: number;
  toCurrency: string;
  tumaRate: number;
  midRate: number;
  savingsVsBank: number;
  rail: PayRail;
  lockedUntil: string;
  // Only set when fromToken is "AVAX" — the locked AVAX/USD price and the
  // resulting raw AVAX quantity, since unlike USDC/USDT it isn't 1:1 with
  // fromAmountUsd. Re-validated (not re-fetched) at settlement time the same
  // way the stablecoin path re-checks the quote against lockedUntil.
  tokenPriceUsd?: number;
  tokenAmount?: number;
};

// ── Shared Zod schemas ────────────────────────────────────────────────────────

export const PhoneSchema = z
  .string()
  .min(7)
  .max(20)
  .regex(/^\+[1-9]\d{6,18}$/, "Must be E.164 format e.g. +254712345678");

export const OtpCodeSchema = z
  .string()
  .length(6)
  .regex(/^\d{6}$/, "Must be 6 digits");

export const SendOtpSchema = z.object({
  phone: PhoneSchema,
  // Optional: returning users already have one on file. New users must
  // supply it — the OTP is delivered by email while SMS isn't reliably
  // configured.
  email: z.string().email().optional(),
});

export const VerifyOtpSchema = z.object({
  phone: PhoneSchema,
  code: OtpCodeSchema,
});

export const SetPasswordSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const FxQuoteRequestSchema = z.object({
  amountUsd: z.number().positive().max(10_000),
  recipientPhone: PhoneSchema,
  token: z.enum(PAYABLE_ASSETS).default("USDC"),
});

export const SendMoneySchema = z.object({
  quoteId: z.string().uuid(),
  recipientPhone: PhoneSchema,
  amountUsd: z.number().positive().max(10_000),
  token: z.enum(PAYABLE_ASSETS).default("USDC"),
  note: z.string().max(140).optional(),
  idempotencyKey: z
    .string()
    .min(8)
    .max(128)
    .regex(/^[A-Za-z0-9._:-]+$/, "Use letters, numbers, '.', '_', ':', or '-'")
    .optional(),
});

export const WithdrawSchema = z.object({
  amountUsd: z.number().positive().max(10_000),
});

export const ClaimPaymentSchema = z.object({
  ref: z.string().min(4).max(20),
  phone: PhoneSchema,
  code: OtpCodeSchema,
});

export const MerchantSettingsSchema = z.object({
  businessName: z.string().min(2).max(80),
  tillOpen: z.boolean(),
  autoSettleTo: z.string().min(7).max(20),
  settleRail: z.enum(SUPPORTED_RAILS),
  settleSchedule: z.enum(["instant", "daily", "weekly"]),
});

// ── Shared response types ─────────────────────────────────────────────────────

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

export type FxQuote = {
  quoteId: string;
  fromToken: PayableAsset;
  fromAmountUsd: number;
  toAmount: number;
  toCurrency: string;
  tumaRate: number;
  midRate: number;
  savingsVsBank: number;
  rail: Rail;
  recipientCountry: string;
  lockedUntil: string;
  // Flat fee charged to the sender to cover the relayer's on-chain gas cost
  // (direct TUMA-to-TUMA sends only) — see services/fx.ts's
  // computeNetworkFeeUsd(). Additive on top of fromAmountUsd, unrelated to
  // any merchant Till/PayBill fee.
  networkFeeUsd: number;
  // Only set when fromToken is "AVAX" — see PayQuote's matching fields.
  tokenPriceUsd?: number;
  tokenAmount?: number;
};

export type TransactionStatus =
  | "initiated"
  | "onchain"
  | "routed"
  | "settled"
  | "requires_review"
  | "failed"
  | "expired";

export type SettlementStep = {
  step: TransactionStatus;
  label: string;
  description: string;
  timestamp: string | null;
  done: boolean;
};

export type TransactionSummary = {
  id: string;
  reference: string;
  direction: "in" | "out";
  counterparty: string;
  amountUsd: number;
  amountLocal: number;
  localCurrency: string;
  fxRate: number;
  rail: TransactionRail;
  status: TransactionStatus;
  note: string | null;
  failureStage?: string | null;
  failureReason?: string | null;
  createdAt: string;
  settledAt: string | null;
};

export type WalletAsset = {
  symbol: string;
  name: string;
  address: string;
  balance: string;
  balanceUsd: number;
  decimals: number;
};
