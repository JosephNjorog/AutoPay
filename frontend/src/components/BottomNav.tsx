import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Send, QrCode, Clock, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BottomNavProps {
  className?: string;
}

const NAV_ITEMS = [
  { label: "Home", icon: Home, route: "/dashboard", isCenter: false },
  { label: "Send", icon: Send, route: "/send", isCenter: false },
  { label: "", icon: QrCode, route: "/receive", isCenter: true },
  { label: "History", icon: Clock, route: "/history", isCenter: false },
  { label: "Wallet", icon: Wallet, route: "/wallet", isCenter: false },
] as const;

export function BottomNav({ className }: BottomNavProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      className={cn(
        "fixed bottom-0 inset-x-0 bg-[#0D111E]/95 backdrop-blur-xl border-t border-navy-border",
        "flex items-center justify-around py-2.5 max-w-[390px] mx-auto z-50",
        className
      )}
      style={{ paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom, 10px))" }}
    >
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.route;
        const Icon = item.icon;

        if (item.isCenter) {
          return (
            <Link
              key={item.route}
              to={item.route}
              aria-label="Scan QR code"
              className={cn(
                "w-[52px] h-[52px] rounded-[18px] bg-orange-gradient flex items-center justify-center",
                "shadow-[0_4px_20px_rgba(249,115,22,0.5)] border-2 border-white/10 mt-[-14px]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D111E]"
              )}
            >
              <Icon size={22} strokeWidth={1.5} className="text-white" />
            </Link>
          );
        }

        return (
          <Link
            key={item.route}
            to={item.route}
            className={cn(
              "flex flex-col items-center gap-1 flex-1 min-h-[44px] justify-center cursor-pointer",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-1 focus-visible:ring-offset-[#0D111E] rounded-lg"
            )}
          >
            <Icon
              size={20}
              strokeWidth={1.5}
              className={isActive ? "text-orange" : "text-white/30"}
            />
            {item.label && (
              <span className={cn("text-[10px] font-semibold", isActive ? "text-orange" : "text-white/30")}>
                {item.label}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
