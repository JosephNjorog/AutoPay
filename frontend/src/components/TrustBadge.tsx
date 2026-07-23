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
          ? "bg-gradient-to-r from-forest/10 to-forest/5 border border-forest/25"
          : "bg-gradient-to-r from-amber/12 to-amber/6 border border-amber/25",
        className
      )}
    >
      <div className="flex-shrink-0 mt-0.5">{icon}</div>
      <div>
        <span className={cn("text-[13px] font-bold block mb-0.5", isGreen ? "text-forest-light" : "text-amber-deep")}>
          {title}
        </span>
        <span className={cn("text-[12px] leading-relaxed", isGreen ? "text-forest-light/70" : "text-amber-deep/70")}>
          {body}
        </span>
      </div>
    </div>
  );
}
