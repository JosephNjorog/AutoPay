import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Copy, Check, ExternalLink, ShieldCheck, Key } from "lucide-react";
import { MobileFrame } from "@/components/MobileFrame";
import { BottomNav } from "@/components/BottomNav";
import { user, assets } from "@/lib/tuma-data";

export const Route = createFileRoute("/wallet")({
  head: () => ({ meta: [{ title: "Wallet · TUMA" }, { name: "description", content: "Your non-custodial smart wallet on Avalanche." }] }),
  component: Wallet,
});

function Wallet() {
  const [copied, setCopied] = useState(false);
  const total = assets.reduce((s, a) => s + a.usd, 0);

  return (
    <MobileFrame>
      <div className="flex min-h-full flex-col">
        <header className="flex items-center justify-between px-5 pt-6 pb-2">
          <Link to="/dashboard" className="h-9 w-9 rounded-full border border-border bg-card flex items-center justify-center">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-sm font-bold">Smart wallet</h1>
          <span className="text-[10px] font-bold text-success bg-success-soft px-2 py-1 rounded-full">Avalanche</span>
        </header>

        <div className="px-5 mt-3">
          <div className="rounded-3xl border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl flex items-center justify-center text-primary-foreground font-black text-xs" style={{ background: "var(--gradient-portfolio)" }}>T</div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Bound to</p>
                <p className="text-sm font-bold">{user.msisdn}</p>
              </div>
            </div>
            <p className="mt-4 text-[10px] uppercase tracking-wider text-muted-foreground">Address</p>
            <p className="font-mono text-xs break-all mt-1">{user.smartWallet}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => { navigator.clipboard?.writeText(user.smartWallet); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className="rounded-xl border border-border bg-background py-2.5 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
              </button>
              <a href="#" className="rounded-xl border border-border bg-background py-2.5 text-xs font-semibold inline-flex items-center justify-center gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" /> Snowtrace
              </a>
            </div>
          </div>
        </div>

        <div className="px-5 mt-4">
          <div className="flex items-baseline justify-between">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">On-chain total</p>
            <p className="text-2xl font-black">${total.toFixed(2)}</p>
          </div>
        </div>

        <div className="px-5 mt-4 space-y-2 flex-1">
          {assets.map((a) => (
            <div key={a.symbol} className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
              <div className={`h-11 w-11 rounded-full ${a.color} flex items-center justify-center text-sm font-bold text-white`}>{a.symbol[0]}</div>
              <div className="flex-1">
                <p className="text-sm font-bold">{a.name}</p>
                <p className="text-[11px] text-muted-foreground">{a.symbol} · Avalanche C-Chain</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold">{a.balance.toFixed(4)}</p>
                <p className="text-[11px] text-muted-foreground">${a.usd.toFixed(2)}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 mt-4">
          <div className="rounded-2xl bg-primary-soft p-4 flex gap-3">
            <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">Self-custodial. No seed phrase.</p>
              <p className="text-[11px] text-muted-foreground mt-1">Keys are derived on-device from your phone number using passkeys. We can't see them or move your funds.</p>
              <button className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                <Key className="h-3 w-3" /> Manage security
              </button>
            </div>
          </div>
        </div>

        <div className="h-24" />
        <BottomNav />
      </div>
    </MobileFrame>
  );
}