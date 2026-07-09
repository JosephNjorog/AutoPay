import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/nav-items";
import { Avatar } from "@/components/Avatar";
import { useProfileStore } from "@/stores/profileStore";
import { useSessionStore } from "@/stores/sessionStore";

export function DesktopSidebar() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const profile = useProfileStore();
  const sessionStore = useSessionStore();

  const firstName = profile.displayName?.split(" ")[0] ?? sessionStore.getFirstName();
  const avatarFallback = (firstName || sessionStore.phone || "A")[0]?.toUpperCase() ?? "A";

  return (
    <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-0 md:w-60 bg-[#0D111E] border-r border-navy-border z-40">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-6">
        <img src="/autopay_iconlogo.svg" alt="" className="h-8 w-8 rounded-xl shrink-0" />
        <span className="font-display font-extrabold text-[16px] text-white">AutoPayKe</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.route;
          const Icon = item.icon;
          const label = item.label || "Receive";

          return (
            <Link
              key={item.route}
              to={item.route}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D111E]",
                isActive ? "bg-orange/12 text-orange" : "text-white/50 hover:bg-white/5 hover:text-white/80"
              )}
            >
              <Icon size={19} strokeWidth={isActive ? 2 : 1.5} className="shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Account */}
      <div className="border-t border-navy-border p-3">
        <button
          type="button"
          onClick={() => navigate({ to: "/settings/profile" })}
          className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
        >
          <Avatar
            avatarKey={profile.avatarKey}
            avatarDataUrl={profile.avatarDataUrl}
            fallbackLetter={avatarFallback}
            size="sm"
          />
          <span className="text-[13px] font-semibold text-white/80 truncate">
            {firstName || "Account"}
          </span>
        </button>
      </div>
    </aside>
  );
}
