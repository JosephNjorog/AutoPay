import { memo } from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { cn, resolveTransactionLabel, formatUSD, formatKES } from "@/lib/utils";
import { StatusPill } from "@/components/StatusPill";
import type { Transaction } from "@/types";

export interface TransactionRowProps {
  transaction: Transaction;
  className?: string;
}

export const TransactionRow = memo(function TransactionRow({
  transaction,
  className,
}: TransactionRowProps) {
  const isReceived = transaction.direction === "in";
  const label = resolveTransactionLabel(transaction);

  const date = new Date(transaction.createdAt);
  const relativeDate = new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
    Math.round((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    "day"
  );

  return (
    <div
      className={cn(
        "flex items-center gap-3 py-3 border-b border-ink/6 last:border-0 font-manrope motion-safe:animate-fade-slide-up",
        className
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          "w-9.5 h-9.5 rounded-xl shrink-0 flex items-center justify-center",
          isReceived ? "bg-forest/12" : "bg-ink/10"
        )}
      >
        {isReceived ? (
          <ArrowDownLeft size={16} strokeWidth={1.5} className="text-forest" />
        ) : (
          <ArrowUpRight size={16} strokeWidth={1.5} className="text-ink" />
        )}
      </div>

      {/* Label + meta */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-charcoal truncate">{label}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <StatusPill status={transaction.status} />
          <span className="text-[11px] text-slate">{relativeDate}</span>
        </div>
      </div>

      {/* Amounts — KES primary, USD secondary */}
      <div className="text-right ml-auto shrink-0">
        <p className={cn("text-[14px] font-extrabold", isReceived ? "text-forest" : "text-charcoal")}>
          {isReceived ? "+" : "-"}{formatKES(transaction.amountLocal)}
        </p>
        <p className="text-[11px] text-slate mt-0.5">{formatUSD(transaction.amountUsd)}</p>
      </div>
    </div>
  );
});
