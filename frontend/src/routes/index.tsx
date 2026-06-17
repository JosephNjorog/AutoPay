import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Phone, Globe2, Zap, ShieldCheck, ArrowRight, Share, MoreVertical } from "lucide-react";
import { useState, useEffect } from "react";
import { usePwaInstall } from "../lib/use-pwa-install";

export const Route = createFileRoute("/")({
  component: Index,
});

const VALUE_PROPS = [
  {
    icon: Phone,
    title: "Phone = Identity",
    body: "Your number is your address. No seed phrases, no wallet setup.",
  },
  {
    icon: Globe2,
    title: "Borderless",
    body: "Settle on M-Pesa, MoMo, Wave, or bank — across 5 African countries.",
  },
  {
    icon: Zap,
    title: "Seconds, not days",
    body: "Avalanche C-Chain under the hood. Transfers confirm in under 2 s.",
  },
  {
    icon: ShieldCheck,
    title: "You own it",
    body: "Smart wallet you control. We can't touch your funds.",
  },
];

function IOSInstructions({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div
        className="w-full rounded-t-2xl bg-card border-t border-border p-6"
        style={{ paddingBottom: "calc(2.5rem + env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted-foreground/30" />
        <h3 className="text-base font-semibold text-foreground mb-1">Add Autopayke to Home Screen</h3>
        <p className="text-sm text-muted-foreground mb-4">Follow these steps in Safari:</p>
        <ol className="space-y-3 text-sm text-foreground/80">
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
            <span>Tap the <Share className="inline h-4 w-4 -mt-0.5" /> Share button at the bottom of Safari</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
            <span>Scroll down and tap <strong className="text-foreground">Add to Home Screen</strong></span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
            <span>Tap <strong className="text-foreground">Add</strong> in the top-right corner</span>
          </li>
        </ol>
        <button
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-muted py-3 text-sm font-semibold text-foreground hover:bg-muted/70 transition"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function AndroidInstructions({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div
        className="w-full rounded-t-2xl bg-card border-t border-border p-6"
        style={{ paddingBottom: "calc(2.5rem + env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted-foreground/30" />
        <h3 className="text-base font-semibold text-foreground mb-1">Add Autopayke to Home Screen</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Your browser didn't offer an install prompt — add it manually from Chrome:
        </p>
        <ol className="space-y-3 text-sm text-foreground/80">
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
            <span>Tap the <MoreVertical className="inline h-4 w-4 -mt-0.5" /> menu in the top-right corner</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
            <span>Tap <strong className="text-foreground">Add to Home screen</strong> (or <strong className="text-foreground">Install app</strong>)</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
            <span>Confirm by tapping <strong className="text-foreground">Add</strong> or <strong className="text-foreground">Install</strong></span>
          </li>
        </ol>
        <p className="mt-4 text-xs text-muted-foreground">
          Only Chrome and other Chromium-based browsers support installing Autopayke on Android — Firefox and in-app browsers (Instagram, WhatsApp, etc.) don't.
        </p>
        <button
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-muted py-3 text-sm font-semibold text-foreground hover:bg-muted/70 transition"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function Index() {
  const { canInstall, install, installed, isIOS, isAndroid } = usePwaInstall();
  const [showIOSSheet, setShowIOSSheet] = useState(false);
  const [showAndroidSheet, setShowAndroidSheet] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  // Show install banner after 2.5 seconds if not already installed
  useEffect(() => {
    if (installed) return;
    const t = setTimeout(() => setShowBanner(true), 2500);
    return () => clearTimeout(t);
  }, [installed]);

  const handleGetApp = () => {
    if (canInstall && !isIOS) {
      // Real beforeinstallprompt available (Chrome/Chromium on Android or desktop)
      install();
    } else if (isIOS) {
      setShowIOSSheet(true);
    } else if (isAndroid) {
      // Android but no beforeinstallprompt fired (already dismissed, non-Chromium
      // browser, or in-app webview) — give Chrome's manual menu steps instead of
      // the iOS Safari instructions.
      setShowAndroidSheet(true);
    } else {
      // Desktop browser without native install support
      setShowIOSSheet(true);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <img src="/autopay_iconlogo.svg" alt="Autopayke" className="h-8 w-8 rounded-xl" />
          <span className="font-black tracking-tight text-base">Autopayke</span>
        </div>
        <div className="flex items-center gap-2">
          {!installed && (
            <button
              onClick={handleGetApp}
              className="flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition"
            >
              <Download className="h-3.5 w-3.5" />
              Get App
            </button>
          )}
          <Link
            to="/login"
            className="rounded-full px-4 py-1.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            style={{ background: "var(--gradient-portfolio)" }}
          >
            Sign in
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 max-w-2xl mx-auto w-full text-center">
        {/* Badge */}
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground mb-8">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inset-0 rounded-full bg-success animate-ping opacity-75" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-success" />
          </span>
          Live on Avalanche · 5 countries · 5 rails
        </span>

        {/* Headline */}
        <h1 className="text-5xl font-black tracking-tight leading-none mb-4 sm:text-6xl">
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: "var(--gradient-portfolio)" }}
          >
            Autopayke
          </span>
        </h1>
        <p className="text-xl font-semibold text-foreground/80 mb-3 leading-snug">
          Phone-first money for Africa.
        </p>
        <p className="text-base text-muted-foreground max-w-sm leading-relaxed mb-12">
          Send to any phone number. Settles on M-Pesa, MoMo, Wave or bank —
          in seconds. No crypto knowledge required.
        </p>

        {/* Value props */}
        <div className="grid grid-cols-2 gap-3 w-full mb-12">
          {VALUE_PROPS.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl border border-border bg-card p-4 text-left"
            >
              <Icon className="h-5 w-5 text-primary mb-2" />
              <p className="text-sm font-semibold text-foreground mb-0.5">{title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
            </div>
          ))}
        </div>

        {/* CTAs */}
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <Link
            to="/signup"
            className="flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold text-primary-foreground transition hover:opacity-90 shadow-(--shadow-elegant)"
            style={{ background: "var(--gradient-portfolio)" }}
          >
            Continue with phone number
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/dashboard"
            className="flex items-center justify-center gap-2 rounded-2xl border border-border py-4 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground/20 transition"
          >
            Skip — try demo account
          </Link>
          {!installed && (
            <button
              onClick={handleGetApp}
              className="flex items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-primary-soft py-3 text-sm font-medium text-primary hover:bg-primary-soft/70 transition"
            >
              <Download className="h-4 w-4" />
              Get the app
            </button>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-6 px-6 text-xs text-muted-foreground">
        Powered by Avalanche · Secured by your phone
      </footer>

      {/* Install banner — slides up after 2.5s */}
      {showBanner && !installed && !showIOSSheet && !showAndroidSheet && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 flex justify-center pointer-events-none"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="pointer-events-auto w-full max-w-sm mx-4 mb-4 rounded-2xl border border-border bg-card/95 backdrop-blur-xl p-4 shadow-2xl flex items-center gap-3">
            <img src="/autopay_iconlogo.svg" alt="Autopayke" className="h-12 w-12 rounded-xl shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground">Add Autopayke to Home Screen</p>
              <p className="text-xs text-muted-foreground">Use it like a native app — instant access</p>
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              <button
                onClick={handleGetApp}
                className="rounded-xl px-3 py-1.5 text-xs font-bold text-primary-foreground transition hover:opacity-90"
                style={{ background: "var(--gradient-portfolio)" }}
              >
                Install
              </button>
              <button onClick={() => setShowBanner(false)} className="rounded-xl bg-muted px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/70 transition">
                Later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* iOS / Desktop instructions sheet */}
      {showIOSSheet && <IOSInstructions onClose={() => setShowIOSSheet(false)} />}
      {showAndroidSheet && <AndroidInstructions onClose={() => setShowAndroidSheet(false)} />}
    </div>
  );
}
