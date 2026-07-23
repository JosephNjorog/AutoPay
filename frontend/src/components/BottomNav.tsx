import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/nav-items";

export interface BottomNavProps {
  className?: string;
}

export function BottomNav({ className }: BottomNavProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      className={cn(
        "fixed bottom-0 inset-x-0 bg-paper/95 backdrop-blur-xl border-t border-ink/8 font-manrope",
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
                "w-[52px] h-[52px] rounded-[18px] bg-amber flex items-center justify-center",
                "shadow-[0_4px_20px_rgba(232,163,61,0.45)] border-2 border-paper mt-[-14px]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
              )}
            >
              <Icon size={22} strokeWidth={1.5} className="text-ink" />
            </Link>
          );
        }

        return (
          <Link
            key={item.route}
            to={item.route}
            className={cn(
              "flex flex-col items-center gap-1 flex-1 min-h-[44px] justify-center cursor-pointer",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-1 focus-visible:ring-offset-paper rounded-lg"
            )}
          >
            <Icon
              size={20}
              strokeWidth={1.5}
              className={isActive ? "text-ink" : "text-ink/35"}
            />
            {item.label && (
              <span className={cn("text-[10px] font-semibold", isActive ? "text-ink" : "text-ink/35")}>
                {item.label}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
