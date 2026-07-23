import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  Plus,
  ArrowUpRight,
  ArrowDownToLine,
  Store,
  QrCode,
  Activity,
  AlertCircle,
  ShieldAlert,
} from "lucide-react";
import { dialCodeToCountry } from "@tuma/shared";

// Countries Minisend has confirmed coverage for — keep in sync with the
// backend's getProviderForCountry() gate in services/settlement-providers.
const WITHDRAW_COUNTRIES = ["KE", "NG", "GH", "UG"];
import { BalanceCard } from "@/components/BalanceCard";
import { TransactionRow } from "@/components/TransactionRow";
import { BottomNav } from "@/components/BottomNav";
import { DesktopSidebar } from "@/components/DesktopSidebar";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { apiClient } from "@/lib/api";
import { useSessionStore } from "@/stores/sessionStore";
import { useProfileStore } from "@/stores/profileStore";
import { useWalletStore } from "@/stores/walletStore";
import { Avatar } from "@/components/Avatar";
import { getGreeting, usdcToKes, formatUSD } from "@/lib/utils";
import { getAssetMeta } from "@/lib/asset-meta";
import { BALANCE_STALE_TIME_MS, TRANSACTIONS_STALE_TIME_MS } from "@/lib/constants";
import { useTransactionSocket } from "@/hooks/useTransactionSocket";
import type { WalletBalance, Transaction, AssetBalance } from "@/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: () => {
    const s = useSessionStore.getState();
    if (!s.isAuthenticated() || !s.is_unlocked) {
      sessionStorage.setItem("autopayke_redirect_to", "/dashboard");
      throw redirect({ to: "/login", replace: true });
    }
  },
  head: () => ({ meta: [{ title: "Home · AutoPayKe" }] }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const sessionStore = useSessionStore();
  const profile = useProfileStore();
  const { setBalance, clearBalance } = useWalletStore();
  const touchStartY = useRef(0);

  useTransactionSocket();

  const walletQuery = useQuery({
    queryKey: ["wallet", "balance"],
    queryFn: () => apiClient.get<WalletBalance>("/api/wallet"),
    staleTime: BALANCE_STALE_TIME_MS,
    refetchInterval: 30000,
    retry: 1,
  });

  // If the user has linked an external wallet (MetaMask, Core, etc. via the
  // /wallet page), fold its on-chain balance into the dashboard totals too —
  // same generic address-balance endpoint the wallet page itself uses.
  const externalAddress = walletQuery.data?.externalWalletAddress ?? null;
  const externalWalletQuery = useQuery({
    queryKey: ["wallet", "external-balance", externalAddress],
    queryFn: () =>
      apiClient.get<{ address: string; totalUsd: number; assets: AssetBalance[] }>(
        `/api/wallet/balances/${externalAddress}`
      ),
    enabled: !!externalAddress,
    staleTime: BALANCE_STALE_TIME_MS,
    refetchInterval: 30000,
    retry: 1,
  });

  const combinedAssets = useMemo<AssetBalance[]>(() => {
    const custodial = walletQuery.data?.assets ?? [];
    const external = externalWalletQuery.data?.assets ?? [];
    const bySymbol = new Map<string, AssetBalance>();
    for (const a of [...custodial, ...external]) {
      const existing = bySymbol.get(a.symbol);
      bySymbol.set(a.symbol, existing
        ? {
            symbol: a.symbol,
            balance: (parseFloat(existing.balance) + parseFloat(a.balance)).toString(),
            balanceUsd: existing.balanceUsd + a.balanceUsd,
          }
        : { ...a });
    }
    return Array.from(bySymbol.values());
  }, [walletQuery.data?.assets, externalWalletQuery.data?.assets]);

  const combinedTotalUsd =
    (walletQuery.data?.totalUsd ?? 0) + (externalWalletQuery.data?.totalUsd ?? 0);

  const transactionsQuery = useQuery({
    queryKey: ["transactions", "recent"],
    queryFn: () =>
      apiClient.get<{ transactions: Transaction[] }>("/api/history?limit=5"),
    staleTime: TRANSACTIONS_STALE_TIME_MS,
    retry: 1,
  });

  useEffect(() => {
    if (walletQuery.data) {
      setBalance(walletQuery.data);
    }
  }, [walletQuery.data, setBalance]);

  const kesRate = sessionStore.kes_rate || 130;
  const totalUsd = combinedTotalUsd.toFixed(2);
  const totalKes = useMemo(() => usdcToKes(totalUsd, kesRate), [totalUsd, kesRate]);

  const isRefetching =
    walletQuery.isRefetching || externalWalletQuery.isRefetching || transactionsQuery.isRefetching;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0]?.clientY ?? 0;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const deltaY = (e.changedTouches[0]?.clientY ?? 0) - touchStartY.current;
    if (deltaY > 70 && window.scrollY === 0) {
      void walletQuery.refetch();
      void externalWalletQuery.refetch();
      void transactionsQuery.refetch();
    }
  };

  const greeting = getGreeting();
  const firstName = profile.displayName?.split(" ")[0] ?? sessionStore.getFirstName();
  const avatarFallback = (firstName || sessionStore.phone || "A")[0]?.toUpperCase() ?? "A";
  const walletAddress = sessionStore.wallet_address ?? "";

  return (
    <div
      className="min-h-screen bg-linen relative overflow-hidden md:pl-60 font-manrope"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <DesktopSidebar />

      {/* Pull-to-refresh indicator */}
      {isRefetching && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20">
          <LoadingSpinner size={16} color="muted" />
        </div>
      )}

      <div className="relative z-10 pb-28 md:pb-12 max-w-97.5 md:max-w-6xl mx-auto md:px-10 md:pt-8">

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-5 pb-5 md:px-0">
          <button
            type="button"
            onClick={() => navigate({ to: "/settings/profile" })}
            className="flex items-center gap-2.5 focus-visible:outline-none"
          >
            <Avatar
              avatarKey={profile.avatarKey}
              avatarDataUrl={profile.avatarDataUrl}
              fallbackLetter={avatarFallback}
              size="md"
            />
            <div className="text-left">
              <p className="text-[11px] text-slate font-medium">{greeting}</p>
              {firstName && (
                <p className="font-display text-[16px] font-extrabold text-ink leading-tight">
                  {firstName}
                </p>
              )}
            </div>
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {}}
              aria-label="Notifications"
              className="w-9 h-9 rounded-xl bg-paper border border-ink/10 flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber"
            >
              <Bell size={18} strokeWidth={1.5} className="text-ink/60" />
            </button>
          </div>
        </div>

        <div className="md:grid md:grid-cols-3 md:gap-6 md:items-start">

          {/* Balance Card */}
          <div className="px-4 mb-5 md:col-span-2 md:order-1 md:px-0 md:mb-0">
            <BalanceCard
              totalUsd={totalUsd}
              totalKes={totalKes}
              walletAddress={walletAddress}
              isLoading={walletQuery.isLoading}
              hidden={profile.balanceHidden}
              onToggleHidden={profile.toggleBalanceHidden}
            />
            {externalAddress && (
              <p className="text-[11px] text-slate mt-2 px-1">
                Includes your connected external wallet
                {externalWalletQuery.isLoading && " (loading…)"}
              </p>
            )}
          </div>

          {/* PIN setup prompt for users who haven't set one yet */}
          {!sessionStore.pin_hash && (
            <div className="px-4 mb-4 md:col-span-2 md:order-2 md:px-0 md:mb-0">
              <button
                type="button"
                onClick={() => navigate({ to: "/settings/pin" })}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber/14 border border-amber/50 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
              >
                <ShieldAlert size={20} strokeWidth={1.5} className="text-ink shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-ink">Set up your lock PIN</p>
                  <p className="text-[11px] text-charcoal/70 leading-tight mt-0.5">
                    Protect your account when you leave the app
                  </p>
                </div>
                <ArrowUpRight size={16} strokeWidth={2} className="text-ink/60 shrink-0" />
              </button>
            </div>
          )}

          {/* Assets — combined custodial + external wallet holdings */}
          <AssetsSection
            data={
              walletQuery.data
                ? { ...walletQuery.data, assets: combinedAssets, totalUsd: combinedTotalUsd }
                : undefined
            }
            isLoading={walletQuery.isLoading}
            hidden={profile.balanceHidden}
            onViewAll={() => navigate({ to: "/wallet" })}
          />

          {/* Quick Actions */}
          <QuickActions
            onAddMoney={() => navigate({ to: "/fund" })}
            onSend={() => navigate({ to: "/send" })}
            onPay={() => navigate({ to: "/pay-merchant" })}
            onReceive={() => navigate({ to: "/receive" })}
            onWithdraw={() => navigate({ to: "/withdraw" })}
            showWithdraw={
              (walletQuery.data?.assets.find((a) => a.symbol === "USDC")?.balanceUsd ?? 0) > 0 &&
              !!sessionStore.phone &&
              WITHDRAW_COUNTRIES.includes(dialCodeToCountry(sessionStore.phone)?.code ?? "")
            }
          />

          {/* Recent Activity */}
          <RecentActivity
            query={transactionsQuery}
            onViewAll={() => navigate({ to: "/history" })}
            onAddMoney={() => navigate({ to: "/fund" })}
          />
        </div>
      </div>

      <BottomNav className="md:hidden" />
    </div>
  );
}

// ── Assets Section ───────────────────────────────────────────────────────────

interface AssetChipData {
  key: string;
  name: string;
  color: string;
  letter: string;
  primaryAmount: string;
  secondaryAmount: string;
}

const AssetsSection = memo(function AssetsSection({
  data,
  isLoading,
  hidden,
  onViewAll,
}: {
  data: WalletBalance | undefined;
  isLoading: boolean;
  hidden: boolean;
  onViewAll: () => void;
}) {
  const chips = useMemo<AssetChipData[]>(() => {
    if (!data?.assets?.length) return [];
    return data.assets.map((asset) => {
      const meta = getAssetMeta(asset.symbol);
      const decimals = asset.symbol === "AVAX" ? 4 : 2;
      return {
        key: asset.symbol.toLowerCase(),
        name: asset.symbol,
        color: meta.color,
        letter: meta.letter,
        primaryAmount: formatUSD(asset.balanceUsd),
        secondaryAmount: `${parseFloat(asset.balance).toFixed(decimals)} ${asset.symbol}`,
      };
    });
  }, [data]);

  return (
    <div className="px-4 mb-5 md:col-span-1 md:order-3 md:row-start-1 md:row-span-2 md:px-0 md:mb-0 md:bg-paper md:border md:border-ink/10 md:rounded-2xl md:p-5 md:self-stretch">
      <div className="flex items-center justify-between mb-3">
        <span className="font-bold text-[13px] text-charcoal">Assets</span>
        <button
          type="button"
          onClick={onViewAll}
          className="text-[12px] text-forest font-semibold cursor-pointer focus-visible:outline-none"
        >
          View all
        </button>
      </div>

      <div className="flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-col md:overflow-visible md:pb-0 md:gap-0">
        {isLoading
          ? [0, 1, 2].map((i) => (
              <div
                key={i}
                className="shrink-0 w-22.5 h-22 rounded-2xl bg-ink/6 animate-pulse md:w-full md:h-14 md:rounded-xl"
              />
            ))
          : chips.map((chip) => (
              <div
                key={chip.key}
                className="shrink-0 bg-paper border border-ink/10 rounded-2xl p-3 flex flex-col gap-1 min-w-22.5 md:w-full md:min-w-0 md:flex-row md:items-center md:gap-3 md:bg-transparent md:border-0 md:border-b md:border-ink/6 md:last:border-0 md:rounded-none md:p-0 md:py-3"
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-black mb-1 md:mb-0 md:shrink-0"
                  style={{ backgroundColor: chip.color }}
                >
                  {chip.letter}
                </div>
                <span className="text-[10px] font-semibold text-slate uppercase tracking-wide md:flex-1 md:text-[13px] md:font-semibold md:text-charcoal/70 md:normal-case md:tracking-normal">
                  {chip.name}
                </span>
                <div className="flex flex-col md:items-end md:shrink-0">
                  <span className="text-[14px] font-bold text-charcoal">
                    {hidden ? "••••" : chip.primaryAmount}
                  </span>
                  <span className="text-[11px] text-slate">
                    {hidden ? "••••" : chip.secondaryAmount}
                  </span>
                </div>
              </div>
            ))}
      </div>
    </div>
  );
});

// ── Quick Actions ─────────────────────────────────────────────────────────────

// Tone matches Autopayke.dc.html's home quick-action colors: Send=amber,
// Pay=ink (navy), Receive=forest, Withdraw=ink-tint. "Add money" isn't one
// of the mockup's grid tiles (it's a separate pill on its balance card) so
// it gets the same calm ink-tint treatment as Withdraw.
const QUICK_ACTIONS = [
  { label: "Add money", icon: Plus,         tone: "soft",   key: "add"     },
  { label: "Send",      icon: ArrowUpRight, tone: "amber",  key: "send"    },
  { label: "Pay",       icon: Store,        tone: "ink",    key: "pay"     },
  { label: "Receive",   icon: QrCode,       tone: "forest", key: "receive" },
] as const;

const WITHDRAW_ACTION = { label: "Withdraw", icon: ArrowDownToLine, tone: "soft", key: "withdraw" } as const;

const QUICK_ACTION_TILE_CLASSES: Record<string, string> = {
  amber: "bg-amber shadow-[0_4px_16px_rgba(232,163,61,0.35)]",
  ink: "bg-ink",
  forest: "bg-forest",
  soft: "bg-ink/10",
};

const QUICK_ACTION_ICON_CLASSES: Record<string, string> = {
  amber: "text-ink",
  ink: "text-paper",
  forest: "text-paper",
  soft: "text-ink",
};

function QuickActions({
  onAddMoney,
  onSend,
  onPay,
  onReceive,
  onWithdraw,
  showWithdraw,
}: {
  onAddMoney: () => void;
  onSend: () => void;
  onPay: () => void;
  onReceive: () => void;
  onWithdraw: () => void;
  showWithdraw: boolean;
}) {
  const handlers: Record<string, () => void> = {
    add: onAddMoney,
    send: onSend,
    pay: onPay,
    receive: onReceive,
    withdraw: onWithdraw,
  };

  // Withdraw only shows once there's a USDC balance in a Minisend-covered
  // country — kept hidden rather than shown-disabled for everyone else, so
  // it never promises a feature that doesn't work there yet.
  const actions = showWithdraw ? [...QUICK_ACTIONS, WITHDRAW_ACTION] : QUICK_ACTIONS;

  return (
    <div className="px-4 mb-5 md:col-span-3 md:order-4 md:px-0 md:mb-0">
      <div className={cn("grid gap-2 md:max-w-lg", showWithdraw ? "grid-cols-5" : "grid-cols-4")}>
        {/* 4-up layout: touch targets keep their 44px min-height, just with
            tighter horizontal gutters than the previous 3-up grid. */}
        {actions.map(({ label, icon: Icon, tone, key }) => (
          <button
            key={key}
            type="button"
            onClick={handlers[key]}
            className="flex flex-col items-center gap-2 cursor-pointer focus-visible:outline-none group"
          >
            <div
              className={cn(
                "w-15 h-15 rounded-[18px] flex items-center justify-center active:scale-90 transition-transform",
                QUICK_ACTION_TILE_CLASSES[tone]
              )}
            >
              <Icon
                size={tone === "amber" ? 22 : 20}
                strokeWidth={tone === "amber" ? 2.5 : 1.5}
                className={QUICK_ACTION_ICON_CLASSES[tone]}
              />
            </div>
            <span className="text-[11px] font-semibold text-charcoal">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Recent Activity ───────────────────────────────────────────────────────────

function TransactionSkeleton() {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-ink/6">
      <div className="w-9.5 h-9.5 rounded-xl bg-ink/6 animate-pulse shrink-0" />
      <div className="flex-1">
        <div className="h-3.5 w-32 rounded bg-ink/6 animate-pulse" />
        <div className="h-3 w-20 rounded bg-ink/6 animate-pulse mt-1.5" />
      </div>
      <div className="h-4 w-14 rounded bg-ink/6 animate-pulse ml-auto" />
    </div>
  );
}

function RecentActivity({
  query,
  onViewAll,
  onAddMoney,
}: {
  query: ReturnType<typeof useQuery<{ transactions: Transaction[] }>>;
  onViewAll: () => void;
  onAddMoney: () => void;
}) {
  const transactions = query.data?.transactions ?? [];

  return (
    <div className="px-4 md:col-span-3 md:order-5 md:px-0 md:bg-paper md:border md:border-ink/10 md:rounded-2xl md:p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="font-bold text-[13px] text-charcoal">Recent activity</span>
        {transactions.length > 0 && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-[12px] text-forest font-semibold cursor-pointer focus-visible:outline-none"
          >
            See all
          </button>
        )}
      </div>

      {query.isLoading && (
        <div className="flex flex-col">
          <TransactionSkeleton />
          <TransactionSkeleton />
          <TransactionSkeleton />
        </div>
      )}

      {!query.isLoading && query.isError && (
        <div className="flex flex-col items-center py-8 text-center">
          <AlertCircle size={24} strokeWidth={1.5} className="text-ink/25 mb-2" />
          <p className="text-[13px] text-slate">Could not load transactions.</p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="mt-2 text-[12px] text-forest font-semibold cursor-pointer focus-visible:outline-none"
          >
            Retry
          </button>
        </div>
      )}

      {!query.isLoading && !query.isError && transactions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Activity size={28} strokeWidth={1.5} className="text-ink/25 mb-3" />
          <p className="text-[14px] font-bold text-charcoal/70 mb-1">No transactions yet</p>
          <p className="text-[12px] text-slate">Add money to get started.</p>
          <button
            type="button"
            onClick={onAddMoney}
            className="mt-4 px-5 py-2.5 rounded-xl bg-amber/15 border border-amber/40 text-ink text-[13px] font-semibold focus-visible:outline-none"
          >
            Add money
          </button>
        </div>
      )}

      {!query.isLoading && !query.isError && transactions.length > 0 && (
        <div className="flex flex-col">
          {transactions.map((tx) => (
            <TransactionRow key={tx.id} transaction={tx} />
          ))}
        </div>
      )}
    </div>
  );
}
