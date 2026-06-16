/**
 * Twilio SMS service.
 *
 * Demo mode (credentials not set): OTP printed to server console (check Render logs).
 * Trial mode: can only send to verified numbers in Twilio console.
 * Production: sends to any number worldwide.
 */

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER;

const DEMO_MODE = !ACCOUNT_SID || !AUTH_TOKEN || !FROM_NUMBER;

export async function sendOtpSms(phone: string, otp: string): Promise<void> {
  const message = `Your Autopayke code is ${otp}. Valid for 5 minutes. Never share this.`;

  if (DEMO_MODE) {
    console.log(`\n[SMS DEMO] ──────────────────────────────`);
    console.log(`[SMS DEMO] OTP for ${phone}: ${otp}`);
    console.log(`[SMS DEMO] ──────────────────────────────\n`);
    return;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`;
  const credentials = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString("base64");

  const body = new URLSearchParams({ To: phone, From: FROM_NUMBER!, Body: message });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const json = await res.json() as { sid?: string; error_message?: string; message?: string };

  if (!res.ok) {
    throw new Error(`[SMS] Twilio error ${res.status}: ${json.error_message ?? json.message}`);
  }

  console.log(`[SMS] OTP sent to ${phone} — SID: ${json.sid}`);
}

export async function sendClaimSms(
  recipientPhone: string,
  senderDisplay: string,
  amount: string,
  currency: string,
  claimUrl: string
): Promise<void> {
  const message = `${senderDisplay} sent you ${amount} ${currency} via Autopayke. Claim: ${claimUrl}`;

  if (DEMO_MODE) {
    console.log(`[SMS DEMO] Claim SMS for ${recipientPhone}: ${message}`);
    return;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`;
  const credentials = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString("base64");

  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: recipientPhone, From: FROM_NUMBER!, Body: message }).toString(),
  });
}
