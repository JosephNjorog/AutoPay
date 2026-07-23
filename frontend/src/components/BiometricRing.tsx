import { ScanFace, Fingerprint } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useReducedMotion";

export interface BiometricRingProps {
  type: "face" | "fingerprint";
  size?: "sm" | "md" | "lg";
  onPress?: () => void;
  animating?: boolean;
  className?: string;
}

const SIZE_CLASSES = {
  sm: "w-20 h-20",
  md: "w-[100px] h-[100px]",
  lg: "w-[120px] h-[120px]",
};

const ICON_SIZES = {
  sm: 32,
  md: 44,
  lg: 56,
};

export function BiometricRing({ type, size = "md", onPress, animating = true, className }: BiometricRingProps) {
  const reducedMotion = useReducedMotion();
  const Icon = type === "face" ? ScanFace : Fingerprint;

  return (
    <div
      role={onPress ? "button" : undefined}
      tabIndex={onPress ? 0 : undefined}
      onClick={onPress}
      onKeyDown={onPress ? (e) => { if (e.key === "Enter" || e.key === " ") onPress(); } : undefined}
      className={cn(
        SIZE_CLASSES[size],
        "rounded-full bg-amber/12 border-2 border-amber/40 flex items-center justify-center mx-auto",
        animating && !reducedMotion && "animate-bio-pulse",
        onPress && "cursor-pointer active:scale-95 transition-transform duration-150",
        onPress && "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2",
        className
      )}
    >
      <Icon size={ICON_SIZES[size]} strokeWidth={1.5} className="text-amber-deep" />
    </div>
  );
}
