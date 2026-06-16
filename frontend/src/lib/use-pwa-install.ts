import { useState, useEffect } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as unknown as Record<string, unknown>).MSStream;
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    !!(window.navigator as unknown as { standalone?: boolean }).standalone
  );
}

export function usePwaInstall() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandalone());

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") {
      setInstalled(true);
      setPrompt(null);
    }
  };

  const ios = typeof navigator !== "undefined" && isIOS();
  const canInstall = !installed && (!!prompt || ios);

  return { canInstall, install, installed, isIOS: ios };
}
