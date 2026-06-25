import { create } from "zustand";

type SignupState = {
  country_code: string;
  phone: string;
  email: string;
  otp_id: string | null;
  signup_token: string | null;
  pin_hash: string | null;
  passkey_registered: boolean;
  terms_accepted: boolean;

  setPhone: (country_code: string, phone: string, email: string) => void;
  setOtpId: (otp_id: string) => void;
  setSignupToken: (token: string) => void;
  setPinHash: (hash: string) => void;
  setPasskeyRegistered: () => void;
  setTermsAccepted: (accepted: boolean) => void;
  clearSignupStore: () => void;
};

const DEFAULT_STATE = {
  country_code: "KE",
  phone: "",
  email: "",
  otp_id: null,
  signup_token: null,
  pin_hash: null,
  passkey_registered: false,
  terms_accepted: false,
};

export const useSignupStore = create<SignupState>()((set) => ({
  ...DEFAULT_STATE,

  setPhone: (country_code, phone, email) => set({ country_code, phone, email }),

  setOtpId: (otp_id) => set({ otp_id }),

  setSignupToken: (signup_token) => set({ signup_token }),

  setPinHash: (pin_hash) => set({ pin_hash }),

  setPasskeyRegistered: () => set({ passkey_registered: true }),

  setTermsAccepted: (terms_accepted) => set({ terms_accepted }),

  clearSignupStore: () => set({ ...DEFAULT_STATE }),
}));
