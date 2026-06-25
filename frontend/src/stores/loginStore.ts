import { create } from "zustand";

type LoginState = {
  phone: string;
  otp_id: string | null;
  setPhone: (phone: string) => void;
  setOtpId: (otp_id: string) => void;
  clearLoginStore: () => void;
};

const DEFAULT_STATE = { phone: "", otp_id: null };

export const useLoginStore = create<LoginState>()((set) => ({
  ...DEFAULT_STATE,
  setPhone: (phone) => set({ phone }),
  setOtpId: (otp_id) => set({ otp_id }),
  clearLoginStore: () => set({ ...DEFAULT_STATE }),
}));
