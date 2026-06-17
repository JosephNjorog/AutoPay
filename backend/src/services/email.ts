/**
 * Resend email service.
 *
 * Demo mode (credentials not set): OTP printed to server console (check Render logs).
 * Used as the primary OTP delivery channel while Twilio SMS isn't reliably configured.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? "Autopayke <noreply@autopayke.com>";

const DEMO_MODE = !RESEND_API_KEY;

export async function sendOtpEmail(email: string, otp: string): Promise<void> {
  const subject = "Your Autopayke verification code";
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 420px; margin: 0 auto; padding: 24px;">
      <p style="font-size: 14px; color: #555;">Your Autopayke verification code is:</p>
      <p style="font-size: 32px; font-weight: 800; letter-spacing: 4px; margin: 16px 0;">${otp}</p>
      <p style="font-size: 12px; color: #888;">Valid for 5 minutes. Never share this code with anyone.</p>
    </div>
  `;

  if (DEMO_MODE) {
    console.log(`\n[EMAIL DEMO] ──────────────────────────────`);
    console.log(`[EMAIL DEMO] OTP for ${email}: ${otp}`);
    console.log(`[EMAIL DEMO] ──────────────────────────────\n`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_ADDRESS, to: email, subject, html }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[Email] Resend error ${res.status}: ${body}`);
  }

  const json = (await res.json()) as { id?: string };
  console.log(`[Email] OTP sent to ${email} — id: ${json.id}`);
}
