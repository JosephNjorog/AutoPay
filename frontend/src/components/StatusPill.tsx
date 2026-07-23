import { cn } from "@/lib/utils";

export interface StatusPillProps {
  status: "pending" | "completed" | "failed";
  label?: string;
  className?: string;
}

const DEFAULT_LABELS: Record<StatusPillProps["status"], string> = {
  pending: "Pending",
  completed: "Received",
  failed: "Failed",
};

const STATUS_CLASSES: Record<StatusPillProps["status"], string> = {
  pending: "bg-amber/16 text-amber-deep",
  completed: "bg-forest/12 text-forest-light",
  failed: "bg-rust/12 text-rust",
};

export function StatusPill({ status, label, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold",
        STATUS_CLASSES[status],
        className
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label ?? DEFAULT_LABELS[status]}
    </span>
  );
}
