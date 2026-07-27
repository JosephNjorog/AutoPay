import { useCurrencyStore, type DisplayCurrency } from "@/lib/currency-store";

const OPTIONS: DisplayCurrency[] = ["USD", "LOCAL"];

export function CurrencyToggle({
  className = "",
  localLabel = "Local",
}: {
  className?: string;
  /** Short label for the user's own currency, e.g. "KSH", "GHS" — the
   * component has no way to know this itself, since it doesn't know which
   * country the logged-in user is in. */
  localLabel?: string;
}) {
  const { displayCurrency, toggle } = useCurrencyStore();

  return (
    <div
      className={`inline-flex rounded-full border border-current/20 p-0.5 text-[10px] font-bold ${className}`}
    >
      {OPTIONS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => c !== displayCurrency && toggle()}
          className={`px-2.5 py-1 rounded-full transition ${displayCurrency === c ? "bg-current/20" : "opacity-50"}`}
        >
          {c === "LOCAL" ? localLabel : "USD"}
        </button>
      ))}
    </div>
  );
}
