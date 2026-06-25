import { cn } from "@/lib/utils";

export interface TrustBadgeProps {
  title: string;
  body: string;
  icon: React.ReactNode;
  variant?: "green" | "orange";
  className?: string;
}

export function TrustBadge({ title, body, icon, variant = "green", className }: TrustBadgeProps) {
  const isGreen = variant === "green";

  return (
    <div
      className={cn(
        "rounded-2xl p-3.5 flex items-start gap-3",
        isGreen
          ? "bg-gradient-to-r from-success/10 to-success/5 border border-success/25"
          : "bg-gradient-to-r from-orange/10 to-orange/5 border border-orange/15",
        className
      )}
    >
      <div className="flex-shrink-0 mt-0.5">{icon}</div>
      <div>
        <span className={cn("text-[13px] font-bold block mb-0.5", isGreen ? "text-success" : "text-orange")}>
          {title}
        </span>
        <span className={cn("text-[12px] leading-relaxed", isGreen ? "text-success/70" : "text-orange/70")}>
          {body}
        </span>
      </div>
    </div>
  );
}
