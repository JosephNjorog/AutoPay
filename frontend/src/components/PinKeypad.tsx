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
    if (status === "error") return theme === "light" ? "bg-danger border-danger" : "bg-danger border-danger";
    if (status === "success") return theme === "light" ? "bg-success border-success" : "bg-success border-success";
    return "bg-orange border-orange";
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
                  ? "border-black/20 bg-transparent"
                  : "border-white/20 bg-transparent"
              )}
            />
          );
        })}
      </div>

      {/* Status message */}
      {statusMessage && status === "error" && (
        <p className="text-center text-[12px] text-danger mb-2">{statusMessage}</p>
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
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-1",
                    isLight
                      ? "bg-white/70 backdrop-blur-sm border border-white/90 shadow-sm active:bg-orange/15 active:border-orange"
                      : "bg-navy-surface border border-navy-border active:bg-orange/15 active:border-orange"
                  )}
                >
                  <Delete
                    size={18}
                    strokeWidth={1.5}
                    className={isLight ? "text-navy" : "text-white"}
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
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-1",
                  isLight
                    ? "bg-white/70 backdrop-blur-sm border border-white/90 text-navy shadow-sm active:bg-orange/15 active:border-orange"
                    : "bg-navy-surface border border-navy-border text-white active:bg-orange/15 active:border-orange"
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
