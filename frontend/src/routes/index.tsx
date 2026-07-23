import { createFileRoute, useNavigate, redirect, Link } from "@tanstack/react-router";
import { useRef, useEffect, useState } from "react";
import { Phone, Globe, Zap, ShieldCheck, ArrowRight, Download } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/stores/sessionStore";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    const s = useSessionStore.getState();
    if (s.isAuthenticated()) {
      // Authenticated users go to the lock/PIN screen, not the landing page
      throw redirect({ to: "/login", replace: true });
    }
  },
  head: () => ({
    meta: [
      { title: "AutoPayKe - Phone-first money for Africa" },
      { name: "description", content: "Send to any phone number. Settles on M-Pesa, MoMo, Wave or bank in seconds." },
    ],
  }),
  component: LandingPage,
});

const FEATURES = [
  {
    icon: Phone,
    title: "Phone is your wallet",
    description: "Your number is your address. No seed phrases, no wallet setup.",
  },
  {
    icon: Globe,
    title: "Borderless",
    description: "Settle on M-Pesa, MoMo, Wave across 5 African countries.",
  },
  {
    icon: Zap,
    title: "About 12 seconds",
    description: "Transfers confirm fast. No bank processing delays.",
  },
  {
    icon: ShieldCheck,
    title: "You own it",
    description: "Self-custodial wallet. We cannot touch your funds.",
  },
] as const;

function LandingPage() {
  const navigate = useNavigate();
  const pwaPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [pwaAvailable, setPwaAvailable] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      pwaPromptRef.current = e as BeforeInstallPromptEvent;
      setPwaAvailable(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    // pick up the prompt captured before React mounted
    if (window.__pwaInstallPrompt) {
      pwaPromptRef.current = window.__pwaInstallPrompt;
      setPwaAvailable(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (pwaPromptRef.current) {
      await pwaPromptRef.current.prompt();
      pwaPromptRef.current = null;
      setPwaAvailable(false);
    } else {
      toast.info("Open autopayke.com in your browser to install the app.");
    }
  };

  return (
    <div className="min-h-screen bg-linen relative overflow-hidden font-manrope">
      {/* Radial glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(249,115,22,0.12)_0%,transparent_70%)]" />

      {/* Desktop marketing layout */}
      <div className="hidden md:block relative z-10">
        {/* Top nav */}
        <nav className="sticky top-0 z-20 flex items-center justify-between px-10 lg:px-16 py-5 bg-linen/90 backdrop-blur-sm border-b border-ink/6">
          <div className="flex items-center gap-2.5">
            <img src="/autopay_iconlogo.svg" alt="" className="h-8 w-8 rounded-lg" />
            <span className="font-display font-extrabold text-[18px] text-ink">AutoPayKe</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate({ to: "/login" })}
              className="border border-amber text-amber-deep text-[14px] font-semibold rounded-full px-5 py-2 bg-transparent hover:bg-amber/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-1"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => navigate({ to: "/signup" })}
              className={cn(
                "rounded-full bg-amber text-ink font-display font-bold text-[14px] px-5 py-2.5",
                "shadow-[0_4px_20px_rgba(232,163,61,0.35)] hover:shadow-[0_6px_28px_rgba(249,115,22,0.5)]",
                "transition-shadow flex items-center gap-2",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
              )}
            >
              Get started
              <ArrowRight size={15} strokeWidth={2} />
            </button>
          </div>
        </nav>

        {/* Hero */}
        <div className="max-w-6xl mx-auto px-10 lg:px-16 pt-16 pb-20 grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-1.5 bg-amber/12 border border-amber/40 rounded-full px-3.5 py-1.5 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-success motion-safe:animate-pulse-dot" />
              <span className="text-[12px] font-semibold text-amber-deep">
                Live on Avalanche · 5 countries · 5 rails
              </span>
            </div>

            <h1 className="font-display font-black text-[56px] leading-[1.05] tracking-tight text-ink mb-5">
              Phone-first money for <span className="text-amber-deep">Africa.</span>
            </h1>
            <p className="text-[16px] text-slate leading-relaxed mb-8 max-w-md">
              Send to any phone number. Settles on M-Pesa, MoMo, Wave or bank in seconds. No
              technical knowledge required.
            </p>

            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => navigate({ to: "/signup" })}
                className={cn(
                  "py-4 px-7 rounded-2xl bg-amber text-ink font-display font-bold text-[15px]",
                  "shadow-[0_4px_20px_rgba(232,163,61,0.35)] hover:shadow-[0_6px_28px_rgba(249,115,22,0.5)]",
                  "transition-shadow flex items-center gap-2",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
                )}
              >
                Continue with phone number
                <ArrowRight size={16} strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={handleInstall}
                className={cn(
                  "py-4 px-6 rounded-2xl bg-amber/[0.08] border border-amber/20 text-amber-deep",
                  "font-display font-bold text-[14px] flex items-center gap-2",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
                )}
              >
                <Download size={16} strokeWidth={1.5} />
                Get the app
              </button>
            </div>
          </div>

          {/* Decorative preview card */}
          <div className="relative hidden lg:block">
            <div
              className="absolute -inset-10 rounded-[3rem] opacity-40 blur-3xl"
              style={{ background: "var(--color-amber)" }}
            />
            <div
              className="relative rounded-[2rem] border border-ink/6 bg-paper p-6 max-w-sm mx-auto shadow-xl"
            >
              <div
                className="rounded-2xl p-5 mb-4 bg-ink"
              >
                <p className="text-[10px] font-semibold tracking-widest uppercase text-white/70 mb-1">
                  Total balance
                </p>
                <p className="font-display text-[30px] font-black text-white leading-none">
                  $1,248.90
                </p>
                <p className="text-[12px] text-white/70 mt-1">KES 162,357</p>
              </div>
              <div className="space-y-3">
                {[
                  { name: "To +254 7xx xx xx", amount: "-$25.00", positive: false },
                  { name: "From Amina K.", amount: "+$120.00", positive: true },
                  { name: "To Jumia Store", amount: "-$48.20", positive: false },
                ].map((row) => (
                  <div key={row.name} className="flex items-center justify-between text-[13px]">
                    <span className="text-slate">{row.name}</span>
                    <span className={cn("font-bold", row.positive ? "text-forest-light" : "text-ink")}>
                      {row.amount}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="max-w-6xl mx-auto px-10 lg:px-16 py-16 border-t border-ink/6">
          <h2 className="font-display font-extrabold text-[28px] text-ink mb-10 text-center">
            Why AutoPayKe
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="bg-paper border border-ink/6 rounded-2xl p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                <div className="w-11 h-11 rounded-xl bg-amber/12 flex items-center justify-center mb-4">
                  <Icon size={22} strokeWidth={title === "You own it" ? 2 : 1.5} className="text-amber-deep" />
                </div>
                <p className="text-[15px] font-bold text-ink mb-2">{title}</p>
                <p className="text-[13px] text-slate leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-ink/6 bg-paper/70">
          <div className="max-w-6xl mx-auto px-10 lg:px-16 py-14 grid grid-cols-4 gap-10">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <img src="/autopay_iconlogo.svg" alt="" className="h-7 w-7 rounded-lg" />
                <span className="font-display font-extrabold text-[15px] text-ink">AutoPayKe</span>
              </div>
              <p className="text-[12px] text-slate leading-relaxed">
                Send money to Kenya, Ghana, Nigeria, Senegal, Côte d'Ivoire, Tanzania and Uganda —
                settling on M-Pesa, MTN MoMo, Wave, Orange Money or bank.
              </p>
            </div>
            <div>
              <p className="text-[12px] font-bold text-ink mb-3 uppercase tracking-wide">Product</p>
              <div className="flex flex-col gap-2 text-[13px] text-slate">
                <button type="button" onClick={() => navigate({ to: "/signup" })} className="text-left hover:text-amber-deep transition-colors">
                  Get started
                </button>
                <button type="button" onClick={() => navigate({ to: "/login" })} className="text-left hover:text-amber-deep transition-colors">
                  Sign in
                </button>
              </div>
            </div>
            <div>
              <p className="text-[12px] font-bold text-ink mb-3 uppercase tracking-wide">Legal</p>
              <div className="flex flex-col gap-2 text-[13px] text-slate">
                <Link to="/legal/privacy" className="hover:text-amber-deep transition-colors">
                  Privacy Policy
                </Link>
                <Link to="/legal/terms" className="hover:text-amber-deep transition-colors">
                  Terms of Service
                </Link>
              </div>
            </div>
            <div>
              <p className="text-[12px] font-bold text-ink mb-3 uppercase tracking-wide">Connect</p>
              <a
                href="https://x.com/AutoPayKe"
                target="_blank"
                rel="me noopener noreferrer"
                className="text-[13px] text-slate hover:text-amber-deep transition-colors"
              >
                @AutoPayKe on X
              </a>
            </div>
          </div>
          <div className="max-w-6xl mx-auto px-10 lg:px-16 pb-8 text-[11px] text-slate/70">
            &copy; {new Date().getFullYear()} AutoPayKe. All rights reserved.
          </div>
        </footer>
      </div>

      <div className="md:hidden relative z-10 max-w-[390px] mx-auto px-5 pt-5 pb-10">
        {/* Navbar */}
        <div className="flex items-center justify-between mb-6 sticky top-0 bg-linen/90 backdrop-blur-sm py-3 -mx-5 px-5 z-10">
          <div className="flex items-center gap-2">
            <div className="w-[30px] h-[30px] rounded-lg bg-amber flex items-center justify-center text-white font-bold text-sm font-display">
              A
            </div>
            <span className="font-display font-extrabold text-[16px] text-ink">AutoPayKe</span>
          </div>
          <button
            type="button"
            onClick={() => navigate({ to: "/login" })}
            className="border border-amber text-amber-deep text-[13px] font-semibold rounded-full px-4 py-1.5 bg-transparent hover:bg-amber/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-1"
          >
            Sign in
          </button>
        </div>

        {/* Live badge */}
        <div className="inline-flex items-center gap-1.5 bg-amber/12 border border-amber/40 rounded-full px-3.5 py-1.5 mb-5">
          <span className="w-1.5 h-1.5 rounded-full bg-success motion-safe:animate-pulse-dot" />
          <span className="text-[11px] font-semibold text-amber-deep">
            Live on Avalanche - 5 countries - 5 rails
          </span>
        </div>

        {/* Hero */}
        <h1 className="font-display font-black text-[34px] leading-[1.1] tracking-tight text-ink mb-2">
          Phone-first money for{" "}
          <span className="text-amber-deep">Africa.</span>
        </h1>
        <p className="text-[13px] text-slate leading-relaxed mb-6">
          Send to any phone number. Settles on M-Pesa, MoMo, Wave or bank in seconds. No technical knowledge required.
        </p>

        {/* Feature cards */}
        <div className="grid grid-cols-2 gap-2.5 mb-6">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div key={title} className="bg-paper border border-ink/6 rounded-2xl p-3.5 shadow-sm">
              <div className="w-8 h-8 rounded-lg bg-amber/12 flex items-center justify-center mb-2">
                <Icon size={18} strokeWidth={title === "You own it" ? 2 : 1.5} className="text-amber-deep" />
              </div>
              <p className="text-[12px] font-bold text-ink mb-1">{title}</p>
              <p className="text-[11px] text-slate leading-[1.4]">{description}</p>
            </div>
          ))}
        </div>

        {/* CTA stack */}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => navigate({ to: "/signup" })}
            className={cn(
              "w-full py-4 rounded-2xl bg-amber text-ink font-display font-bold text-[15px]",
              "shadow-[0_4px_20px_rgba(232,163,61,0.35)] hover:shadow-[0_6px_28px_rgba(249,115,22,0.5)]",
              "transition-shadow flex items-center justify-center gap-2",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
            )}
          >
            Continue with phone number
            <ArrowRight size={16} strokeWidth={2} />
          </button>

          <button
            type="button"
            onClick={handleInstall}
            className={cn(
              "w-full py-4 rounded-2xl bg-amber/[0.08] border border-amber/20 text-amber-deep",
              "font-display font-bold text-[14px] flex items-center justify-center gap-2",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
            )}
          >
            <Download size={16} strokeWidth={1.5} />
            Get the app
          </button>

          <button
            type="button"
            onClick={() => navigate({ to: "/login" })}
            className="w-full py-3 text-slate text-[13px] font-medium bg-transparent border-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 focus-visible:ring-offset-2 rounded-lg"
          >
            Try demo account
          </button>
        </div>

        {/* Footer — internal links for crawlability plus the country list,
            which mirrors the areaServed entries in the JSON-LD above so the
            page's visible text backs up the structured data. */}
        <footer className="mt-10 pt-6 border-t border-ink/6">
          <p className="text-[11px] text-slate leading-relaxed mb-3">
            Send money to Kenya, Ghana, Nigeria, Senegal, Côte d'Ivoire, Tanzania and Uganda —
            settling on M-Pesa, MTN MoMo, Wave, Orange Money or bank.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-medium text-slate">
            <Link to="/legal/privacy" className="hover:text-amber-deep transition-colors">
              Privacy Policy
            </Link>
            <Link to="/legal/terms" className="hover:text-amber-deep transition-colors">
              Terms of Service
            </Link>
            <a
              href="https://x.com/AutoPayKe"
              target="_blank"
              rel="me noopener noreferrer"
              className="hover:text-amber-deep transition-colors"
            >
              @AutoPayKe on X
            </a>
          </div>
          <p className="mt-3 text-[10px] text-slate/70">
            &copy; {new Date().getFullYear()} AutoPayKe. All rights reserved.
          </p>
        </footer>
      </div>
    </div>
  );
}

// Extend window with PWA types
declare global {
  interface Window {
    __pwaInstallPrompt: BeforeInstallPromptEvent | null;
  }
  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  }
}
