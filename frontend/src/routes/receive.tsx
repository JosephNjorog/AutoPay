import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Share2, Copy, Check, Download } from "lucide-react";
import { MobileFrame } from "@/components/MobileFrame";
import { user } from "@/lib/tuma-data";

export const Route = createFileRoute("/receive")({
  head: () => ({ meta: [{ title: "Receive · TUMA" }, { name: "description", content: "Your TUMA Passport QR." }] }),
  component: Receive,
});

function Receive() {
  const [copied, setCopied] = useState(false);

  return (
    <MobileFrame>
      <div className="flex min-h-full flex-col p-5">
        <header className="flex items-center justify-between">
          <Link to="/dashboard" className="h-9 w-9 rounded-full border border-border bg-card flex items-center justify-center">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-sm font-bold">My TUMA Passport</h1>
          <button className="h-9 w-9 rounded-full border border-border bg-card flex items-center justify-center">
            <Share2 className="h-4 w-4" />
          </button>
        </header>

        <div className="mt-6 relative">
          <div className="absolute -inset-4 rounded-[2rem] opacity-30 blur-2xl" style={{ background: "var(--gradient-portfolio)" }} />
          <div className="relative rounded-[2rem] p-6 text-primary-foreground" style={{ background: "var(--gradient-portfolio)" }}>
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.3em] opacity-80">TUMA Passport</span>
              <span className="text-2xl">{user.flag}</span>
            </div>
            <div className="mt-5 rounded-2xl bg-background p-5">
              <QrPattern />
            </div>
            <div className="mt-5">
              <p className="text-[10px] uppercase tracking-wider opacity-80">Pay this number</p>
              <p className="mt-1 text-2xl font-black">{user.msisdn}</p>
              <p className="text-xs opacity-80 mt-1">{user.name} · {user.country}</p>
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          <button
            onClick={() => { navigator.clipboard?.writeText(user.msisdn); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="w-full flex items-center justify-between rounded-2xl bg-card border border-border p-4"
          >
            <div className="text-left">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Phone number</p>
              <p className="text-sm font-bold">{user.msisdn}</p>
            </div>
            <div className="h-9 w-9 rounded-full bg-primary-soft text-primary flex items-center justify-center">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </div>
          </button>

          <div className="flex items-center justify-between rounded-2xl bg-card border border-border p-4">
            <div className="text-left min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Smart wallet</p>
              <p className="text-sm font-mono truncate">{user.smartWallet.slice(0,12)}…{user.smartWallet.slice(-6)}</p>
            </div>
            <Link to="/wallet" className="text-xs text-primary font-semibold shrink-0">View</Link>
          </div>
        </div>

        <button className="mt-5 w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-elegant)]" style={{ background: "var(--gradient-portfolio)" }}>
          <Download className="h-4 w-4" /> Save QR to phone
        </button>

        <p className="mt-5 text-center text-[11px] text-muted-foreground">Anyone can scan this QR or send to your number — even if they don't use TUMA.</p>
      </div>
    </MobileFrame>
  );
}

function QrPattern() {
  const cells = Array.from({ length: 21 * 21 }, (_, i) => {
    const x = i % 21, y = Math.floor(i / 21);
    const corner = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
    if (corner) {
      const cx = x < 7 ? 3 : 17, cy = y < 7 ? 3 : 17;
      const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
      const ring = Math.max(dx, dy);
      return ring === 0 || ring === 2 || ring === 3 ? 1 : 0;
    }
    return ((x * 31 + y * 17 + x * y) % 7) < 3 ? 1 : 0;
  });
  return (
    <div className="grid gap-[2px] aspect-square" style={{ gridTemplateColumns: "repeat(21, 1fr)" }}>
      {cells.map((c, i) => (
        <div key={i} className={c ? "bg-foreground rounded-[1px]" : "bg-transparent"} />
      ))}
    </div>
  );
}