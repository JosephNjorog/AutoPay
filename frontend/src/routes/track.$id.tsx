import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Check, Loader2, Share2 } from "lucide-react";
import { MobileFrame } from "@/components/MobileFrame";
import { transactions } from "@/lib/tuma-data";

export const Route = createFileRoute("/track/$id")({
  head: ({ params }) => ({ meta: [{ title: `Track ${params.id} · TUMA` }, { name: "description", content: "Live cross-border settlement tracker." }] }),
  loader: ({ params }) => {
    const tx = transactions.find((t) => t.id === params.id);
    if (!tx) throw notFound();
    return tx;
  },
  component: Track,
  notFoundComponent: () => (
    <MobileFrame>
      <div className="p-10 text-center">
        <p className="text-sm font-bold">Transaction not found</p>
        <Link to="/history" className="mt-4 inline-block text-sm text-primary font-semibold">Back to history</Link>
      </div>
    </MobileFrame>
  ),
  errorComponent: () => (
    <MobileFrame>
      <div className="p-10 text-center">
        <p className="text-sm font-bold">Couldn't load transaction</p>
        <Link to="/history" className="mt-4 inline-block text-sm text-primary font-semibold">Back to history</Link>
      </div>
    </MobileFrame>
  ),
});

function Track() {
  const tx = Route.useLoaderData();
  const isPending = tx.status === "pending";
  const steps = [
    { title: "Initiated", desc: "You signed and broadcast the transfer", done: true },
    { title: "On-chain confirmed", desc: "Avalanche finality reached in 1.2s", done: true },
    { title: "Routed to rail", desc: `TUMA selected ${tx.rail}`, done: true },
    { title: "Settled", desc: isPending ? "Crediting recipient's account…" : `${tx.rail} confirmed credit`, done: !isPending, active: isPending },
  ];

  return (
    <MobileFrame>
      <div className="flex min-h-full flex-col">
        <header className="flex items-center justify-between px-5 pt-6 pb-2">
          <Link to="/history" className="h-9 w-9 rounded-full border border-border bg-card flex items-center justify-center">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-sm font-bold">Transfer tracker</h1>
          <button className="h-9 w-9 rounded-full border border-border bg-card flex items-center justify-center">
            <Share2 className="h-4 w-4" />
          </button>
        </header>

        <div className="px-5 mt-3">
          <div className="rounded-3xl p-5 text-primary-foreground shadow-[var(--shadow-elegant)]" style={{ background: "var(--gradient-portfolio)" }}>
            <p className="text-xs opacity-80 uppercase tracking-wider">{tx.direction === "out" ? "Sent to" : "Received from"}</p>
            <p className="mt-1 text-2xl font-black">{tx.counterparty} <span>{tx.countryFlag}</span></p>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <p className="text-4xl font-black">{tx.amount.replace("-","")} {tx.asset}</p>
                <p className="text-xs opacity-80 mt-0.5">{tx.localAmount}</p>
              </div>
              <div className="text-right text-xs opacity-90">
                <p>via {tx.rail}</p>
                {tx.fx && <p className="opacity-70">{tx.fx}</p>}
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 mt-6">
          <h2 className="text-sm font-bold mb-3">Settlement timeline</h2>
          <div className="relative pl-9">
            <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />
            {steps.map((s, i) => (
              <div key={i} className="relative pb-5 last:pb-0">
                <div className={`absolute -left-9 top-0 h-7 w-7 rounded-full flex items-center justify-center ${
                  s.done ? "bg-success text-success-foreground" : s.active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  {s.done ? <Check className="h-3.5 w-3.5" /> : s.active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                </div>
                <p className="text-sm font-semibold">{s.title}</p>
                <p className="text-[11px] text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="px-5 mt-6">
          <div className="rounded-2xl border border-border bg-card divide-y divide-border">
            <Row k="Status" v={isPending ? "Pending" : "Settled"} />
            <Row k="Asset" v={tx.asset} />
            <Row k="Rail" v={tx.rail} />
            <Row k="FX locked" v={tx.fx ?? "—"} />
            <Row k="Reference" v={`TUMA-${tx.id.toUpperCase()}`} mono />
          </div>
        </div>

        <div className="px-5 mt-5">
          <button className="w-full rounded-2xl py-3.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-elegant)]" style={{ background: "var(--gradient-portfolio)" }}>
            Share receipt
          </button>
          <Link to="/dashboard" className="mt-2 block text-center text-xs text-muted-foreground py-2">Back to home</Link>
        </div>
        <div className="h-8" />
      </div>
    </MobileFrame>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between p-3.5">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</span>
      <span className={`text-xs font-semibold ${mono ? "font-mono" : ""}`}>{v}</span>
    </div>
  );
}