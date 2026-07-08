/**
 * Safaricom Daraja API — M-Pesa Kenya
 * B2C: Business to Customer disbursements (sending money to recipient)
 * STK Push: Customer to Business (collecting card-like payments)
 */

import { RailError } from "../../lib/errors";

const BASE_URL =
  process.env.MPESA_ENV === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

let accessToken: string | null = null;
let tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;

  const credentials = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString("base64");

  const res = await fetch(
    `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${credentials}` } }
  );

  if (!res.ok) throw new RailError("mpesa", "Failed to get access token");

  const data = (await res.json()) as { access_token: string; expires_in: string };
  accessToken = data.access_token;
  tokenExpiry = Date.now() + parseInt(data.expires_in) * 1000 - 60_000;
  return accessToken;
}

// Merchant Pay (B2B) uses its own Daraja sandbox app — a separate consumer
// key/secret pair and token cache from the B2C one above, so nothing about
// the (currently unused) B2C/STK path is disturbed.
let b2bAccessToken: string | null = null;
let b2bTokenExpiry = 0;

async function getB2BAccessToken(): Promise<string> {
  if (b2bAccessToken && Date.now() < b2bTokenExpiry) return b2bAccessToken;

  const credentials = Buffer.from(
    `${process.env.MPESA_B2B_CONSUMER_KEY}:${process.env.MPESA_B2B_CONSUMER_SECRET}`
  ).toString("base64");

  const res = await fetch(
    `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${credentials}` } }
  );

  if (!res.ok) throw new RailError("mpesa_b2b", "Failed to get access token");

  const data = (await res.json()) as { access_token: string; expires_in: string };
  b2bAccessToken = data.access_token;
  b2bTokenExpiry = Date.now() + parseInt(data.expires_in) * 1000 - 60_000;
  return b2bAccessToken;
}

export type MpesaB2CResult = {
  railReference: string;
  status: "pending" | "settled";
};

/**
 * B2C disbursement — sends KES directly to a recipient's M-Pesa wallet.
 * @param phone  E.164 format e.g. +254712345678
 * @param amount Amount in KES
 * @param ref    Internal transaction reference for callback reconciliation
 */
export async function sendB2C(
  phone: string,
  amount: number,
  ref: string,
  idempotencyKey: string
): Promise<MpesaB2CResult> {
  const token = await getAccessToken();

  // M-Pesa expects phone without '+' and without leading 0
  const msisdn = phone.replace("+", "").replace(/^0/, "254");

  const payload = {
    InitiatorName: process.env.MPESA_B2C_INITIATOR,
    SecurityCredential: process.env.MPESA_B2C_CREDENTIAL,
    CommandID: "BusinessPayment",
    Amount: Math.round(amount),
    PartyA: process.env.MPESA_SHORTCODE,
    PartyB: msisdn,
    Remarks: `Autopayke transfer ${ref}`,
    QueueTimeOutURL: `${process.env.API_BASE_URL}/webhooks/mpesa/timeout`,
    ResultURL: `${process.env.API_BASE_URL}/webhooks/mpesa/result`,
    OriginatorConversationID: idempotencyKey,
    Occasion: ref,
  };

  const res = await fetch(`${BASE_URL}/mpesa/b2c/v1/paymentrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new RailError("mpesa", `B2C failed: ${body}`);
  }

  const data = (await res.json()) as {
    ConversationID: string;
    OriginatorConversationID: string;
    ResponseCode: string;
    ResponseDescription: string;
  };

  if (data.ResponseCode !== "0") {
    throw new RailError("mpesa", data.ResponseDescription);
  }

  return {
    railReference: data.ConversationID,
    status: "pending", // M-Pesa is async; result comes via webhook
  };
}

/**
 * STK Push — prompts the customer's phone to enter their M-Pesa PIN.
 * Used for funding (customer pays into TUMA float account).
 */
export async function initiateSTKPush(
  phone: string,
  amount: number,
  ref: string
): Promise<{ checkoutRequestId: string }> {
  const token = await getAccessToken();
  const timestamp = new Date()
    .toISOString()
    .replace(/[^0-9]/g, "")
    .slice(0, 14);

  const password = Buffer.from(
    `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
  ).toString("base64");

  const msisdn = phone.replace("+", "").replace(/^0/, "254");

  const payload = {
    BusinessShortCode: process.env.MPESA_SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: Math.round(amount),
    PartyA: msisdn,
    PartyB: process.env.MPESA_SHORTCODE,
    PhoneNumber: msisdn,
    CallBackURL: `${process.env.API_BASE_URL}/webhooks/mpesa/stk`,
    AccountReference: ref,
    TransactionDesc: `Autopayke fund ${ref}`,
  };

  const res = await fetch(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new RailError("mpesa", "STK Push failed");

  const data = (await res.json()) as {
    CheckoutRequestID: string;
    ResponseCode: string;
    ResponseDescription: string;
  };

  if (data.ResponseCode !== "0") throw new RailError("mpesa", data.ResponseDescription);

  return { checkoutRequestId: data.CheckoutRequestID };
}

/** Query STK Push status — used by settlement poller. */
export async function querySTKStatus(checkoutRequestId: string): Promise<"pending" | "settled" | "failed"> {
  const token = await getAccessToken();
  const timestamp = new Date()
    .toISOString()
    .replace(/[^0-9]/g, "")
    .slice(0, 14);

  const password = Buffer.from(
    `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
  ).toString("base64");

  const res = await fetch(`${BASE_URL}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    }),
  });

  if (!res.ok) return "pending";

  const data = (await res.json()) as { ResultCode: string };
  if (data.ResultCode === "0") return "settled";
  if (data.ResultCode === "1032") return "pending";
  return "failed";
}

export type MpesaB2BResult = {
  railReference: string;
  status: "pending";
};

/**
 * B2B disbursement — pays a Till (Buy Goods) or PayBill business number from
 * Autopayke's Daraja sandbox source shortcode. Sandbox only (see MPESA_ENV).
 * Used by the Merchant Pay feature, distinct from the B2C consumer-payout
 * path above (separate Daraja app/credentials, separate CommandID space).
 *
 * Note: unlike B2C's paymentrequest, Daraja's B2B paymentrequest schema has
 * no client-supplied idempotency-key field (no OriginatorConversationID) —
 * duplicate-call protection for this rail comes from the caller (worker
 * status checks before ever calling this), not from Safaricom's API.
 */
export async function sendB2B(params: {
  payMethod: "buy_goods" | "paybill";
  merchantNumber: string;
  accountNumber?: string;
  amountKes: number;
  ref: string;
}): Promise<MpesaB2BResult> {
  const token = await getB2BAccessToken();

  const commandId =
    params.payMethod === "buy_goods" ? "BusinessBuyGoods" : "BusinessPayBill";

  const payload = {
    Initiator: process.env.MPESA_B2B_INITIATOR,
    SecurityCredential: process.env.MPESA_B2B_SECURITY_CREDENTIAL,
    CommandID: commandId,
    SenderIdentifierType: "4",
    RecieverIdentifierType: "4",
    Amount: Math.round(params.amountKes),
    PartyA: process.env.MPESA_B2B_SHORTCODE,
    PartyB: params.merchantNumber,
    AccountReference:
      params.payMethod === "paybill" ? (params.accountNumber ?? params.ref) : params.ref,
    Remarks: `Autopayke pay ${params.ref}`,
    QueueTimeOutURL: `${process.env.API_BASE_URL}/webhooks/mpesa/b2b/timeout`,
    ResultURL: `${process.env.API_BASE_URL}/webhooks/mpesa/b2b/result`,
    Occasion: params.ref,
  };

  const res = await fetch(`${BASE_URL}/mpesa/b2b/v1/paymentrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new RailError("mpesa_b2b", `B2B failed: ${body}`);
  }

  const data = (await res.json()) as {
    ConversationID: string;
    OriginatorConversationID: string;
    ResponseCode: string;
    ResponseDescription: string;
  };

  if (data.ResponseCode !== "0") {
    throw new RailError("mpesa_b2b", data.ResponseDescription);
  }

  return {
    railReference: data.ConversationID,
    status: "pending", // Daraja B2B is async; result comes via webhook
  };
}
