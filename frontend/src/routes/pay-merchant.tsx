import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useSessionStore } from "@/stores/sessionStore";
import { useEffect, useState } from "react";
import {
  ArrowLeft, Store, Landmark, ArrowRight,
  Loader2, Lock, AlertCircle, Info, Clock,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageFrame } from "@/components/PageFrame";
import { api, ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { midRates } from "@/lib/tuma-data";
import { getRailLabel, PAY_SENDING_COPY } from "@/lib/status-labels";
import { FxQuoteSummaryCard, FxReviewHero, KV } from "@/components/FxTransparencyCard";
import { TokenStep } from "@/components/TokenStep";
import {
  TILL_PAYBILL_NUMBER_RE,
  PAY_ACCOUNT_NUMBER_RE,
  type CountryPayConfig,
  type PayableAsset,
  type PayMethodKind,
  type PayQuote,
} from "@tuma/shared";

export const Route = createFileRoute("/pay-merchant")({
  beforeLoad: () => {
    const s = useSessionStore.getState();
    if (!s.isAuthenticated() || !s.is_unlocked) {
      sessionStorage.setItem("autopayke_redirect_to", "/pay-merchant");
      throw redirect({ to: "/login", replace: true });
    }
  },
  head: () => ({
    meta: [
      { title: "Pay · Autopayke" },
      { name: "description", content: "Pay a merchant Till or PayBill from your stablecoin balance." },
    ],
  }),
  component: PayMerchantPage,
});

type Step = "method" | "merchant" | "token" | "amount" | "review" | "sending";

const METHOD_ICONS: Record<PayMethodKind, typeof Store> = {
  buy_goods: Store,
  paybill: Landmark,
};

const QUICK_KES = [100, 500, 1_000, 2_500];

function PayMerchantPage() {
  const navigate = useNavigate();
  const { accessToken, isLoggedIn } = useAuthStore();
  const [step, setStep] = useState<Step>("method");
  const [method, setMethod] = useState<PayMethodKind | null>(null);
  const [merchantNumber, setMerchantNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [token, setToken] = useState<PayableAsset>("USDC");
  const [amount, setAmount] = useState("500"); // KES
  const [quote, setQuote] = useState<PayQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Tracks which async step the "sending" screen is showing — explicit
  // rather than inferred from `quote`'s truthiness, since a stale quote can
  // still be set while re-fetching a fresh one (e.g. after editing the
  // amount and going back from review).
  const [sendingPhase, setSendingPhase] = useState<"quote" | "confirm" | null>(null);
  // Generated once per wizard visit so a retried "Confirm & pay" tap (e.g.
  // after a network blip) replays safely instead of double-charging.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const kes = Number(amount) || 0;
  const kesRate = midRates.KE?.rate ?? 0;
  const usdApprox = kesRate > 0 ? kes / kesRate : 0;

  useEffect(() => {
    if (!isLoggedIn()) navigate({ to: "/signup" });
  }, [isLoggedIn, navigate]);

  const {
    data: config,
    isLoading: configLoading,
    error: configError,
    refetch: refetchConfig,
  } = useQuery({
    queryKey: ["pay-config"],
    queryFn: () => api.pay.config(accessToken!),
    enabled: !!accessToken,
    staleTime: 5 * 60_000,
  });

  const { data: wallet } = useQuery({
    queryKey: ["wallet"],
    queryFn: () => api.wallet.get(accessToken!),
    enabled: !!accessToken,
  });

  // Merchant Pay debits straight to the treasury (no escrow), so unlike Send
  // every held token — including AVAX — can be offered here.
  const tokenAssets = (wallet?.assets ?? []).filter((a) => parseFloat(a.balance) > 0);
  const selectedAsset = wallet?.assets?.find((a) => a.symbol === token);
  const maxBalance = selectedAsset ? parseFloat(selectedAsset.balance) : 0;
  const maxBalanceUsd = selectedAsset?.balanceUsd ?? 0;

  const methodConfig = config?.methods.find((m) => m.kind === method) ?? null;

  async function handleGetQuote() {
    if (!method || !accessToken || kes <= 0) return;
    setError(null);
    setSendingPhase("quote");
    setStep("sending");
    try {
      const q = await api.pay.quote(usdApprox, method, token, accessToken);
      setQuote(q);
      setStep("review");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't get a quote. Try again.");
      setStep("amount");
    } finally {
      setSendingPhase(null);
    }
  }

  async function refreshQuote() {
    if (!method || !accessToken || kes <= 0) return;
    try {
      const q = await api.pay.quote(usdApprox, method, token, accessToken);
      setQuote(q);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Rate expired — couldn't refresh. Try again.");
    }
  }

  async function handleConfirm() {
    if (!quote || !method || !accessToken) return;
    setError(null);
    setSendingPhase("confirm");
    setStep("sending");
    try {
      const result = await api.pay.initiate(
        {
          quoteId: quote.quoteId,
          payMethod: method,
          merchantNumber,
          accountNumber: method === "paybill" ? accountNumber : undefined,
          amountUsd: quote.fromAmountUsd,
          token,
          idempotencyKey,
        },
        accessToken
      );
      navigate({ to: "/track/$id", params: { id: result.transactionId } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Payment failed. Try again.");
      setStep("review");
      setSendingPhase(null);
    }
  }

  function handleBack() {
    if (step === "method") navigate({ to: "/dashboard" });
    else if (step === "merchant") setStep("method");
    else if (step === "token") setStep("merchant");
    else if (step === "amount") setStep("token");
    else if (step === "review") setStep("amount");
    else navigate({ to: "/dashboard" });
  }

  return (
    <PageFrame sidebar maxWidth="narrow">
      <div className="flex min-h-full flex-col font-manrope">
        <header className="sticky top-0 z-10 bg-linen/95 backdrop-blur border-b border-ink/10 px-5 py-4 flex items-center justify-between">
          <button onClick={handleBack} className="h-9 w-9 rounded-full border border-ink/10 bg-paper flex items-center justify-center">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-sm font-bold">
            {step === "method" && "Pay a merchant"}
            {step === "merchant" && (method === "paybill" ? "PayBill details" : "Till details")}
            {step === "token" && "Pay with"}
            {step === "amount" && "Enter amount"}
            {step === "review" && "Review & confirm"}
            {step === "sending" && "Sending"}
          </h1>
          <div className="w-9" />
        </header>

        {error && (
          <div className="mx-5 mt-3 flex items-center gap-2 rounded-2xl border border-rust/30 bg-rust/10 px-4 py-3 text-xs text-rust">
            <AlertCircle className="h-4 w-4 shrink-0" />{error}
          </div>
        )}

        {step === "method" && (
          <MethodStep
            config={config}
            isLoading={configLoading}
            hasError={!!configError}
            onRetry={refetchConfig}
            onPick={(m) => { setMethod(m); setStep("merchant"); }}
          />
        )}

        {step === "merchant" && methodConfig && (
          <MerchantStep
            methodConfig={methodConfig}
            merchantNumber={merchantNumber}
            setMerchantNumber={setMerchantNumber}
            accountNumber={accountNumber}
            setAccountNumber={setAccountNumber}
            onNext={() => setStep("token")}
          />
        )}

        {step === "token" && (
          <TokenStep assets={tokenAssets} onPick={(t) => { setToken(t); setStep("amount"); }} />
        )}

        {step === "amount" && methodConfig && (
          <AmountStep
            amount={amount}
            setAmount={setAmount}
            kes={kes}
            usdApprox={usdApprox}
            kesRate={kesRate}
            token={token}
            maxBalance={maxBalance}
            maxBalanceUsd={maxBalanceUsd}
            quote={quote}
            onRefreshQuote={refreshQuote}
            onNext={handleGetQuote}
          />
        )}

        {step === "review" && methodConfig && quote && (
          <ReviewStep
            methodConfig={methodConfig}
            merchantNumber={merchantNumber}
            accountNumber={accountNumber}
            quote={quote}
            onConfirm={handleConfirm}
            onRefreshQuote={refreshQuote}
          />
        )}

        {step === "sending" && (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <div className="relative h-24 w-24">
              <div className="absolute inset-0 rounded-full opacity-40 blur-2xl bg-ink" />
              <div className="relative h-full w-full rounded-full flex items-center justify-center text-paper bg-ink">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            </div>
            <h2 className="mt-6 text-2xl font-black">
              {sendingPhase === "confirm" ? PAY_SENDING_COPY.initiated : "Getting quote…"}
            </h2>
            {sendingPhase === "confirm" && (
              <p className="mt-2 text-xs text-slate">
                Debiting your balance → sandbox Daraja B2B call
              </p>
            )}
          </div>
        )}

        <div className="h-6" />
      </div>
    </PageFrame>
  );
}

// ── Method step ───────────────────────────────────────────────────────────────

function MethodStep({ config, isLoading, hasError, onRetry, onPick }: {
  config: CountryPayConfig | undefined;
  isLoading: boolean;
  hasError: boolean;
  onRetry: () => void;
  onPick: (method: PayMethodKind) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col px-5 pt-5 pb-6 gap-3">
        {[0, 1].map((i) => (
          <div key={i} className="h-20 rounded-2xl border border-ink/10 bg-paper animate-pulse" />
        ))}
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
        <AlertCircle className="h-6 w-6 text-rust" />
        <p className="mt-3 text-sm text-slate">Couldn't load Pay options.</p>
        <button onClick={onRetry} className="mt-4 rounded-xl border border-ink/10 bg-paper px-4 py-2 text-xs font-semibold">
          Try again
        </button>
      </div>
    );
  }

  if (!config || config.status !== "available" || config.methods.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
        <div className="h-16 w-16 rounded-full bg-ink/8 flex items-center justify-center">
          <Clock className="h-7 w-7 text-slate" />
        </div>
        <h2 className="mt-5 text-lg font-black">Coming soon in {config?.countryName ?? "your country"}</h2>
        <p className="mt-2 text-sm text-slate max-w-xs">
          Merchant Pay is live in Kenya today. We're rolling out to more countries next.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col px-5 pt-5 pb-6 gap-3">
      {config.methods.map((m) => {
        const Icon = METHOD_ICONS[m.kind];
        return (
          <button
            key={m.kind}
            onClick={() => onPick(m.kind)}
            className="w-full flex items-center gap-3 rounded-2xl border border-ink/10 bg-paper hover:bg-ink/5 p-4 text-left transition"
          >
            <div className="h-11 w-11 rounded-full bg-amber/16 flex items-center justify-center shrink-0">
              <Icon className="h-5 w-5 text-forest" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{m.label}</p>
              <p className="text-[11px] text-slate">
                {m.requiresAccountNumber ? `${m.numberLabel} + account number` : m.numberLabel}
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-slate" />
          </button>
        );
      })}
    </div>
  );
}

// ── Merchant details step ─────────────────────────────────────────────────────

function MerchantStep({ methodConfig, merchantNumber, setMerchantNumber, accountNumber, setAccountNumber, onNext }: {
  methodConfig: { kind: PayMethodKind; numberLabel: string; requiresAccountNumber: boolean };
  merchantNumber: string; setMerchantNumber: (v: string) => void;
  accountNumber: string; setAccountNumber: (v: string) => void;
  onNext: () => void;
}) {
  const numberValid = TILL_PAYBILL_NUMBER_RE.test(merchantNumber);
  const accountValid = !methodConfig.requiresAccountNumber || PAY_ACCOUNT_NUMBER_RE.test(accountNumber);
  const canContinue = numberValid && accountValid;

  return (
    <div className="flex-1 flex flex-col px-5 pt-5 pb-6">
      <label className="block rounded-2xl border border-ink/10 bg-paper p-4">
        <span className="text-[10px] uppercase tracking-wider text-slate">{methodConfig.numberLabel}</span>
        <input
          value={merchantNumber}
          onChange={(e) => setMerchantNumber(e.target.value.replace(/[^0-9]/g, "").slice(0, 7))}
          placeholder="e.g. 174379"
          type="text"
          inputMode="numeric"
          autoFocus
          className="mt-1 w-full bg-transparent text-2xl font-black outline-none placeholder:text-slate/40"
        />
        {merchantNumber.length > 0 && !numberValid && (
          <p className="mt-1 text-[11px] text-rust">Enter a 5–7 digit number</p>
        )}
      </label>

      {methodConfig.requiresAccountNumber && (
        <label className="mt-3 block rounded-2xl border border-ink/10 bg-paper p-4">
          <span className="text-[10px] uppercase tracking-wider text-slate">Account number</span>
          <input
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value.slice(0, 20))}
            placeholder="e.g. account or invoice number"
            className="mt-1 w-full bg-transparent text-lg font-bold outline-none placeholder:text-slate/40"
          />
        </label>
      )}

      <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-amber/50 bg-amber/16 px-4 py-3">
        <Info className="h-4 w-4 text-forest shrink-0 mt-0.5" />
        <p className="text-[11px] text-slate">
          Double-check this number before continuing — Autopayke can't verify the merchant's name,
          so payments to a wrong till or paybill can't be reversed.
        </p>
      </div>

      <div className="mt-auto pt-6">
        <button
          disabled={!canContinue}
          onClick={onNext}
          className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-semibold text-paper bg-ink hover:bg-ink-hover disabled:opacity-40 transition"
        >
          Continue <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Amount step ───────────────────────────────────────────────────────────────

function fmtQuick(v: number): string {
  return v >= 1_000 ? `${(v / 1_000).toFixed(v % 1_000 === 0 ? 0 : 1)}K` : String(v);
}

function AmountStep({ amount, setAmount, kes, usdApprox, kesRate, token, maxBalance, maxBalanceUsd, quote, onRefreshQuote, onNext }: {
  amount: string; setAmount: (v: string) => void;
  kes: number; usdApprox: number; kesRate: number; token: PayableAsset; maxBalance: number; maxBalanceUsd: number;
  quote: PayQuote | null; onRefreshQuote: () => void; onNext: () => void;
}) {
  const overBalance = maxBalanceUsd > 0 && usdApprox > maxBalanceUsd;

  return (
    <div className="flex-1 flex flex-col px-5 pt-5 pb-6">
      <div className="rounded-3xl p-5 text-paper bg-ink">
        <p className="text-xs opacity-90 mb-1">You're paying</p>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-black opacity-80">KES</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            className="bg-transparent text-5xl font-black outline-none min-w-0 w-full"
          />
        </div>
        {kesRate > 0 && (
          <p className="mt-1 text-[11px] opacity-80">≈ {usdApprox.toFixed(2)} {token}</p>
        )}
        <p className={`mt-2 text-[11px] ${overBalance ? "text-rust font-semibold" : "opacity-80"}`}>
          Available: {maxBalance.toFixed(2)} {token}
        </p>

        <div className="mt-3 flex gap-2">
          {QUICK_KES.map((v) => (
            <button
              key={v}
              onClick={() => setAmount(String(v))}
              className="flex-1 rounded-full bg-paper/15 backdrop-blur py-1.5 text-xs font-semibold"
            >
              {fmtQuick(v)}
            </button>
          ))}
        </div>
      </div>

      {quote && (
        <FxQuoteSummaryCard quote={quote} usd={quote.fromAmountUsd} onRefreshQuote={onRefreshQuote} label="You'll debit" />
      )}

      <div className="mt-auto pt-6">
        <button
          disabled={kes <= 0 || overBalance}
          onClick={onNext}
          className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-semibold text-paper bg-ink hover:bg-ink-hover disabled:opacity-40 transition"
        >
          Review payment <ArrowRight className="h-4 w-4" />
        </button>
        {overBalance && (
          <p className="mt-2 text-center text-[11px] text-rust">Not enough {token} for this amount</p>
        )}
      </div>
    </div>
  );
}

// ── Review step ───────────────────────────────────────────────────────────────

function ReviewStep({ methodConfig, merchantNumber, accountNumber, quote, onConfirm, onRefreshQuote }: {
  methodConfig: { kind: PayMethodKind; label: string };
  merchantNumber: string; accountNumber: string;
  quote: PayQuote; onConfirm: () => void; onRefreshQuote: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const Icon = METHOD_ICONS[methodConfig.kind];

  async function handleConfirm() {
    setLoading(true);
    await onConfirm();
    setLoading(false);
  }

  const toLine = methodConfig.kind === "buy_goods"
    ? `Till ${merchantNumber}`
    : `PayBill ${merchantNumber}${accountNumber ? ` · Acc: ${accountNumber}` : ""}`;

  return (
    <div className="flex-1 flex flex-col px-5 pt-5 pb-6">
      <div className="rounded-3xl border border-ink/10 bg-paper overflow-hidden">
        <FxReviewHero
          usd={quote.fromAmountUsd}
          quote={quote}
          onRefreshQuote={onRefreshQuote}
          icon={Icon}
          toLabel="Merchant receives"
        />
        <div className="divide-y divide-ink/10 text-xs">
          <KV k="To" v={toLine} mono />
          <KV k="Method" v={methodConfig.label} />
          <KV k="Paying with" v={quote.tokenAmount !== undefined ? `${quote.tokenAmount.toFixed(4)} ${quote.fromToken}` : quote.fromToken} />
          <KV k="Settles via" v={getRailLabel(quote.rail)} />
          <KV k="Rate" v={`1 USD = ${quote.tumaRate.toFixed(2)} ${quote.toCurrency}`} />
          <KV k="Network fee" v="Free" />
          <KV k="Arrival" v="Sandbox demo — Daraja sandbox" />
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-amber/50 bg-amber/16 px-4 py-3">
        <Info className="h-4 w-4 text-forest shrink-0 mt-0.5" />
        <p className="text-[11px] text-slate">
          Sandbox demo — this pays a real Safaricom sandbox till, not a live merchant.
        </p>
      </div>

      <div className="mt-auto pt-6">
        <button
          onClick={handleConfirm}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-semibold text-ink bg-amber hover:bg-amber-deep disabled:opacity-60 transition"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
          {loading ? "Processing…" : "Confirm & pay"}
        </button>
        <p className="mt-2 text-center text-[11px] text-slate">Signed on-device · Settled on Avalanche</p>
      </div>
    </div>
  );
}
