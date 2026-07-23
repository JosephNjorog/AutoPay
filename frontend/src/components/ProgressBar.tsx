import { cn } from "@/lib/utils";

export interface ProgressBarProps {
  totalSteps?: number;
  currentStep: number;
  className?: string;
}

export function ProgressBar({ totalSteps = 4, currentStep, className }: ProgressBarProps) {
  return (
    <div className={cn("flex gap-1.5", className)}>
      {Array.from({ length: totalSteps }).map((_, i) => {
        const stepNumber = i + 1;
        const isDone = stepNumber < currentStep;
        const isActive = stepNumber === currentStep;

        return (
          <div
            key={i}
            className={cn(
              "h-1 rounded-full flex-1 transition-all duration-300",
              isDone && "bg-forest",
              isActive && "bg-amber",
              !isDone && !isActive && "bg-ink/10"
            )}
          />
        );
      })}
    </div>
  );
}
