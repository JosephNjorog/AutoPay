import type { TxStatus } from "@/lib/api/client";

// Single source of truth for plain-language transaction status copy, shared
// across the tracker, history list, and anywhere else a status is shown.
export const STATUS_LABELS: Record<TxStatus, string> = {
  initiated: "On its way",
  onchain: "On its way",
  routed: "On its way",
  settled: "Delivered",
  requires_review: "We hit a snag, reviewing",
  failed: "Failed",
  expired: "Expired",
};

export function getStatusLabel(status: TxStatus): string {
  return STATUS_LABELS[status];
}
