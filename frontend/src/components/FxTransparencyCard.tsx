import { useEffect, useRef, useState } from "react";
import { Lock, Send as SendIcon, Sparkles, type LucideIcon } from "lucide-react";

// Shared FX/fee transparency primitives used by both the Send and Pay
// (merchant Till/PayBill) flows, so rate-lock/countdown/summary UI stays a
// single implementation instead of being duplicated per flow.

// ── Rate-lock countdown ──────────────────────────────────────────────────────

export function QuoteCountdown({ lockedUntil, onExpire }: { lockedUntil: string; onExpire: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.round((new Date(lockedUntil).getTime() - Date.now()) / 1000))
  );
  const onExpireRef = useRef(onExpire);
  useEffect(() => { onExpireRef.current = onExpire; });

  useEffect(() => {
    setSecondsLeft(Math.max(0, Math.round((new Date(lockedUntil).getTime() - Date.now()) / 1000)));
    const id = setInterval(() => {
      const remaining = Math.max(0, Math.round((new Date(lockedUntil).getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(id);
        onExpireRef.current();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  const expiring = secondsLeft <= 5;

  return (
    <span className={`normal-case flex items-center gap-1 ${expiring ? "text-warning" : "text-success"}`}>
      <Lock className="h-3 w-3" /> {secondsLeft > 0 ? `Rate locked · ${secondsLeft}s` : "Refreshing rate…"}
    </span>
  );
}

// ── Key/value row ─────────────────────────────────────────────────────────────

export function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</span>
      <span className={`text-xs font-semibold ${mono ? "font-mono" : ""}`}>{v}</span>
    </div>
  );
}

// ── Compact amount-step quote card ───────────────────────────────────────────

type QuoteLike = {
  toCurrency: string;
  toAmount: number;
  tumaRate: number;
  midRate: number;
  lockedUntil: string;
};

export function FxQuoteSummaryCard({
  quote,
  usd,
  onRefreshQuote,
  label = "Recipient gets",
}: {
  quote: QuoteLike;
  usd: number;
  onRefreshQuote: () => void;
  label?: string;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        <QuoteCountdown lockedUntil={quote.lockedUntil} onExpire={onRefreshQuote} />
      </div>
      <p className="mt-1 text-3xl font-black">
        {quote.toCurrency} {quote.toAmount.toLocaleString("en-US", { maximumFractionDigits: 2 })}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">1 USD = {quote.tumaRate.toFixed(2)} {quote.toCurrency}</p>
      <div className="mt-3 pt-3 border-t border-border text-[11px] flex justify-between">
        <span className="text-success font-semibold flex items-center gap-1">
          <Sparkles className="h-3 w-3" /> Saving vs banks
        </span>
        <span className="text-success font-semibold">
          {quote.toCurrency} {((quote.midRate - quote.tumaRate) * usd).toLocaleString("en-US", { maximumFractionDigits: 2 })}
        </span>
      </div>
    </div>
  );
}

// ── Review-step "You send → Recipient gets" hero ─────────────────────────────

export function FxReviewHero({
  usd,
  quote,
  onRefreshQuote,
  icon: Icon = SendIcon,
  fromLabel = "You send",
  toLabel = "Recipient gets",
}: {
  usd: number;
  quote: { toCurrency: string; toAmount: number; lockedUntil: string; fromToken?: string };
  onRefreshQuote: () => void;
  icon?: LucideIcon;
  fromLabel?: string;
  toLabel?: string;
}) {
  return (
    <div className="p-5 text-center" style={{ background: "var(--gradient-mesh)" }}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{fromLabel}</p>
      <p className="mt-1 text-3xl font-black">{usd.toFixed(2)} {quote.fromToken ?? "USDC"}</p>
      <div className="my-3 flex items-center justify-center text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        <Icon className="h-4 w-4 mx-3 text-primary" />
        <div className="h-px flex-1 bg-border" />
      </div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{toLabel}</p>
      <p className="mt-1 text-3xl font-black">
        {quote.toCurrency} {quote.toAmount.toLocaleString("en-US", { maximumFractionDigits: 2 })}
      </p>
      <div className="mt-2 flex justify-center text-[10px]">
        <QuoteCountdown lockedUntil={quote.lockedUntil} onExpire={onRefreshQuote} />
      </div>
    </div>
  );
}
