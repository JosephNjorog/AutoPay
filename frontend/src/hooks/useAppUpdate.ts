import { useRegisterSW } from "virtual:pwa-register/react";

// The browser only re-checks the service worker for updates on navigation —
// a PWA left open (even backgrounded) for hours won't notice a new deploy on
// its own, so poll explicitly too.
const UPDATE_CHECK_INTERVAL_MS = 60_000;

export function useAppUpdate() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      setInterval(() => void registration.update(), UPDATE_CHECK_INTERVAL_MS);
    },
  });

  return {
    hasUpdate: needRefresh,
    // Activates the waiting service worker and reloads. Callers decide when
    // it's safe to invoke this — see __root.tsx's background/lock checkpoint.
    applyUpdate: () => updateServiceWorker(true),
  };
}
