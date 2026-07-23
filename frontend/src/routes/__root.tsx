import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  HeadContent,
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
} from "@tanstack/react-router";
import { WagmiProvider } from "wagmi";
import { useEffect } from "react";
import { Toaster } from "sonner";

import { reportError } from "../lib/error-reporting";
import { wagmiConfig } from "../lib/web3";
import { useSessionStore } from "../stores/sessionStore";
import { OfflineBanner } from "../components/OfflineBanner";
import { useAppUpdate } from "../hooks/useAppUpdate";

// Side-effect: initialises Reown AppKit modal
import "../lib/web3";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-linen px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-ink">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-ink">Page not found</h2>
        <p className="mt-2 text-sm text-slate">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-ink-hover"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-linen px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-slate">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-ink-hover"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-ink/15 bg-linen px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-ink/5"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const setUnlocked = useSessionStore((s) => s.setUnlocked);
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated());
  const { hasUpdate, applyUpdate } = useAppUpdate();

  // Lock the app when it goes to background.
  // 2s grace period avoids false locks from brief visibility changes some mobile
  // browsers fire during in-app navigation transitions.
  useEffect(() => {
    let lockTimer: ReturnType<typeof setTimeout> | null = null;
    let wasBackgrounded = false;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (isAuthenticated) {
          wasBackgrounded = true;
          lockTimer = setTimeout(() => {
            setUnlocked(false);
            // Backgrounded and about to show the PIN screen on return either
            // way — an invisible moment to swap in a new deploy, instead of
            // making the user hard-refresh to get it.
            if (hasUpdate) applyUpdate();
          }, 2000);
        } else if (hasUpdate) {
          // No PIN screen guarding this route — safe to apply right away.
          applyUpdate();
        }
      } else {
        if (lockTimer !== null) {
          clearTimeout(lockTimer);
          lockTimer = null;
        }
        // Mobile browsers can freeze the tab's JS entirely while backgrounded,
        // so timers (react-query's refetchInterval included) don't run. If we
        // come back without having been fully locked out, force a refetch so
        // the UI doesn't sit on data that's now stale.
        if (wasBackgrounded) {
          wasBackgrounded = false;
          void queryClient.invalidateQueries();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (lockTimer !== null) clearTimeout(lockTimer);
    };
  }, [isAuthenticated, setUnlocked, queryClient, hasUpdate, applyUpdate]);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <HeadContent />
        <OfflineBanner />
        <Outlet />
        <Toaster position="top-center" richColors />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
