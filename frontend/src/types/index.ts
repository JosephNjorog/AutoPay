export type CountryConfig = {
  code: string;
  name: string;
  dial: string;
  rail: string;
  phoneLength: number;
};

export type Transaction = {
  id: string;
  type: "received" | "sent";
  source: "mpesa" | "paystack" | "bank" | "crypto" | "internal";
  amount_usdc: string;
  amount_kes: string;
  amount_usd: string;
  status: "pending" | "completed" | "failed";
  recipient_phone: string | null;
  recipient_name: string | null;
  rail: string;
  created_at: string;
};

export type WalletBalance = {
  usdc: string;
  usdt: string;
  avax: string;
  total_usd: string;
  kes_rate: number;
  wallet_address: string;
};

export type UserSession = {
  access_token: string;
  refresh_token: string;
  user_id: string;
  phone: string;
  display_name: string | null;
  wallet_address: string | null;
};

export type ApiError = {
  code: number;
  message: string;
  detail: string | null;
};

export type SignupStoreState = {
  country_code: string;
  phone: string;
  email: string;
  otp_id: string | null;
  signup_token: string | null;
  pin_hash: string | null;
  passkey_registered: boolean;
};

export type WalletStatus = {
  status: "deploying" | "active";
  wallet_address: string | null;
};
