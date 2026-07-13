import { useAuthStore } from "./auth-store";

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function opsRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const { token, operator } = useAuthStore.getState();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "x-operations-token": token } : {}),
      "x-operator": operator,
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  if (res.headers.get("content-type")?.includes("text/csv")) {
    const blob = await res.blob();
    return blob as unknown as T;
  }

  const json = (await res.json()) as { ok: boolean; data?: T; error?: string };
  if (!res.ok || !json.ok) {
    throw new ApiError(res.status, json.error ?? `HTTP ${res.status}`);
  }
  return json.data as T;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type Overview = {
  volume: {
    today: { usd: number; txCount: number };
    "7d": { usd: number; txCount: number };
    "30d": { usd: number; txCount: number };
  };
  statusBreakdown: Record<string, number>;
  users: { total: number; new7d: number; new30d: number };
  escrows: { pendingCount: number; pendingValueUsdc: number };
  feeRevenue30dUsdc: number;
  topRails: { rail: string; volumeUsdc: number; txCount: number }[];
};

export type Transaction = {
  id: string;
  reference: string;
  senderPhone: string | null;
  senderCountry: string | null;
  recipientPhone: string;
  amountUsdc: number;
  amountLocal: number;
  localCurrency: string;
  fxRate: number;
  feeUsdc: number;
  rail: string;
  token: string;
  status: string;
  isEscrow: boolean;
  txHash: string | null;
  failureStage: string | null;
  failureReason: string | null;
  failedAt: string | null;
  createdAt: string;
  settledAt: string | null;
};

export type TransactionDetail = {
  transaction: Transaction & {
    idempotencyKey: string | null;
    senderWalletAddress: string | null;
    recipientWalletAddress: string | null;
    railReference: string | null;
    note: string | null;
    escrowRef: string | null;
    isMerchantPayment: boolean;
  };
  timeline: { step: string; metadata: Record<string, unknown>; createdAt: string }[];
  escrow: {
    ref: string;
    status: string;
    amountUsdc: number;
    expiresAt: string;
    claimedAt: string | null;
    claimedByWallet: string | null;
    claimTxHash: string | null;
  } | null;
};

export type Escrow = {
  id: string;
  ref: string;
  transactionId: string;
  reference: string | null;
  rail: string | null;
  recipientPhone: string;
  localCurrency: string | null;
  amountUsdc: number;
  token: string;
  status: string;
  expiresAt: string;
  secondsToExpiry: number;
  claimedAt: string | null;
  claimedByWallet: string | null;
  createdAt: string;
};

export type DeadLetterItem = {
  transactionId: string;
  reference: string;
  rail: string;
  recipientPhone: string;
  amountLocal: number;
  localCurrency: string;
  railReference: string | null;
  failureStage: string | null;
  failureReason: string | null;
  failedAt: string | null;
  providerIdempotencyKey: string;
  reviewMetadata: Record<string, unknown> | null;
  createdAt: string;
};

export type UserSummary = {
  id: string;
  phone: string;
  countryCode: string;
  walletAddress: string | null;
  isMerchant: boolean;
  email: string | null;
  suspended: boolean;
  createdAt: string;
};

export type UserDetail = {
  user: UserSummary & {
    externalWalletAddress: string | null;
    externalWalletType: string | null;
    suspendedAt: string | null;
    updatedAt: string;
  };
  stats: { totalVolumeUsdc: number; txCount: number; activeSessions: number };
  recentTransactions: (Transaction & { direction: "in" | "out" })[];
};

export type Merchant = {
  id: string;
  userId: string;
  businessName: string;
  tillOpen: boolean;
  feeBps: number;
  settleRail: string;
  settleSchedule: string;
  autoSettleTo: string;
  lastSettledAt: string | null;
  phone: string | null;
  countryCode: string | null;
  email: string | null;
  memberSince: string | null;
  totalVolumeUsdc: number;
  txCount: number;
};

export type FxRate = {
  currency: string;
  midRate: number;
  tumaRate: number;
  spread: number;
  source: string;
  fetchedAt: string;
};

export type HeartbeatItem = {
  component: string;
  kind: string;
  status: string;
  staleAfterSeconds: number;
  isStale: boolean;
  lastHeartbeatAt: string;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  secondsSinceHeartbeat: number;
};

export type Pagination = { total: number; page: number; limit: number; pages: number };

export type OpsMeta = { network: "testnet" | "mainnet" };

export type AssetBalance = {
  symbol: string;
  address: string;
  balance: string;
  balanceUsd: number;
  decimals: number;
};

export type Balances = {
  treasury: { address: string; assets: AssetBalance[] } | null;
  relayerFloat: { address: string; assets: AssetBalance[] } | null;
  userWalletsTotal: {
    totalsBySymbol: Record<string, number>;
    walletCount: number;
    asOf: string;
  };
};

// ── API client ────────────────────────────────────────────────────────────────

export const opsApi = {
  overview: () => opsRequest<Overview>("/api/ops/overview"),

  meta: () => opsRequest<OpsMeta>("/api/ops/meta"),

  balances: () => opsRequest<Balances>("/api/ops/balances"),

  transactions: {
    list: (params: Record<string, string | number | undefined>) => {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== "") q.set(k, String(v));
      }
      return opsRequest<{ transactions: Transaction[]; pagination: Pagination }>(
        `/api/ops/transactions?${q}`
      );
    },
    get: (id: string) => opsRequest<TransactionDetail>(`/api/ops/transactions/${id}`),
    markFailed: (id: string, reason: string) =>
      opsRequest<{ id: string; status: string }>(`/api/ops/transactions/${id}/mark-failed`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    export: (params: Record<string, string | number | undefined>) => {
      const { token, operator } = useAuthStore.getState();
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== "") q.set(k, String(v));
      }
      const url = `${API_BASE}/api/ops/transactions/export?${q}`;
      const a = document.createElement("a");
      a.href = url;
      fetch(url, {
        headers: {
          "x-operations-token": token ?? "",
          "x-operator": operator,
        },
      })
        .then((r) => r.blob())
        .then((blob) => {
          const objUrl = URL.createObjectURL(blob);
          a.href = objUrl;
          a.download = `transactions-${Date.now()}.csv`;
          a.click();
          URL.revokeObjectURL(objUrl);
        });
    },
  },

  review: {
    list: (page = 1, limit = 50) =>
      opsRequest<{ transactions: Transaction[]; pagination: Pagination }>(
        `/api/ops/review?page=${page}&limit=${limit}`
      ),
    batchRetry: (transactionIds: string[]) =>
      opsRequest<{ results: { transactionId: string; ok: boolean; error?: string }[] }>(
        "/api/ops/review/batch-retry",
        { method: "POST", body: JSON.stringify({ transactionIds }) }
      ),
    retryDisbursement: (id: string) =>
      opsRequest<unknown>(`/api/ops/review/${id}/retry-disbursement`, { method: "POST" }),
    resendClaimLink: (id: string) =>
      opsRequest<unknown>(`/api/ops/review/${id}/resend-claim-link`, { method: "POST" }),
    reconcileHash: (id: string, txHash: string, note?: string) =>
      opsRequest<unknown>(`/api/ops/review/${id}/reconcile-chain-hash`, {
        method: "POST",
        body: JSON.stringify({ txHash, note }),
      }),
    refundEscrow: (id: string) =>
      opsRequest<unknown>(`/api/ops/review/${id}/refund-escrow`, { method: "POST" }),
  },

  deadLetter: {
    list: (page = 1, limit = 50) =>
      opsRequest<{ items: DeadLetterItem[]; pagination: Pagination }>(
        `/api/ops/rail/dead-letter?page=${page}&limit=${limit}`
      ),
    retry: (id: string) =>
      opsRequest<unknown>(`/api/ops/rail/dead-letter/${id}/retry`, { method: "POST" }),
    discard: (id: string) =>
      opsRequest<unknown>(`/api/ops/rail/dead-letter/${id}/discard`, { method: "POST" }),
  },

  escrows: {
    list: (params: Record<string, string | number | undefined>) => {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== "") q.set(k, String(v));
      }
      return opsRequest<{ escrows: Escrow[]; pagination: Pagination }>(`/api/ops/escrows?${q}`);
    },
    forceExpire: (ref: string) =>
      opsRequest<unknown>(`/api/ops/escrows/${ref}/force-expire`, { method: "POST" }),
    resendLink: (ref: string) =>
      opsRequest<unknown>(`/api/ops/escrows/${ref}/resend-link`, { method: "POST" }),
  },

  users: {
    list: (params: Record<string, string | number | undefined>) => {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== "") q.set(k, String(v));
      }
      return opsRequest<{ users: UserSummary[]; pagination: Pagination }>(`/api/ops/users?${q}`);
    },
    get: (id: string) => opsRequest<UserDetail>(`/api/ops/users/${id}`),
    suspend: (id: string, suspend: boolean) =>
      opsRequest<{ id: string; suspended: boolean }>(`/api/ops/users/${id}/suspend`, {
        method: "POST",
        body: JSON.stringify({ suspend }),
      }),
    deleteSessions: (id: string) =>
      opsRequest<{ deletedSessions: number }>(`/api/ops/users/${id}/sessions`, {
        method: "DELETE",
      }),
  },

  merchants: {
    list: (page = 1, limit = 50) =>
      opsRequest<{ merchants: Merchant[]; pagination: Pagination }>(
        `/api/ops/merchants?page=${page}&limit=${limit}`
      ),
    toggleTill: (userId: string, open: boolean) =>
      opsRequest<unknown>(`/api/ops/merchants/${userId}/till`, {
        method: "PATCH",
        body: JSON.stringify({ open }),
      }),
    updateFeeBps: (userId: string, feeBps: number) =>
      opsRequest<unknown>(`/api/ops/merchants/${userId}/fee-bps`, {
        method: "PATCH",
        body: JSON.stringify({ feeBps }),
      }),
  },

  fx: {
    current: () => opsRequest<{ rates: FxRate[] }>("/api/ops/fx"),
    history: (currency?: string, days = 7) => {
      const q = new URLSearchParams({ days: String(days) });
      if (currency) q.set("currency", currency);
      return opsRequest<{ history: (FxRate & { id: string })[] }>(`/api/ops/fx/history?${q}`);
    },
    override: (currency: string, tumaRate: number, note?: string) =>
      opsRequest<FxRate>("/api/ops/fx/override", {
        method: "POST",
        body: JSON.stringify({ currency, tumaRate, note }),
      }),
  },

  health: {
    heartbeats: (staleOnly = false) =>
      opsRequest<{
        staleCount: number;
        totalCount: number;
        items: HeartbeatItem[];
      }>(`/api/ops/health/heartbeats?staleOnly=${staleOnly}&failOnStale=false`),
    queues: () =>
      opsRequest<{
        queues: Record<string, Record<string, number> | null>;
      }>("/api/ops/health/queues"),
  },

  notifications: {
    list: (page = 1, limit = 50) =>
      opsRequest<{ notifications: unknown[]; pagination: Pagination }>(
        `/api/ops/notifications?page=${page}&limit=${limit}`
      ),
  },

  reports: {
    volume: (days = 30, rail?: string) => {
      const q = new URLSearchParams({ days: String(days) });
      if (rail) q.set("rail", rail);
      return opsRequest<{ chart: { date: string; volumeUsdc: number; feesUsdc: number; txCount: number }[] }>(
        `/api/ops/reports/volume?${q}`
      );
    },
    rails: () =>
      opsRequest<{
        rails: {
          rail: string;
          total: number;
          settled: number;
          failed: number;
          requiresReview: number;
          successRate: number;
          avgAmountUsdc: number;
        }[];
      }>("/api/ops/reports/rails"),
    escrowClaimRate: () =>
      opsRequest<{
        total: number;
        claimed: number;
        refunded: number;
        expired: number;
        pending: number;
        claimRate: number;
      }>("/api/ops/reports/escrow-claim-rate"),
  },

  receipts: {
    overview: () =>
      opsRequest<{
        total: { generated: number; uniqueTransactions: number };
        today: { generated: number; uniqueTransactions: number };
        "7d": { generated: number; uniqueTransactions: number };
        "30d": { generated: number; uniqueTransactions: number };
        chart: { date: string; generated: number; uniqueTransactions: number }[];
      }>("/api/ops/receipts/overview"),
    list: (page = 1, limit = 50) =>
      opsRequest<{
        receipts: {
          id: string;
          createdAt: string;
          transactionId: string | null;
          reference: string | null;
          amountUsdc: number | null;
          status: string | null;
          generatedByPhone: string | null;
          generatedByName: string | null;
          merchantBusinessName: string | null;
        }[];
        pagination: Pagination;
      }>(`/api/ops/receipts?page=${page}&limit=${limit}`),
  },
};
