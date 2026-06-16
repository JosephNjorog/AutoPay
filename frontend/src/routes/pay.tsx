import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { MobileFrame } from "@/components/MobileFrame";
import { useAuthStore } from "@/lib/auth-store";

type PaySearch = { phone?: string; amount?: string };

export const Route = createFileRoute("/pay")({
  head: () => ({ meta: [{ title: "Pay · Autopayke" }] }),
  validateSearch: (search: Record<string, unknown>): PaySearch => ({
    phone: typeof search.phone === "string" ? search.phone : undefined,
    amount: typeof search.amount === "string" ? search.amount : undefined,
  }),
  component: Pay,
});

// Landing target for scanned "pay me" QR codes / shared pay links — forwards
// straight into the send flow with the recipient (and optional fixed amount)
// pre-filled, or to signup if the scanner doesn't have an account yet.
function Pay() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { isLoggedIn } = useAuthStore();

  useEffect(() => {
    if (!search.phone) {
      navigate({ to: "/dashboard", replace: true });
      return;
    }
    if (isLoggedIn()) {
      navigate({ to: "/send", search: { to: search.phone, amount: search.amount }, replace: true });
    } else {
      navigate({ to: "/signup", replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <MobileFrame>
      <div className="flex min-h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Opening Autopayke…</p>
      </div>
    </MobileFrame>
  );
}
