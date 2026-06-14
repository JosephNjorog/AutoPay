import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ShieldCheck, ChevronDown, Check, Loader2, Sparkles } from "lucide-react";
import { MobileFrame } from "@/components/MobileFrame";
import { countries } from "@/lib/tuma-data";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Sign up · TUMA" }, { name: "description", content: "Your number becomes your wallet. No seed phrases." }] }),
  component: Signup,
});

type Step = "phone" | "otp" | "creating" | "done";

function Signup() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("phone");
  const [country, setCountry] = useState(countries[0]);
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [resendIn, setResendIn] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const valid = phone.replace(/\D/g, "").length >= 9;

  useEffect(() => {
    if (step !== "otp") return;
    setResendIn(30);
    const t = setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [step]);

  useEffect(() => {
    if (step !== "creating") return;
    const t = setTimeout(() => setStep("done"), 2200);
    return () => clearTimeout(t);
  }, [step]);

  const otpComplete = otp.every((c) => c !== "");

  function handleOtp(i: number, v: string) {
    const ch = v.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[i] = ch;
    setOtp(next);
    if (ch && i < 5) otpRefs.current[i + 1]?.focus();
  }

  return (
    <MobileFrame>
      <div className="flex min-h-full flex-col p-6 pb-10">
        <div className="flex items-center justify-between">
          <Link to="/" className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex gap-1.5">
            {(["phone","otp","done"] as const).map((s, i) => {
              const idx = ["phone","otp","creating","done"].indexOf(step);
              const active = i <= [0,1,2,2][idx];
              return <span key={s} className={`h-1.5 w-6 rounded-full transition ${active ? "bg-primary" : "bg-border"}`} />;
            })}
          </div>
        </div>

        {step === "phone" && (
          <>
            <div className="mt-10">
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Step 1 of 3</p>
              <h1 className="mt-3 text-4xl font-black tracking-tight leading-[1.05]">What's your<br />number?</h1>
              <p className="mt-3 text-sm text-muted-foreground">It becomes your global wallet ID. We'll text you a 6-digit code to verify it.</p>
            </div>

            <div className="mt-8 space-y-3">
              <div className="relative">
                <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left">
                  <span className="text-2xl">{country.flag}</span>
                  <div className="flex-1">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Country</p>
                    <p className="font-semibold text-sm">{country.name} <span className="text-muted-foreground font-normal">({country.dial})</span></p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
                {open && (
                  <div className="absolute z-20 mt-2 w-full max-h-64 overflow-y-auto rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
                    {countries.map((c) => (
                      <button key={c.code} onClick={() => { setCountry(c); setOpen(false); }} className="w-full flex items-center gap-3 p-3 hover:bg-muted text-left">
                        <span className="text-xl">{c.flag}</span>
                        <span className="flex-1 text-sm font-medium">{c.name}</span>
                        <span className="text-xs text-muted-foreground">{c.dial}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Phone number</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-bold text-lg">{country.dial}</span>
                  <input
                    type="tel" inputMode="tel" placeholder="24 567 8910"
                    value={phone} onChange={(e) => setPhone(e.target.value)}
                    className="flex-1 bg-transparent text-lg font-bold outline-none placeholder:text-muted-foreground/40"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl bg-primary-soft p-4 flex gap-3">
              <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">No seed phrase. Ever.</p>
                <p className="text-xs text-muted-foreground mt-1">A smart wallet is derived from your number + our server key. Recover by re-verifying your SIM.</p>
              </div>
            </div>

            <div className="mt-auto pt-8">
              <button disabled={!valid} onClick={() => setStep("otp")}
                className="w-full flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-sm font-semibold text-primary-foreground transition disabled:opacity-40 disabled:cursor-not-allowed shadow-[var(--shadow-elegant)]"
                style={{ background: "var(--gradient-portfolio)" }}>
                Send verification code <ArrowRight className="h-4 w-4" />
              </button>
              <p className="mt-3 text-center text-[11px] text-muted-foreground">By continuing you agree to TUMA's Terms.</p>
            </div>
          </>
        )}

        {step === "otp" && (
          <>
            <div className="mt-10">
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Step 2 of 3</p>
              <h1 className="mt-3 text-4xl font-black tracking-tight leading-[1.05]">Enter the<br />6-digit code</h1>
              <p className="mt-3 text-sm text-muted-foreground">Sent via SMS to <span className="font-semibold text-foreground">{country.dial} {phone}</span></p>
            </div>

            <div className="mt-8 grid grid-cols-6 gap-2">
              {otp.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => { otpRefs.current[i] = el; }}
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={(e) => handleOtp(i, e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Backspace" && !d && i > 0) otpRefs.current[i - 1]?.focus(); }}
                  className="aspect-square rounded-2xl border-2 border-border bg-card text-center text-2xl font-black outline-none focus:border-primary focus:bg-primary-soft transition"
                />
              ))}
            </div>

            <button onClick={() => setOtp(["1","2","3","4","5","6"])} className="mt-4 text-xs text-muted-foreground self-center">
              Tap to autofill demo code
            </button>

            <div className="mt-6 text-center text-xs text-muted-foreground">
              {resendIn > 0 ? `Resend code in ${resendIn}s` : <button className="text-primary font-semibold" onClick={() => setResendIn(30)}>Resend code</button>}
            </div>

            <div className="mt-auto pt-8">
              <button disabled={!otpComplete} onClick={() => setStep("creating")}
                className="w-full flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-sm font-semibold text-primary-foreground transition disabled:opacity-40 shadow-[var(--shadow-elegant)]"
                style={{ background: "var(--gradient-portfolio)" }}>
                Verify <ArrowRight className="h-4 w-4" />
              </button>
              <button onClick={() => setStep("phone")} className="mt-3 w-full text-center text-[11px] text-muted-foreground">Change number</button>
            </div>
          </>
        )}

        {step === "creating" && (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="relative h-24 w-24">
              <div className="absolute inset-0 rounded-full opacity-40 blur-2xl" style={{ background: "var(--gradient-portfolio)" }} />
              <div className="relative h-full w-full rounded-full flex items-center justify-center text-primary-foreground" style={{ background: "var(--gradient-portfolio)" }}>
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            </div>
            <h2 className="mt-6 text-2xl font-black">Spinning up your wallet</h2>
            <ul className="mt-6 space-y-2 text-left text-xs text-muted-foreground">
              <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-success" /> Number verified</li>
              <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-success" /> Smart account deployed on Avalanche</li>
              <li className="flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> Linking to your local rail…</li>
            </ul>
          </div>
        )}

        {step === "done" && (
          <div className="flex-1 flex flex-col">
            <div className="mt-10 flex flex-col items-center text-center">
              <div className="h-20 w-20 rounded-full bg-success-soft flex items-center justify-center">
                <Check className="h-10 w-10 text-success" />
              </div>
              <h2 className="mt-6 text-3xl font-black tracking-tight">You're in.</h2>
              <p className="mt-2 text-sm text-muted-foreground max-w-xs">Your TUMA wallet is live. Fund it to start sending across Africa.</p>
            </div>

            <div className="mt-8 rounded-3xl p-5 text-primary-foreground shadow-[var(--shadow-elegant)]" style={{ background: "var(--gradient-portfolio)" }}>
              <div className="flex items-center gap-2 text-xs opacity-90">
                <Sparkles className="h-3.5 w-3.5" /> Your TUMA number
              </div>
              <p className="mt-1 text-2xl font-black">{country.dial} {phone || "24 567 8910"}</p>
              <p className="mt-1 text-[11px] opacity-80">Smart wallet linked · ready to receive</p>
            </div>

            <div className="mt-auto pt-8 space-y-2">
              <button onClick={() => navigate({ to: "/fund" })}
                className="w-full rounded-2xl px-6 py-4 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-elegant)]"
                style={{ background: "var(--gradient-portfolio)" }}>
                Add money to wallet
              </button>
              <button onClick={() => navigate({ to: "/dashboard" })}
                className="w-full rounded-2xl border border-border bg-card py-4 text-sm font-semibold">
                Skip for now
              </button>
            </div>
          </div>
        )}
      </div>
    </MobileFrame>
  );
}
