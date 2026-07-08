import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    TanStackRouterVite({ autoCodeSplitting: true }),
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      manifest: {
        name: "AutoPayKe — Send money by phone",
        short_name: "AutoPayKe",
        description: "Phone-first money for Africa. Send to any number, settle locally.",
        theme_color: "#080810",
        background_color: "#080810",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallback: "/index.html",
        runtimeCaching: [
          // Same-origin static assets not already swept into the precache
          // manifest (e.g. a lazy route chunk fetched after a deploy while
          // an older service worker is still active) — served instantly
          // from cache, refreshed in the background.
          {
            urlPattern: ({ request, sameOrigin }) =>
              sameOrigin && ["style", "script", "font", "image"].includes(request.destination),
            handler: "CacheFirst",
            options: {
              cacheName: "static-assets",
              expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          // Semi-static config — changes rarely, safe to serve stale while
          // a fresh copy loads in the background.
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && url.pathname === "/api/send/corridors",
            handler: "StaleWhileRevalidate",
            options: { cacheName: "corridors-config" },
          },
          // Volatile data — FX rates and transaction status. Prefer a live
          // network response but fall back to a short-lived cached one on
          // flaky connections rather than failing outright.
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin &&
              (url.pathname === "/api/fx/rates" ||
                url.pathname.startsWith("/api/track/") ||
                url.pathname.startsWith("/api/history")),
            handler: "NetworkFirst",
            options: {
              cacheName: "volatile-data",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "@tanstack/react-router"],
  },
});
