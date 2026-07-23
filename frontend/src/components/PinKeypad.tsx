import { useState, useEffect, useRef } from "react";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { PIN_LENGTH } from "@/lib/constants";

export interface PinKeypadProps {
  onComplete: (pin: string) => void;
  onClear?: () => void;
  pinLength?: number;
  theme?: "light" | "dark";
  status?: "idle" | "error" | "success";
  statusMessage?: string;
  disabled?: boolean;
}

const ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["", "0", "backspace"],
] as const;

const SUBLABELS: Record<string, string> = {
  "2": "ABC",
  "3": "DEF",
  "4": "GHI",
  "5": "JKL",
  "6": "MNO",
  "7": "PQRS",
  "8": "TUV",
  "9": "WXYZ",
};

export function PinKeypad({
  onComplete,
  onClear,
  pinLength = PIN_LENGTH,
  theme = "light",
  status = "idle",
  statusMessage,
  disabled = false,
}: PinKeypadProps) {
  const [digits, setDigits] = useState<string[]>([]);
  const [shaking, setShaking] = useState(false);
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (status === "error" && !reducedMotion) {
      setShaking(true);
      shakeTimer.current = setTimeout(() => setShaking(false), 400);
    }
    return () => clearTimeout(shakeTimer.current);
  }, [status, reducedMotion]);

  const handleDigit = (digit: string) => {
    if (disabled || digits.length >= pinLength) return;
    const newDigits = [...digits, digit];
    setDigits(newDigits);
    if (newDigits.length === pinLength) {
      onComplete(newDigits.join(""));
    }
  };

  const handleBackspace = () => {
    if (disabled) return;
    if (digits.length === 0) {
      onClear?.();
      return;
    }
    setDigits((prev) => prev.slice(0, -1));
  };

  const dotColor = () => {
    if (status === "error") return "bg-rust border-rust";
    if (status === "success") return "bg-forest border-forest";
    return "bg-amber border-amber";
  };

  const isLight = theme === "light";

  return (
    <div className="select-none">
      {/* Dot display */}
      <div
        className={cn(
          "flex gap-3 justify-center my-7",
          shaking && "animate-pin-shake"
        )}
      >
        {Array.from({ length: pinLength }).map((_, i) => {
          const filled = i < digits.length;
          return (
            <div
              key={i}
              className={cn(
                "w-4.5 h-4.5 rounded-full border-[2.5px] transition-all duration-200",
                filled
                  ? cn("scale-110", dotColor())
                  : isLight
                  ? "border-ink/20 bg-transparent"
                  : "border-paper/20 bg-transparent"
              )}
            />
          );
        })}
      </div>

      {/* Status message */}
      {statusMessage && status === "error" && (
        <p className="text-center text-[12px] text-rust mb-2">{statusMessage}</p>
      )}

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-2.5 px-2">
        {ROWS.flatMap((row) =>
          row.map((key) => {
            if (key === "") {
              return (
                <div key="empty" className="h-14 bg-transparent border-transparent shadow-none cursor-default" />
              );
            }

            if (key === "backspace") {
              return (
                <button
                  key="backspace"
                  type="button"
                  disabled={disabled}
                  onClick={handleBackspace}
                  aria-label="Delete"
                  className={cn(
                    "h-14 rounded-2xl flex items-center justify-center cursor-pointer transition-all duration-150",
                    "active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-1",
                    isLight
                      ? "bg-paper/70 backdrop-blur-sm border border-paper shadow-sm active:bg-amber/15 active:border-amber"
                      : "bg-ink border border-paper/15 active:bg-amber/15 active:border-amber"
                  )}
                >
                  <Delete
                    size={18}
                    strokeWidth={1.5}
                    className={isLight ? "text-ink" : "text-paper"}
                  />
                </button>
              );
            }

            return (
              <button
                key={key}
                type="button"
                disabled={disabled}
                onClick={() => handleDigit(key)}
                aria-label={key}
                className={cn(
                  "h-14 rounded-2xl flex flex-col items-center justify-center font-display text-xl font-bold cursor-pointer",
                  "transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-1",
                  isLight
                    ? "bg-paper/70 backdrop-blur-sm border border-paper text-ink shadow-sm active:bg-amber/15 active:border-amber"
                    : "bg-ink border border-paper/15 text-paper active:bg-amber/15 active:border-amber"
                )}
              >
                <span>{key}</span>
                {SUBLABELS[key] && (
                  <span className="text-[8px] font-medium opacity-30 tracking-widest uppercase mt-0.5">
                    {SUBLABELS[key]}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
