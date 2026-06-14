import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { avalanche, avalancheFuji } from "@reown/appkit/networks";

// Get your project ID from https://cloud.reown.com (free)
const projectId = (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined) ?? "";

const networks = [avalancheFuji, avalanche] as const;

export const wagmiAdapter = new WagmiAdapter({ networks, projectId });

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  metadata: {
    name: "TUMA",
    description: "Phone-first cross-border payments for Africa",
    url: (import.meta.env.VITE_APP_URL as string | undefined) ?? "https://tuma.app",
    icons: [],
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
