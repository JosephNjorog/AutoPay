import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, Copy, Send, QrCode, Plus, Store, ArrowUpRight, ArrowDownLeft, TrendingUp, Bell, Check } from "lucide-react";
import { MobileFrame } from "@/components/MobileFrame";
import { BottomNav } from "@/components/BottomNav";
import { user, assets, transactions } from "@/lib/tuma-data";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Home · TUMA" }, { name: "description", content: "Your TUMA wallet — balance, assets, send & receive." }] }),
  component: Dashboard,
});

function Dashboard() {
  const [hide, setHide] = useState(false);
  const [copied, setCopied] = useState(false);
  const short = `${user.smartWallet.slice(0, 6)}…${user.smartWallet.slice(-4)}`;

  return (
    <MobileFrame>
      <div className="flex min-h-full flex-col">
        {/* Header */}
        <header className="flex items-center justify-between px-5 pt-6 pb-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl text-primary-foreground font-black" style={{ background: "var(--gradient-portfolio)" }}>T</div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none">Hello</p>
              <p className="text-sm font-bold leading-tight">{user.name.split(" ")[0]} {user.flag}</p>
            </div>
          </div>
          <button className="relative h-9 w-9 rounded-full border border-border bg-card flex items-center justify-center">
            <Bell className="h-4 w-4" />
            <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
          </button>
        </header>

        {/* Portfolio card */}
        <div className="px-5 mt-3">
          <div className="relative overflow-hidden rounded-3xl p-5 text-primary-foreground shadow-[var(--shadow-elegant)]" style={{ background: "var(--gradient-portfolio)" }}>
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
            <div className="absolute -left-5 -bottom-10 h-32 w-32 rounded-full bg-black/10 blur-2xl" />
            <div className="relative flex items-center justify-between">
              <p className="text-xs opacity-80 uppercase tracking-wider">Total balance</p>
              <button onClick={() => setHide((h) => !h)} className="h-8 w-8 rounded-full bg-white/15 backdrop-blur flex items-center justify-center">
                {hide ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="relative mt-2 text-4xl font-black tracking-tight">
              {hide ? "GHS ••••••" : `GHS ${user.totalLocal.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
            </p>
            <p className="relative text-sm opacity-90 mt-1">
              ≈ {hide ? "$•••" : `$${user.totalUsd.toFixed(2)}`}
            </p>
            <div className="relative mt-4 flex items-center justify-between gap-3">
              <button
                onClick={() => { navigator.clipboard?.writeText(user.smartWallet); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur px-3 py-1.5 text-xs font-medium"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied" : short}
              </button>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 backdrop-blur px-3 py-1.5 text-xs font-semibold">
                <TrendingUp className="h-3 w-3" />
                +{user.change24h}% today
              </span>
            </div>
          </div>
        </div>

        {/* Assets strip */}
        <div className="mt-5 px-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold">Assets</h2>
            <Link to="/wallet" className="text-xs text-primary font-semibold">View all</Link>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {assets.map((a) => (
              <div key={a.symbol} className="rounded-2xl border border-border bg-card p-3">
                <div className={`h-7 w-7 rounded-full ${a.color} flex items-center justify-center text-[10px] font-bold text-white`}>{a.symbol[0]}</div>
                <p className="mt-2 text-[10px] text-muted-foreground">{a.symbol}</p>
                <p className="text-sm font-bold leading-tight">{a.balance.toFixed(2)}</p>
                <p className="text-[10px] text-muted-foreground">${a.usd.toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div className="mt-6 px-5">
          <div className="grid grid-cols-4 gap-3">
            <Action to="/fund" icon={Plus} label="Add money" primary />
            <Action to="/send" icon={Send} label="Send" />
            <Action to="/receive" icon={QrCode} label="Receive" />
            <Action to="/merchant" icon={Store} label="Merchant" />
          </div>
        </div>

        {/* Activity */}
        <div className="mt-7 px-5 flex-1">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold">Recent activity</h2>
            <Link to="/history" className="text-xs text-primary font-semibold">See all</Link>
          </div>
          <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
            {transactions.slice(0, 4).map((tx) => (
              <Link key={tx.id} to="/track/$id" params={{ id: tx.id }} className="flex items-center gap-3 p-3.5 hover:bg-muted transition">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center ${tx.direction === "in" ? "bg-success-soft text-success" : "bg-primary-soft text-primary"}`}>
                  {tx.direction === "in" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{tx.counterparty} <span className="text-base">{tx.countryFlag}</span></p>
                  <p className="text-[11px] text-muted-foreground">{tx.rail} · {tx.timestamp}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold ${tx.direction === "in" ? "text-success" : ""}`}>{tx.direction === "in" ? "+" : ""}{tx.amount} {tx.asset}</p>
                  {tx.status === "pending" && <p className="text-[10px] text-warning font-semibold">Pending</p>}
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="h-24" />
        <BottomNav />
      </div>
    </MobileFrame>
  );
}

function Action({ to, icon: Icon, label, primary }: { to: string; icon: typeof Send; label: string; primary?: boolean }) {
  return (
    <Link to={to} className="flex flex-col items-center gap-1.5 group">
      <div
        className={`h-14 w-14 rounded-2xl flex items-center justify-center transition group-active:scale-95 ${
          primary ? "text-primary-foreground shadow-[var(--shadow-elegant)]" : "bg-card border border-border text-foreground"
        }`}
        style={primary ? { background: "var(--gradient-portfolio)" } : undefined}
      >
        <Icon className="h-5 w-5" />
      </div>
      <span className="text-[11px] font-semibold">{label}</span>
    </Link>
  );
}
