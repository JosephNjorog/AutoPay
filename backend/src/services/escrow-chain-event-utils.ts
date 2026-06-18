import { formatUnits, type Hex } from "viem";

export function bytes32ToString(value: Hex): string {
  const hex = value.slice(2).replace(/(?:00)+$/, "");
  return hex ? Buffer.from(hex, "hex").toString("utf8") : "";
}

export function amountUsdc(amount: bigint): string {
  return Number(formatUnits(amount, 6)).toFixed(6);
}

export function expiryDate(expiry: bigint): Date {
  return new Date(Number(expiry) * 1000);
}
