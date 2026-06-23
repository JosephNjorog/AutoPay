import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DisplayCurrency = "USD" | "KES";

type CurrencyState = {
  displayCurrency: DisplayCurrency;
  toggle: () => void;
};

export const useCurrencyStore = create<CurrencyState>()(
  persist(
    (set, get) => ({
      displayCurrency: "USD",
      toggle: () =>
        set({ displayCurrency: get().displayCurrency === "USD" ? "KES" : "USD" }),
    }),
    { name: "autopayke-currency" }
  )
);
