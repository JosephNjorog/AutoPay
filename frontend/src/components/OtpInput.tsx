import { useState, useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface OtpInputProps {
  length?: number;
  onComplete: (code: string) => void;
  onChange?: (code: string) => void;
  error?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}

export interface OtpInputRef {
  reset: () => void;
}

export const OtpInput = forwardRef<OtpInputRef, OtpInputProps>(
  ({ length = 6, onComplete, onChange, error = false, disabled = false, autoFocus = true }, ref) => {
    const [values, setValues] = useState<string[]>(Array(length).fill(""));
    const [focusedIndex, setFocusedIndex] = useState<number>(-1);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    useImperativeHandle(ref, () => ({
      reset: () => {
        setValues(Array(length).fill(""));
        setFocusedIndex(0);
        inputRefs.current[0]?.focus();
      },
    }));

    useEffect(() => {
      if (autoFocus) {
        inputRefs.current[0]?.focus();
      }
    }, [autoFocus]);

    const emitChange = (newValues: string[]) => {
      const joined = newValues.join("");
      onChange?.(joined);
      if (newValues.every((v) => v !== "")) {
        onComplete(joined);
      }
    };

    const handleInput = (index: number, value: string) => {
      const digit = value.replace(/\D/g, "").slice(-1);
      if (!digit) return;

      const newValues = [...values];
      newValues[index] = digit;
      setValues(newValues);
      emitChange(newValues);

      if (index < length - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    };

    const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace") {
        if (values[index] !== "") {
          const newValues = [...values];
          newValues[index] = "";
          setValues(newValues);
          onChange?.(newValues.join(""));
        } else if (index > 0) {
          const newValues = [...values];
          newValues[index - 1] = "";
          setValues(newValues);
          onChange?.(newValues.join(""));
          inputRefs.current[index - 1]?.focus();
        }
        e.preventDefault();
      }
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
      if (!text) return;

      const newValues = Array(length).fill("");
      for (let i = 0; i < text.length; i++) {
        newValues[i] = text[i] ?? "";
      }
      setValues(newValues);
      emitChange(newValues);

      const nextFocus = Math.min(text.length, length - 1);
      inputRefs.current[nextFocus]?.focus();
    };

    return (
      <div className="flex gap-2 justify-center">
        {Array.from({ length }).map((_, i) => {
          const isFilled = values[i] !== "";
          const isActive = focusedIndex === i;

          return (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              value={values[i]}
              disabled={disabled}
              onFocus={() => setFocusedIndex(i)}
              onBlur={() => setFocusedIndex(-1)}
              onInput={(e) => handleInput(i, (e.target as HTMLInputElement).value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={handlePaste}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              aria-label={`OTP digit ${i + 1}`}
              className={cn(
                "w-11 h-[52px] rounded-2xl border-2 text-[22px] font-bold text-navy text-center outline-none transition-all duration-150",
                "focus-visible:outline-none",
                !isFilled && !isActive && !error && "border-black/12 bg-white/80",
                isFilled && !error && "border-orange bg-white",
                isActive && !error && "border-orange shadow-[0_0_0_3px_rgba(249,115,22,0.2)] bg-white",
                error && "border-danger bg-red-50",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            />
          );
        })}
      </div>
    );
  }
);

OtpInput.displayName = "OtpInput";
