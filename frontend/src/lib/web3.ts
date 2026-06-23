import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { avalanche, avalancheFuji } from "@reown/appkit/networks";

// Reown Cloud project for Autopayke — set VITE_WALLETCONNECT_PROJECT_ID in
// every deploy environment; this fallback only covers a missing env var.
const projectId = (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined) ?? "1348491e6acf0fa944e3272935f96a94";

const networks = [avalancheFuji, avalanche] as const;

export const wagmiAdapter = new WagmiAdapter({ networks, projectId });

// Mobile wallets (MetaMask, Core, Trust, etc.) fetch this metadata to render
// the connect prompt and to verify the dapp's domain via WalletConnect's
// Verify API. An empty icons array or a `url` that doesn't match where the
// app is actually running causes those wallets to show a blank icon or an
// "unverified site" warning — and on some wallets, to silently refuse the
// connection. Use the real runtime origin when available so this stays
// correct across production, previews, and local dev.
const appUrl =
  typeof window !== "undefined"
    ? window.location.origin
    : (import.meta.env.VITE_APP_URL as string | undefined) ?? "https://autopayke.com";

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  metadata: {
    name: "Autopayke",
    description: "Phone-first cross-border payments for Africa",
    url: appUrl,
    icons: [`${appUrl}/icons/icon-192.png`],
  },
  features: {
    analytics: false,
    email: false,
    socials: false,
    onramp: false,
  },
  themeMode: "dark",
  themeVariables: {
    "--w3m-accent": "oklch(0.6 0.24 264)",
  },
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
