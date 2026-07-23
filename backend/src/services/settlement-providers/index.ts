import { minisendProvider } from "./minisend";
import type { SettlementProvider } from "./types";

// Routed by country — this is the swap-in point for adding HoneyCoin (or
// running it alongside Minisend for markets Minisend doesn't cover, like
// Tanzania) later: a new provider implementation + an entry here, no changes
// to the withdraw routes themselves.
const PROVIDERS: SettlementProvider[] = [minisendProvider];

export function getProviderForCountry(countryCode: string): SettlementProvider | null {
  return PROVIDERS.find((p) => p.supportsCountry(countryCode)) ?? null;
}

export * from "./types";
