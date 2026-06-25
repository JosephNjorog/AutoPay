import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { cn, resolveTransactionLabel, formatUSD, formatKES } from "@/lib/utils";
import { StatusPill } from "@/components/StatusPill";
import type { Transaction } from "@/types";

export interface TransactionRowProps {
  transaction: Transaction;
  className?: string;
}

export function TransactionRow({ transaction, className }: TransactionRowProps) {
  const isReceived = transaction.type === "received";
  const label = resolveTransactionLabel(transaction);

  const date = new Date(transaction.created_at);
  const relativeDate = new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
    Math.round((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    "day"
  );

  const statusMap: Record<Transaction["status"], "pending" | "completed" | "failed"> = {
    pending: "pending",
    completed: "completed",
    failed: "failed",
  };

  return (
    <div
      className={cn(
        "flex items-center gap-3 py-3 border-b border-white/[0.05] last:border-0 animate-fade-slide-up",
        className
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          "w-[38px] h-[38px] rounded-xl flex-shrink-0 flex items-center justify-center",
          isReceived
            ? "bg-success/[0.12] border border-success/20"
            : "bg-danger/[0.12] border border-danger/20"
        )}
      >
        {isReceived ? (
          <ArrowDownLeft size={16} strokeWidth={1.5} className="text-success" />
        ) : (
          <ArrowUpRight size={16} strokeWidth={1.5} className="text-danger" />
        )}
      </div>

      {/* Label + meta */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-white truncate">{label}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <StatusPill status={statusMap[transaction.status]} />
          <span className="text-[11px] text-white/30">{relativeDate}</span>
        </div>
      </div>

      {/* Amounts */}
      <div className="text-right ml-auto flex-shrink-0">
        <p className={cn("text-[14px] font-extrabold", isReceived ? "text-success" : "text-danger")}>
          {isReceived ? "+" : "-"}{formatUSD(transaction.amount_usd)}
        </p>
        <p className="text-[11px] text-white/30 mt-0.5">{formatKES(transaction.amount_kes)}</p>
      </div>
    </div>
  );
}
