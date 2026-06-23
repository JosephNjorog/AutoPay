import { useCurrencyStore, type DisplayCurrency } from "@/lib/currency-store";

const OPTIONS: DisplayCurrency[] = ["USD", "KES"];

export function CurrencyToggle({ className = "" }: { className?: string }) {
  const { displayCurrency, toggle } = useCurrencyStore();

  return (
    <div className={`inline-flex rounded-full border border-current/20 p-0.5 text-[10px] font-bold ${className}`}>
      {OPTIONS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => c !== displayCurrency && toggle()}
          className={`px-2.5 py-1 rounded-full transition ${displayCurrency === c ? "bg-current/20" : "opacity-50"}`}
        >
          {c === "KES" ? "KSH" : "USD"}
        </button>
      ))}
    </div>
  );
}
