import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserSession } from "@/types";

type SessionState = {
  access_token: string | null;
  refresh_token: string | null;
  user_id: string | null;
  phone: string | null;
  display_name: string | null;
  wallet_address: string | null;
  kes_rate: number;

  setSession: (session: UserSession) => void;
  setWalletAddress: (address: string) => void;
  setKesRate: (rate: number) => void;
  clearSession: () => void;
  isAuthenticated: () => boolean;
  getFirstName: () => string;
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      access_token: null,
      refresh_token: null,
      user_id: null,
      phone: null,
      display_name: null,
      wallet_address: null,
      kes_rate: 130,

      setSession: (session) =>
        set({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          user_id: session.user_id,
          phone: session.phone,
          display_name: session.display_name,
          wallet_address: session.wallet_address,
        }),

      setWalletAddress: (wallet_address) => set({ wallet_address }),

      setKesRate: (kes_rate) => set({ kes_rate }),

      clearSession: () =>
        set({
          access_token: null,
          refresh_token: null,
          user_id: null,
          phone: null,
          display_name: null,
          wallet_address: null,
        }),

      isAuthenticated: () => get().access_token !== null,

      getFirstName: () => {
        const name = get().display_name;
        if (!name) return "";
        return name.split(" ")[0] ?? "";
      },
    }),
    {
      name: "autopayke_session",
      storage: {
        getItem: (key) => {
          const value = localStorage.getItem(key);
          return value ? JSON.parse(value) : null;
        },
        setItem: (key, value) => localStorage.setItem(key, JSON.stringify(value)),
        removeItem: (key) => localStorage.removeItem(key),
      },
      partialize: (s) =>
        ({
          access_token: s.access_token,
          refresh_token: s.refresh_token,
          user_id: s.user_id,
          phone: s.phone,
          display_name: s.display_name,
          wallet_address: s.wallet_address,
          kes_rate: s.kes_rate,
        }) as SessionState,
    }
  )
);
