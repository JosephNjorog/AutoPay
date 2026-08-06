/**
 * Workstream 1 of the Pretium integration: confirm what's actually enabled
 * on Autopayke's Pretium account (as opposed to the general platform docs
 * list) before any Pretium-backed flow can be turned on. Run this once
 * PRETIUM_API_KEY and PRETIUM_BASE_URL are set to sandbox values, read the
 * raw response, then set PRETIUM_VERIFIED_OFFRAMP_MARKETS and
 * PRETIUM_VERIFIED_ONRAMP_MARKETS accordingly (comma-separated country
 * codes, e.g. "KE,UG") — those two env vars are what actually gate
 * pretiumProvider.supportsCountry() / supportsOnrampCountry().
 *
 * Usage: bun run monitor:pretium-networks
 */
import { verifyPretiumAccountNetworks } from "../services/settlement-providers/pretium";

try {
  const result = await verifyPretiumAccountNetworks();
  console.log("[Pretium] Raw /account/networks response:");
  console.log(JSON.stringify(result, null, 2));
  console.log(
    "\nConfirm Avalanche + USDC/USDT is present, and which of KE/UG/NG/GH/TZ are enabled, " +
      "then set PRETIUM_VERIFIED_OFFRAMP_MARKETS / PRETIUM_VERIFIED_ONRAMP_MARKETS accordingly."
  );
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[Pretium] Verification call FAILED: ${message}`);
  process.exitCode = 1;
}
