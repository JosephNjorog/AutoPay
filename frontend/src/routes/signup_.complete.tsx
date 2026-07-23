import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { ArrowRight, Check } from "lucide-react";
import { useSignupStore } from "@/stores/signupStore";
import { useSessionStore } from "@/stores/sessionStore";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { cn } from "@/lib/utils";
import { useState } from "react";

export const Route = createFileRoute("/signup_/complete")({
  head: () => ({ meta: [{ title: "AutoPayKe - Welcome!" }] }),
  component: SignupComplete,
});

const STEPS = [
  "Phone verified",
  "PIN created",
  "Wallet assigned",
  "Ready to send",
] as const;

function SignupComplete() {
  const navigate = useNavigate();
  const { pin_hash, clearSignupStore } = useSignupStore();
  const { setPinHash, isAuthenticated } = useSessionStore();

  const [done, setDone] = useState(false);
  const ranRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated() || !pin_hash) {
      void navigate({ to: "/signup" });
      return;
    }

    if (ranRef.current) return;
    ranRef.current = true;

    // persist pin_hash so the lock screen can verify locally
    setPinHash(pin_hash);

    // brief animation pause, then mark done
    const t = setTimeout(() => {
      clearSignupStore();
      setDone(true);
    }, 1400);

    return () => clearTimeout(t);
  }, []);

  const handleContinue = () => {
    void navigate({ to: "/dashboard" });
  };

  const activating = !done;

  return (
    <div className="min-h-screen bg-ink relative flex flex-col items-center justify-center px-5 font-manrope">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_60%,rgba(232,163,61,0.18)_0%,transparent_70%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_40%_30%_at_50%_25%,rgba(232,163,61,0.08)_0%,transparent_70%)]" />

      <div className="relative z-10 w-full max-w-97.5 flex flex-col items-center text-center">
        <div
          className={cn(
            "w-20 h-20 rounded-3xl flex items-center justify-center mb-7 transition-colors duration-500",
            done ? "bg-forest/20 border border-forest/30" : "bg-amber/15 border border-amber/40"
          )}
        >
          {activating ? (
            <LoadingSpinner size={28} color="orange" />
          ) : (
            <Check size={32} strokeWidth={2.5} className="text-forest-light" />
          )}
        </div>

        <h1 className="font-display font-black text-[32px] leading-[1.1] text-white mb-3">
          {activating ? "Setting up your wallet…" : "You're all set."}
        </h1>

        {activating && (
          <p className="text-[13px] text-white/40 leading-relaxed max-w-65">
            Assigning your wallet address on Avalanche. This takes a few seconds.
          </p>
        )}

        {done && (
          <p className="text-[13px] text-white/50 leading-relaxed max-w-70">
            Your wallet is live on Avalanche C-Chain. You can now send money to any phone number in Africa.
          </p>
        )}

        <div className="w-full bg-white/5 border border-white/8 rounded-2xl px-5 py-4 mt-8 mb-8 text-left">
          {STEPS.map((step, i) => {
            const checked = done || (activating && i < 2);
            return (
              <div key={step} className={cn("flex items-center gap-3 py-2", i < STEPS.length - 1 && "border-b border-white/5")}>
                <div
                  className={cn(
                    "w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors duration-300",
                    checked
                      ? "bg-forest/20 border-forest/50"
                      : activating
                      ? "border-white/20 bg-transparent animate-pulse"
                      : "border-white/10 bg-transparent"
                  )}
                >
                  {checked && <Check size={11} strokeWidth={3} className="text-forest-light" />}
                </div>
                <span
                  className={cn(
                    "text-[13px] transition-colors duration-300",
                    checked ? "text-white font-medium" : "text-white/35"
                  )}
                >
                  {step}
                </span>
              </div>
            );
          })}
        </div>

        {done && (
          <button
            type="button"
            onClick={handleContinue}
            className={cn(
              "w-full py-4 rounded-2xl bg-amber text-ink font-display font-bold text-[15px]",
              "shadow-[0_6px_20px_rgba(232,163,61,0.35)] flex items-center justify-center gap-2",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
            )}
          >
            Go to dashboard
            <ArrowRight size={16} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
}
