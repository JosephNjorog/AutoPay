/**
 * Resend email service.
 *
 * Demo mode (RESEND_API_KEY not set): emails printed to server console.
 * Primary OTP delivery channel; also sends welcome emails on new account creation.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? "AutoPayKe <noreply@autopayke.com>";
const APP_URL = process.env.APP_URL ?? "https://autopayke.com";
const TERMS_URL = `${APP_URL}/legal/terms`;
const PRIVACY_URL = `${APP_URL}/legal/privacy`;
const SUPPORT_EMAIL = "support@autopayke.com";

const DEMO_MODE = !RESEND_API_KEY;

// ── Shared HTML helpers ───────────────────────────────────────────────────────

function emailWrapper(bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AutoPayKe</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f0ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f0ea;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

          <!-- Logo header -->
          <tr>
            <td style="padding-bottom:24px;" align="center">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:linear-gradient(135deg,#F97316,#EA580C);width:40px;height:40px;border-radius:12px;text-align:center;vertical-align:middle;">
                    <span style="color:#ffffff;font-size:22px;font-weight:900;line-height:40px;font-family:Arial,sans-serif;">A</span>
                  </td>
                  <td style="padding-left:10px;vertical-align:middle;">
                    <span style="font-size:20px;font-weight:900;color:#0D111E;letter-spacing:-0.5px;font-family:Arial,sans-serif;">AutoPayKe</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#ffffff;border-radius:20px;padding:36px 36px 28px;box-shadow:0 2px 12px rgba(0,0,0,0.07);">
              ${bodyContent}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:24px;" align="center">
              <p style="font-size:11px;color:#999;line-height:1.6;margin:0 0 8px;">
                AutoPayKe Ltd &nbsp;·&nbsp; Phone-first money for Africa
              </p>
              <p style="font-size:11px;color:#999;margin:0 0 8px;">
                <a href="${TERMS_URL}" style="color:#F97316;text-decoration:none;">Terms of Service</a>
                &nbsp;&nbsp;|&nbsp;&nbsp;
                <a href="${PRIVACY_URL}" style="color:#F97316;text-decoration:none;">Privacy Policy</a>
                &nbsp;&nbsp;|&nbsp;&nbsp;
                <a href="mailto:${SUPPORT_EMAIL}" style="color:#F97316;text-decoration:none;">Support</a>
              </p>
              <p style="font-size:10px;color:#bbb;margin:0;">
                You're receiving this because you have an AutoPayKe account linked to this address.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Send helpers ──────────────────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (DEMO_MODE) {
    console.log(`\n[EMAIL DEMO] ──────────────────────────────────────`);
    console.log(`[EMAIL DEMO] To: ${to}`);
    console.log(`[EMAIL DEMO] Subject: ${subject}`);
    console.log(`[EMAIL DEMO] (HTML body suppressed in demo mode)`);
    console.log(`[EMAIL DEMO] ──────────────────────────────────────\n`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[Email] Resend error ${res.status}: ${body}`);
  }

  const json = (await res.json()) as { id?: string };
  console.log(`[Email] Sent "${subject}" to ${to} — id: ${json.id}`);
}

// ── OTP Email ─────────────────────────────────────────────────────────────────

export async function sendOtpEmail(email: string, otp: string): Promise<void> {
  if (DEMO_MODE) {
    console.log(`\n[EMAIL DEMO] ──────────────────────────────────────`);
    console.log(`[EMAIL DEMO] OTP for ${email}: ${otp}`);
    console.log(`[EMAIL DEMO] ──────────────────────────────────────\n`);
    return;
  }

  const body = `
    <h2 style="font-size:22px;font-weight:800;color:#0D111E;margin:0 0 8px;">Your verification code</h2>
    <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 28px;">
      Use the code below to verify your AutoPayKe account. It expires in
      <strong>5 minutes</strong> and can only be used once.
    </p>

    <!-- OTP block -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td align="center">
          <div style="display:inline-block;background:#f5f0ea;border:2px dashed #F97316;border-radius:16px;padding:20px 48px;">
            <span style="font-size:38px;font-weight:900;letter-spacing:10px;color:#0D111E;font-family:'Courier New',monospace;">${otp}</span>
          </div>
        </td>
      </tr>
    </table>

    <!-- Security notice -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border-radius:12px;border:1px solid #fed7aa;margin-bottom:24px;">
      <tr>
        <td style="padding:14px 16px;">
          <p style="font-size:12px;color:#c2410c;margin:0;line-height:1.6;">
            <strong>Security notice:</strong> AutoPayKe will never ask you for this code via phone,
            WhatsApp, or email. Never share it with anyone — including our support team.
            If you didn't request this, please ignore this email.
          </p>
        </td>
      </tr>
    </table>

    <p style="font-size:12px;color:#aaa;margin:0;line-height:1.6;">
      By using AutoPayKe you agree to our
      <a href="${TERMS_URL}" style="color:#F97316;text-decoration:none;">Terms of Service</a>
      and
      <a href="${PRIVACY_URL}" style="color:#F97316;text-decoration:none;">Privacy Policy</a>.
    </p>
  `;

  await sendEmail(email, "Your AutoPayKe verification code", emailWrapper(body));
}

// ── Welcome Email ─────────────────────────────────────────────────────────────

export async function sendWelcomeEmail(email: string, firstName: string): Promise<void> {
  const name = firstName.trim() || "there";

  const body = `
    <h2 style="font-size:22px;font-weight:800;color:#0D111E;margin:0 0 8px;">Welcome to AutoPayKe, ${name}! 🎉</h2>
    <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 24px;">
      Your account is set up and ready. You can now send money to any phone number across
      Africa — settling directly to M-Pesa, MoMo, Wave, and more.
    </p>

    <!-- Steps -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      ${[
        ["1. Add money", "Fund your AutoPayKe wallet using Paystack (card or mobile money). Your balance is held securely on the Avalanche blockchain."],
        ["2. Send to any phone", "Enter the recipient's phone number and amount. We handle the currency conversion and route straight to their mobile money."],
        ["3. Track in real time", "Watch your transaction settle — typically in under 30 seconds. You'll receive a confirmation for every transfer."],
      ].map(([title, desc]) => `
        <tr>
          <td style="padding-bottom:16px;">
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="width:8px;background:linear-gradient(180deg,#F97316,#EA580C);border-radius:4px;" width="8">&nbsp;</td>
                <td style="padding-left:14px;">
                  <p style="font-size:13px;font-weight:700;color:#0D111E;margin:0 0 2px;">${title}</p>
                  <p style="font-size:12px;color:#777;margin:0;line-height:1.5;">${desc}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `).join("")}
    </table>

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td align="center">
          <a href="${APP_URL}/fund"
             style="display:inline-block;background:linear-gradient(135deg,#F97316,#EA580C);color:#ffffff;font-size:14px;font-weight:800;text-decoration:none;padding:14px 36px;border-radius:12px;letter-spacing:0.2px;">
            Add money now
          </a>
        </td>
      </tr>
    </table>

    <!-- Safety tips -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:12px;border:1px solid #bbf7d0;margin-bottom:24px;">
      <tr>
        <td style="padding:14px 16px;">
          <p style="font-size:12px;font-weight:700;color:#15803d;margin:0 0 6px;">Keep your account safe</p>
          <ul style="font-size:12px;color:#166534;margin:0;padding-left:16px;line-height:1.8;">
            <li>Set a 4-digit PIN to lock your app when not in use.</li>
            <li>Enable biometric unlock (fingerprint / Face ID) in Settings.</li>
            <li>Never share your OTP or PIN with anyone — we will never ask for it.</li>
          </ul>
        </td>
      </tr>
    </table>

    <p style="font-size:12px;color:#999;margin:0 0 4px;line-height:1.6;">
      Questions? Reply to this email or reach us at
      <a href="mailto:${SUPPORT_EMAIL}" style="color:#F97316;text-decoration:none;">${SUPPORT_EMAIL}</a>.
    </p>
    <p style="font-size:11px;color:#ccc;margin:0;line-height:1.6;">
      By using AutoPayKe you agree to our
      <a href="${TERMS_URL}" style="color:#F97316;text-decoration:none;">Terms of Service</a>
      and
      <a href="${PRIVACY_URL}" style="color:#F97316;text-decoration:none;">Privacy Policy</a>.
    </p>
  `;

  await sendEmail(email, `Welcome to AutoPayKe, ${name}!`, emailWrapper(body));
}
