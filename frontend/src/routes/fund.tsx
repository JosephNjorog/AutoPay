import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, CreditCard, Building2, Wallet as WalletIcon, ArrowRight, Check, Copy, Info, Sparkles, Loader2 } from "lucide-react";
import { MobileFrame } from "@/components/MobileFrame";
import { user } from "@/lib/tuma-data";

export const Route = createFileRoute("/fund")({
  head: () => ({ meta: [{ title: "Add money · TUMA" }, { name: "description", content: "Top up your TUMA wallet via card, bank, or crypto." }] }),
  component: Fund,
});

type Method = "card" | "bank" | "crypto";

function Fund() {
  const navigate = useNavigate();
  const [method, setMethod] = useState<Method>("card");
  const [amount, setAmount] = useState("50");
  const [stage, setStage] = useState<"pick" | "pay" | "done">("pick");
  const [copied, setCopied] = useState(false);
  const amt = Number(amount) || 0;
  const usdc = amt;
  const localFee = method === "card" ? amt * 0.015 : method === "bank" ? 0.3 : 0;

  function copy(s: string) {
    navigator.clipboard?.writeText(s);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <MobileFrame>
      <div className="flex min-h-full flex-col p-5 pb-10">
        <header className="flex items-center justify-between">
          <Link to="/dashboard" className="h-9 w-9 rounded-full border border-border bg-card flex items-center justify-center"><ArrowLeft className="h-4 w-4" /></Link>
          <h1 className="text-sm font-bold">Add money</h1>
          <span className="w-9" />
        </header>

        {stage === "pick" && (
          <>
            <div className="mt-6">
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">You're funding</p>
              <div className="mt-3 rounded-3xl p-5 text-primary-foreground shadow-[var(--shadow-elegant)]" style={{ background: "var(--gradient-portfolio)" }}>
                <p className="text-xs opacity-90">Amount in USD</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-black opacity-80">$</span>
                  <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                    inputMode="decimal" className="bg-transparent text-5xl font-black outline-none w-full" />
                </div>
                <div className="mt-3 flex gap-2">
                  {["20","50","100","250"].map((v) => (
                    <button key={v} onClick={() => setAmount(v)} className={`flex-1 rounded-full py-1.5 text-xs font-semibold backdrop-blur ${amount===v ? "bg-white text-foreground" : "bg-white/15"}`}>${v}</button>
                  ))}
                </div>
              </div>
            </div>

            <p className="mt-6 text-[10px] uppercase tracking-wider text-muted-foreground">Choose method</p>
            <div className="mt-2 space-y-2">
              <MethodCard m="card" active={method==="card"} onClick={() => setMethod("card")} icon={CreditCard} title="Card payment" sub="Visa, Mastercard via Paystack · 1.5% fee" badge="Most popular" />
              <MethodCard m="bank" active={method==="bank"} onClick={() => setMethod("bank")} icon={Building2} title="Bank transfer" sub="Instant EFT · $0.30 flat" />
              <MethodCard m="crypto" active={method==="crypto"} onClick={() => setMethod("crypto")} icon={WalletIcon} title="Crypto deposit" sub="Send USDC/AVAX from Core or MetaMask" badge="Power user" />
            </div>

            <div className="mt-5 rounded-2xl border border-border bg-card p-4 text-xs space-y-2">
              <Row k="You pay" v={`$${amt.toFixed(2)}`} />
              <Row k="Network fee" v={localFee ? `$${localFee.toFixed(2)}` : "Free"} />
              <div className="h-px bg-border my-1" />
              <Row k="Credited to wallet" v={`${usdc.toFixed(2)} USDC`} bold />
            </div>

            <div className="mt-auto pt-6">
              <button disabled={amt <= 0} onClick={() => setStage("pay")}
                className="w-full flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-sm font-semibold text-primary-foreground disabled:opacity-40 shadow-[var(--shadow-elegant)]"
                style={{ background: "var(--gradient-portfolio)" }}>
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </>
        )}

        {stage === "pay" && method === "card" && (
          <PayCard amount={amt} onDone={() => setStage("done")} />
        )}
        {stage === "pay" && method === "bank" && (
          <PayBank amount={amt} onDone={() => setStage("done")} />
        )}
        {stage === "pay" && method === "crypto" && (
          <PayCrypto address={user.smartWallet} copied={copied} onCopy={copy} onDone={() => setStage("done")} />
        )}

        {stage === "done" && (
          <div className="flex-1 flex flex-col">
            <div className="mt-12 flex flex-col items-center text-center">
              <div className="h-20 w-20 rounded-full bg-success-soft flex items-center justify-center">
                <Check className="h-10 w-10 text-success" />
              </div>
              <h2 className="mt-6 text-3xl font-black">Wallet funded</h2>
              <p className="mt-2 text-sm text-muted-foreground">{usdc.toFixed(2)} USDC added to your smart wallet.</p>
            </div>
            <div className="mt-auto pt-6 space-y-2">
              <button onClick={() => navigate({ to: "/send" })} className="w-full rounded-2xl px-6 py-4 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-elegant)]" style={{ background: "var(--gradient-portfolio)" }}>Send money now</button>
              <button onClick={() => navigate({ to: "/dashboard" })} className="w-full rounded-2xl border border-border bg-card py-4 text-sm font-semibold">Back to home</button>
            </div>
          </div>
        )}
      </div>
    </MobileFrame>
  );
}

function MethodCard({ active, onClick, icon: Icon, title, sub, badge }: { m: Method; active: boolean; onClick: () => void; icon: typeof CreditCard; title: string; sub: string; badge?: string }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-3 rounded-2xl border p-4 text-left transition ${active ? "border-primary bg-primary-soft" : "border-border bg-card hover:bg-muted/50"}`}>
      <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${active ? "text-primary-foreground" : "bg-muted text-foreground"}`} style={active ? { background: "var(--gradient-portfolio)" } : undefined}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold">{title}</p>
          {badge && <span className="text-[9px] uppercase tracking-wider bg-foreground text-background rounded-full px-1.5 py-0.5">{badge}</span>}
        </div>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </div>
      <div className={`h-5 w-5 rounded-full border-2 ${active ? "border-primary bg-primary" : "border-border"}`}>
        {active && <Check className="h-3 w-3 text-primary-foreground m-0.5" />}
      </div>
    </button>
  );
}

function PayCard({ amount, onDone }: { amount: number; onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  return (
    <div className="flex-1 flex flex-col">
      <div className="mt-6">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Pay with card</p>
        <h2 className="mt-2 text-2xl font-black">${amount.toFixed(2)} via Paystack</h2>
      </div>
      <div className="mt-6 space-y-3">
        <Field label="Card number" placeholder="4242 4242 4242 4242" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Expiry" placeholder="MM / YY" />
          <Field label="CVC" placeholder="123" />
        </div>
        <Field label="Cardholder name" placeholder="Ama Mensah" />
      </div>
      <div className="mt-4 rounded-2xl border border-border bg-card p-3 flex items-start gap-2">
        <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground">Payment is processed by Paystack. Funds settle to your TUMA smart wallet as USDC the moment the webhook fires.</p>
      </div>
      <div className="mt-auto pt-6">
        <button onClick={() => { setLoading(true); setTimeout(onDone, 1800); }} disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-elegant)] disabled:opacity-60"
          style={{ background: "var(--gradient-portfolio)" }}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? "Processing…" : `Pay $${amount.toFixed(2)}`}
        </button>
      </div>
    </div>
  );
}

function PayBank({ amount, onDone }: { amount: number; onDone: () => void }) {
  return (
    <div className="flex-1 flex flex-col">
      <div className="mt-6">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Bank transfer</p>
        <h2 className="mt-2 text-2xl font-black">Send ${amount.toFixed(2)}</h2>
        <p className="mt-2 text-sm text-muted-foreground">Use these one-time details. We auto-detect and credit your wallet.</p>
      </div>
      <div className="mt-5 rounded-3xl border border-border bg-card divide-y divide-border">
        <Row k="Bank" v="Wema Bank (Paystack-VA)" />
        <Row k="Account" v="9912 045 778" mono />
        <Row k="Name" v="TUMA / Ama Mensah" />
        <Row k="Reference" v="TUMA-AMA-7791" mono />
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground text-center">This account is unique to you. Reference is auto-detected.</p>
      <div className="mt-auto pt-6">
        <button onClick={onDone} className="w-full rounded-2xl py-4 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-elegant)]" style={{ background: "var(--gradient-portfolio)" }}>I've sent the transfer</button>
      </div>
    </div>
  );
}

function PayCrypto({ address, copied, onCopy, onDone }: { address: string; copied: boolean; onCopy: (s: string) => void; onDone: () => void }) {
  return (
    <div className="flex-1 flex flex-col">
      <div className="mt-6">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Crypto deposit</p>
        <h2 className="mt-2 text-2xl font-black">Send to your smart wallet</h2>
        <p className="mt-2 text-sm text-muted-foreground">USDC, USDT or AVAX on the Avalanche C-Chain.</p>
      </div>
      <div className="mt-5 rounded-3xl border border-border bg-card p-4">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Avalanche address</p>
        <p className="mt-1 text-sm font-mono break-all">{address}</p>
        <button onClick={() => onCopy(address)} className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl bg-muted py-2.5 text-xs font-semibold">
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Address copied" : "Copy address"}
        </button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {["Core","MetaMask","Rabby"].map((w) => (
          <button key={w} className="rounded-2xl border border-border bg-card py-3 text-xs font-semibold flex flex-col items-center gap-1">
            <Sparkles className="h-3.5 w-3.5 text-primary" />{w}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-warning text-center">Only send on Avalanche C-Chain. Other networks will be lost.</p>
      <div className="mt-auto pt-6">
        <button onClick={onDone} className="w-full rounded-2xl py-4 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-elegant)]" style={{ background: "var(--gradient-portfolio)" }}>I've sent the deposit</button>
      </div>
    </div>
  );
}

function Row({ k, v, mono, bold }: { k: string; v: string; mono?: boolean; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between p-3.5">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</span>
      <span className={`text-xs ${mono ? "font-mono" : ""} ${bold ? "font-black text-sm" : "font-semibold"}`}>{v}</span>
    </div>
  );
}

function Field({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <label className="block rounded-2xl border border-border bg-card p-3.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <input placeholder={placeholder} className="mt-1 w-full bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground/40" />
    </label>
  );
}