const APP_URL = (import.meta.env.VITE_APP_URL as string | undefined) ?? "https://autopayke.com";

/** Builds the URL encoded into a user's "pay me" QR code. */
export function buildPayUrl(phone: string, amountUsd?: number): string {
  const url = new URL("/pay", APP_URL);
  url.searchParams.set("phone", phone);
  if (amountUsd && amountUsd > 0) url.searchParams.set("amount", String(amountUsd));
  return url.toString();
}

/** Parses a scanned QR payload back into a recipient phone + optional fixed amount. */
export function parsePayUrl(raw: string): { phone: string; amount?: number } | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.pathname !== "/pay") return null;

  const phone = url.searchParams.get("phone");
  if (!phone || !/^\+\d{8,15}$/.test(phone)) return null;

  const amountRaw = url.searchParams.get("amount");
  const amount = amountRaw ? parseFloat(amountRaw) : undefined;

  return { phone, amount: amount && amount > 0 ? amount : undefined };
}
