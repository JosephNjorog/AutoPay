import { useState, useRef } from "react";
import { Copy, Check, Eye, EyeOff } from "lucide-react";
import { cn, formatUSD, formatKES, truncateAddress } from "@/lib/utils";

export interface BalanceCardProps {
  totalUsd: string;
  totalKes: string;
  walletAddress: string;
  isLoading?: boolean;
  className?: string;
  hidden?: boolean;
  onToggleHidden?: () => void;
}

export function BalanceCard({
  totalUsd,
  totalKes,
  walletAddress,
  isLoading = false,
  className,
  hidden = false,
  onToggleHidden,
}: BalanceCardProps) {
  const [currency, setCurrency] = useState<"USD" | "KES">("USD");
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleCopy = () => {
    void navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1500);
  };

  const primaryAmount = currency === "USD" ? formatUSD(totalUsd) : formatKES(totalKes);
  const secondaryAmount = currency === "USD" ? formatKES(totalKes) : formatUSD(totalUsd);

  return (
    <div className={cn("relative overflow-hidden rounded-3xl bg-ink p-6 font-manrope", className)}>
      {/* Dot-grid overlay, matching the Autopayke.dc.html home balance card */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(247,245,240,.14) 1.6px, transparent 1.6px)",
          backgroundSize: "18px 18px",
        }}
      />

      {/* Top row */}
      <div className="relative z-10 mb-2 flex items-center gap-2">
        <span className="text-[13px] font-semibold text-paper/70">Total balance</span>
        {onToggleHidden && (
          <button
            type="button"
            onClick={onToggleHidden}
            aria-label={hidden ? "Show balance" : "Hide balance"}
            className="flex h-6 w-6 items-center justify-center rounded-full text-paper/60 transition-colors hover:text-paper/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-paper/50"
          >
            {hidden ? <EyeOff size={14} strokeWidth={2} /> : <Eye size={14} strokeWidth={2} />}
          </button>
        )}
        <div className="flex-1" />
        <div className="flex gap-1 rounded-full bg-paper/15 p-0.5">
          {(["USD", "KES"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCurrency(c)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-paper/50",
                currency === c ? "bg-paper text-ink" : "text-paper/60"
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Primary amount */}
      <div className="relative z-10 mt-1.5">
        {isLoading ? (
          <div className="h-10 w-32 rounded-xl bg-paper/20 animate-pulse" />
        ) : (
          <span className="font-display text-[38px] font-black leading-none text-paper">
            {hidden ? "••••••" : primaryAmount}
          </span>
        )}
      </div>

      {/* Secondary amount */}
      <div className="relative z-10 mt-1 min-h-5">
        {!isLoading && (
          <span className="text-[13px] text-paper/60">{hidden ? "••••" : secondaryAmount}</span>
        )}
      </div>

      {/* Wallet address */}
      <button
        type="button"
        onClick={handleCopy}
        className={cn(
          "group relative z-10 mt-3 flex items-center gap-1.5",
          "rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-paper/40"
        )}
        aria-label="Copy wallet address"
      >
        <span className="font-mono text-[11px] text-paper/50">
          {truncateAddress(walletAddress)}
        </span>
        {copied ? (
          <Check size={12} className="text-paper/60 opacity-60" />
        ) : (
          <Copy size={12} className="text-paper/60 opacity-60 transition-opacity group-hover:opacity-100" />
        )}
      </button>
    </div>
  );
}
