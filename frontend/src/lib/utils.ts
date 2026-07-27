import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Transaction } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// en-KE's grouping/digit conventions read fine for all of Autopayke's
// currencies (KES/GHS/NGN/TZS/UGX/XOF) — only the currency code itself
// needs to vary per amount, not the locale.
export function formatLocal(amount: string | number, currency: string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return `${currency} 0`;
  return `${currency} ${num.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function formatUSD(amount: string | number): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "$0.00";
  return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function truncateAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export async function hashPin(pin: string): Promise<string> {
  const encoded = new TextEncoder().encode(pin);
  const buffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local}@${domain}`;
  const masked =
    local[0] + "*".repeat(local.length - 2) + local[local.length - 1];
  return `${masked}@${domain}`;
}

export function resolveTransactionLabel(tx: Transaction): string {
  if (tx.direction === "in") {
    if (tx.rail === "mpesa") return "M-Pesa deposit";
    if (tx.rail === "paystack") return "Paystack funding";
    if (tx.rail === "bank") return "Bank deposit";
    if (tx.rail === "crypto") return "Crypto deposit";
    return "Transfer received";
  }
  if (tx.direction === "out") {
    if (tx.rail === "mpesa") return "M-Pesa withdrawal";
    if (tx.counterparty) return `Send to ${tx.counterparty}`;
    return "Transfer";
  }
  return "Transfer";
}

// Purely computational — works for any local currency, despite the name's
// history; `rate` should be that currency's own USD mid-rate.
export function usdToLocal(usd: string, rate: number): string {
  const amount = parseFloat(usd);
  if (isNaN(amount)) return "0";
  return (amount * rate).toFixed(0);
}
