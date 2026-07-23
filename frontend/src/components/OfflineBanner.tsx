import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/lib/use-online-status";

// Global, non-intrusive — a send that's actually in flight never claims
// success while offline (the send flow's own request/error handling
// already covers that); this just tells the user their connection dropped
// so an unrelated failure doesn't look unexplained.
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-amber/16 px-4 py-2 text-xs font-semibold text-amber-deep">
      <WifiOff className="h-3.5 w-3.5" />
      You're offline — some actions may not go through until you reconnect.
    </div>
  );
}
