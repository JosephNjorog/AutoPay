import { Home, Send, Store, QrCode, Clock, Wallet } from "lucide-react";

export const NAV_ITEMS = [
  { label: "Home", icon: Home, route: "/dashboard", isCenter: false },
  { label: "Send", icon: Send, route: "/send", isCenter: false },
  { label: "Pay", icon: Store, route: "/pay-merchant", isCenter: false },
  { label: "", icon: QrCode, route: "/receive", isCenter: true },
  { label: "History", icon: Clock, route: "/history", isCenter: false },
  { label: "Wallet", icon: Wallet, route: "/wallet", isCenter: false },
] as const;
