import { create } from "zustand";
import { persist } from "zustand/middleware";

// "LOCAL" means whatever currency the logged-in user's own country uses
// (derived from their phone number — see dialCodeToCountry) — not hardcoded
// to any one country, since Autopayke operates in several.
export type DisplayCurrency = "USD" | "LOCAL";

type CurrencyState = {
  displayCurrency: DisplayCurrency;
  toggle: () => void;
};

export const useCurrencyStore = create<CurrencyState>()(
  persist(
    (set, get) => ({
      displayCurrency: "USD",
      toggle: () =>
        set({
          displayCurrency: get().displayCurrency === "USD" ? "LOCAL" : "USD",
        }),
    }),
    { name: "autopayke-currency" },
  ),
);
