import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Transaction } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatKES(amount: string | number): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "KES 0";
  return `KES ${num.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
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
  const masked = local[0] + "*".repeat(local.length - 2) + local[local.length - 1];
  return `${masked}@${domain}`;
}

export function resolveTransactionLabel(tx: Transaction): string {
  if (tx.type === "received") {
    if (tx.source === "mpesa") return "M-Pesa deposit";
    if (tx.source === "paystack") return "Paystack funding";
    if (tx.source === "bank") return "Bank deposit";
    if (tx.source === "crypto") return "Crypto deposit";
    return "Transfer received";
  }
  if (tx.type === "sent") {
    if (tx.source === "mpesa") return "M-Pesa withdrawal";
    if (tx.recipient_name) return `Send to ${tx.recipient_name}`;
    if (tx.recipient_phone) return `Send to ${tx.recipient_phone.slice(0, 6)}...${tx.recipient_phone.slice(-3)}`;
    return "Transfer";
  }
  return "Transfer";
}

export function usdcToKes(usdc: string, rate: number): string {
  const amount = parseFloat(usdc);
  if (isNaN(amount)) return "0";
  return (amount * rate).toFixed(0);
}
