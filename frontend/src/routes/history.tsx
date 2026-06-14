import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ArrowDownLeft, ArrowUpRight, Filter } from "lucide-react";
import { MobileFrame } from "@/components/MobileFrame";
import { BottomNav } from "@/components/BottomNav";
import { transactions } from "@/lib/tuma-data";

export const Route = createFileRoute("/history")({
  head: () => ({ meta: [{ title: "History · TUMA" }, { name: "description", content: "All your TUMA transactions." }] }),
  component: History,
});

function History() {
  const [tab, setTab] = useState<"all" | "in" | "out">("all");
  const filtered = transactions.filter((t) => (tab === "all" ? true : t.direction === tab));

  return (
    <MobileFrame>
      <div className="flex min-h-full flex-col">
        <header className="flex items-center justify-between px-5 pt-6 pb-2">
          <Link to="/dashboard" className="h-9 w-9 rounded-full border border-border bg-card flex items-center justify-center">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-sm font-bold">Activity</h1>
          <button className="h-9 w-9 rounded-full border border-border bg-card flex items-center justify-center">
            <Filter className="h-4 w-4" />
          </button>
        </header>

        <div className="px-5 mt-4">
          <div className="inline-flex w-full p-1 rounded-2xl bg-muted">
            {(["all","in","out"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2 text-xs font-semibold rounded-xl capitalize transition ${
                  tab === t ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
                }`}
              >
                {t === "in" ? "Received" : t === "out" ? "Sent" : "All"}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 mt-5 flex-1 space-y-2">
          {filtered.map((tx) => (
            <Link key={tx.id} to="/track/$id" params={{ id: tx.id }} className="block rounded-2xl border border-border bg-card p-3.5 hover:bg-muted/40 transition">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center ${tx.direction === "in" ? "bg-success-soft text-success" : "bg-primary-soft text-primary"}`}>
                  {tx.direction === "in" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{tx.counterparty} <span className="text-base">{tx.countryFlag}</span></p>
                  <p className="text-[11px] text-muted-foreground">{tx.rail} · {tx.timestamp}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold ${tx.direction === "in" ? "text-success" : ""}`}>{tx.direction === "in" ? "+" : ""}{tx.amount} {tx.asset}</p>
                  <p className="text-[10px] text-muted-foreground">{tx.localAmount}</p>
                </div>
              </div>
              {(tx.fx || tx.status === "pending") && (
                <div className="mt-2.5 flex items-center justify-between border-t border-border pt-2.5 text-[10px]">
                  {tx.fx && <span className="text-muted-foreground">{tx.fx}</span>}
                  {tx.status === "pending" && (
                    <span className="ml-auto inline-flex items-center gap-1 text-warning bg-warning-soft px-2 py-0.5 rounded-full font-semibold">
                      <span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" /> Pending settlement
                    </span>
                  )}
                </div>
              )}
            </Link>
          ))}
        </div>

        <div className="h-24" />
        <BottomNav />
      </div>
    </MobileFrame>
  );
}