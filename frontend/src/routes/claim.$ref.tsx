import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Gift, ShieldCheck } from "lucide-react";
import { MobileFrame } from "@/components/MobileFrame";

export const Route = createFileRoute("/claim/$ref")({
  head: ({ params }) => ({ meta: [{ title: `Claim ${params.ref} · TUMA` }, { name: "description", content: "Someone sent you money on TUMA. Claim it with your phone." }] }),
  component: Claim,
});

function Claim() {
  const { ref } = Route.useParams();
  return (
    <MobileFrame>
      <div className="flex min-h-full flex-col p-6 pb-10">
        <div className="mt-6 flex flex-col items-center text-center">
          <div className="relative h-24 w-24">
            <div className="absolute inset-0 rounded-full opacity-40 blur-2xl" style={{ background: "var(--gradient-portfolio)" }} />
            <div className="relative h-full w-full rounded-full flex items-center justify-center text-primary-foreground" style={{ background: "var(--gradient-portfolio)" }}>
              <Gift className="h-10 w-10" />
            </div>
          </div>
          <p className="mt-6 text-xs uppercase tracking-[0.3em] text-muted-foreground">You've got money waiting</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight">Kwame sent you<br />GHS 380.00</h1>
          <p className="mt-3 text-sm text-muted-foreground max-w-xs">Held in escrow on Avalanche · ref <span className="font-mono">{ref}</span></p>
        </div>

        <div className="mt-8 rounded-3xl border border-border bg-card p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold">Claim in 60 seconds</p>
              <p className="text-xs text-muted-foreground mt-1">Verify your phone number → we'll deposit straight to MTN MoMo. No app required, no fees.</p>
            </div>
          </div>
        </div>

        <div className="mt-auto pt-8 space-y-2">
          <Link to="/signup" className="w-full flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-elegant)]" style={{ background: "var(--gradient-portfolio)" }}>
            Claim my GHS 380 <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="text-center text-[11px] text-muted-foreground">Powered by TUMA · Settled via MTN MoMo</p>
        </div>
      </div>
    </MobileFrame>
  );
}