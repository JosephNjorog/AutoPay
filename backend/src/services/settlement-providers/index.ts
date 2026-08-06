import { pretiumProvider } from "./pretium";
import type { SettlementProvider } from "./types";

// Routed by country — this is the swap-in point for adding another provider
// (e.g. for Senegal/Côte d'Ivoire, which Pretium doesn't cover) later: a new
// provider implementation + an entry here, no changes to the withdraw/fund
// routes themselves. Pretium's supportsCountry()/supportsOnrampCountry()
// both return false for every country until PRETIUM_VERIFIED_OFFRAMP_MARKETS
// / PRETIUM_VERIFIED_ONRAMP_MARKETS are set post-verification — see
// pretium.ts and scripts/verify-pretium-networks.ts.
const PROVIDERS: SettlementProvider[] = [pretiumProvider];

export function getProviderForCountry(countryCode: string): SettlementProvider | null {
  return PROVIDERS.find((p) => p.supportsCountry(countryCode)) ?? null;
}

export * from "./types";
