import { useState, useEffect } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as unknown as Record<string, unknown>).MSStream;
}

function isAndroid() {
  return /android/i.test(navigator.userAgent);
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    !!(window.navigator as unknown as { standalone?: boolean }).standalone
  );
}

function getEarlyCapturedPrompt(): BeforeInstallPromptEvent | null {
  return (
    (window as unknown as { __pwaInstallPrompt?: BeforeInstallPromptEvent | null })
      .__pwaInstallPrompt ?? null
  );
}

export function usePwaInstall() {
  // index.html captures beforeinstallprompt the instant it fires (often
  // before this lazily-loaded route's effects ever run) — pick that up
  // immediately instead of only listening from here on out.
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(() =>
    typeof window !== "undefined" ? getEarlyCapturedPrompt() : null
  );
  const [installed, setInstalled] = useState(() => isStandalone());

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    const onAvailable = () => setPrompt(getEarlyCapturedPrompt());
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("pwa-install-available", onAvailable);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("pwa-install-available", onAvailable);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    (window as unknown as { __pwaInstallPrompt?: BeforeInstallPromptEvent | null }).__pwaInstallPrompt = null;
    if (outcome === "accepted") {
      setInstalled(true);
      setPrompt(null);
    }
  };

  const ios = typeof navigator !== "undefined" && isIOS();
  const android = typeof navigator !== "undefined" && isAndroid();
  const canInstall = !installed && (!!prompt || ios);

  return { canInstall, install, installed, isIOS: ios, isAndroid: android, hasNativePrompt: !!prompt };
}
