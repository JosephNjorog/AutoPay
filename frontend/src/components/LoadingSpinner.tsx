import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LoadingSpinnerProps {
  size?: number;
  color?: "orange" | "white" | "muted";
  fullScreen?: boolean;
  label?: string;
}

const COLOR_CLASSES: Record<NonNullable<LoadingSpinnerProps["color"]>, string> = {
  orange: "text-amber-deep",
  white: "text-paper",
  muted: "text-slate",
};

export function LoadingSpinner({ size = 20, color = "orange", fullScreen = false, label }: LoadingSpinnerProps) {
  const spinner = (
    <Loader2
      size={size}
      className={cn("animate-spin", COLOR_CLASSES[color])}
      aria-label={label ?? "Loading"}
      role="status"
    />
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-ink/80 z-50">
        {spinner}
      </div>
    );
  }

  return spinner;
}
