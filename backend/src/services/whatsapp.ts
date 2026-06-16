/**
 * Africa's Talking WhatsApp Business API.
 *
 * Demo / sandbox mode:
 *   - If AT_API_KEY is not set, the OTP is printed to the server console instead
 *     of being sent. Useful for local dev and demo environments.
 *   - Flip AT_ENV=production and supply real credentials to go live.
 *
 * Template approval:
 *   Templates must be pre-approved by Meta before use in production.
 *   Sandbox returns success without actually delivering messages.
 */

const AT_API_KEY = process.env.AT_API_KEY;
const AT_USERNAME = process.env.AT_USERNAME;
const AT_SENDER = process.env.AT_WHATSAPP_SENDER;
const AT_OTP_TEMPLATE = process.env.AT_WHATSAPP_OTP_TEMPLATE ?? "autopayke_otp";

const BASE_URL = "https://content.africastalking.com/version1/messaging/whatsapp";

const DEMO_MODE = !AT_API_KEY || !AT_USERNAME;

type SendTemplateParams = {
  to: string;
  templateName: string;
  params: string[];
};

async function sendTemplate({ to, templateName, params }: SendTemplateParams): Promise<void> {
  if (DEMO_MODE) {
    // Demo / local fallback — OTP visible in server logs
    console.log(`[WhatsApp DEMO] Would send template "${templateName}" to ${to} — params: ${params.join(", ")}`);
    return;
  }

  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      apiKey: AT_API_KEY!,
    },
    body: JSON.stringify({
      username: AT_USERNAME,
      to,
      from: AT_SENDER,
      template: {
        name: templateName,
        params,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[WhatsApp] Africa's Talking error ${res.status}: ${body}`);
  }
}

/**
 * Sends a 6-digit OTP via WhatsApp.
 * Template: "Your Autopayke code is {{1}}. Valid for 5 minutes. Never share this."
 */
export async function sendOtpWhatsApp(phone: string, otp: string): Promise<void> {
  await sendTemplate({ to: phone, templateName: AT_OTP_TEMPLATE, params: [otp] });
  if (DEMO_MODE) {
    console.log(`[WhatsApp DEMO] OTP for ${phone}: ${otp}`);
  } else {
    console.log(`[WhatsApp] OTP sent to ${phone}`);
  }
}

/**
 * Sends a claim link to a non-Autopayke user.
 * Template: "{{1}} sent you {{2}} {{3}} on Autopayke. Claim it here: {{4}}"
 */
export async function sendClaimLink(
  recipientPhone: string,
  senderName: string,
  amount: string,
  currency: string,
  claimUrl: string
): Promise<void> {
  await sendTemplate({
    to: recipientPhone,
    templateName: "autopayke_claim_link",
    params: [senderName, amount, currency, claimUrl],
  });
}

/**
 * Sends a payment received notification.
 * Template: "You received {{1}} {{2}} from {{3}} on Autopayke."
 */
export async function sendReceivedNotification(
  recipientPhone: string,
  amount: string,
  currency: string,
  senderDisplay: string
): Promise<void> {
  await sendTemplate({
    to: recipientPhone,
    templateName: "autopayke_received",
    params: [amount, currency, senderDisplay],
  });
}
