import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useSessionStore } from "@/stores/sessionStore";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowDownToLine,
  Loader2,
  Lock,
  AlertCircle,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageFrame } from "@/components/PageFrame";
import { api, type PayoutQuote, ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";
import {
  FxReviewHero,
  KV,
  QuoteCountdown,
} from "@/components/FxTransparencyCard";
import { dialCodeToCountry, type CountryConfig } from "@tuma/shared";

export const Route = createFileRoute("/withdraw")({
  beforeLoad: () => {
    const s = useSessionStore.getState();
    if (!s.isAuthenticated() || !s.is_unlocked) {
      sessionStorage.setItem("autopayke_redirect_to", "/withdraw");
      throw redirect({ to: "/login", replace: true });
    }
  },
  head: () => ({
    meta: [
      { title: "Withdraw · Autopayke" },
      {
        name: "description",
        content:
          "Cash out your Autopayke balance to mobile money or your bank account.",
      },
    ],
  }),
  component: WithdrawPage,
});

type Step = "recipient" | "amount" | "review" | "confirming";

// Countries Minisend has confirmed coverage for. Keep in sync with the
// backend's getProviderForCountry() gate in services/settlement-providers.
const MOBILE_NETWORKS: Record<string, string[]> = {
  KE: ["Safaricom", "Airtel"],
  GH: ["MTN", "Vodafone", "AirtelTigo"],
  UG: ["MTN", "Airtel"],
};

// Nigeria pays out to a bank account rather than a phone number — Minisend's
// `institution` field takes a bank's SWIFT/BIC code (e.g. "GTBINGLA" for
// GTBank, per their docs' example). These are the major banks' standard,
// publicly-documented codes — not Minisend-specific data. Anyone at a smaller
// bank can enter their institution code manually via the "Other bank" option;
// Minisend hard-validates NGN accounts server-side either way, so a wrong
// code here is caught before an order is ever created, not silently sent.
const NIGERIA_BANKS: { name: string; code: string }[] = [
  { name: "Access Bank", code: "ABNGNGLA" },
  { name: "Guaranty Trust Bank (GTBank)", code: "GTBINGLA" },
  { name: "Zenith Bank", code: "ZEIBNGLA" },
  { name: "First Bank of Nigeria", code: "FBNINGLA" },
  { name: "United Bank for Africa (UBA)", code: "UNAFNGLA" },
  { name: "Union Bank of Nigeria", code: "UBNINGLA" },
  { name: "Fidelity Bank", code: "FIDTNGLA" },
  { name: "First City Monument Bank (FCMB)", code: "FCMBNGLA" },
  { name: "Stanbic IBTC Bank", code: "SBICNGLA" },
  { name: "Ecobank Nigeria", code: "ECOCNGLA" },
  { name: "Wema Bank", code: "WEMANGLA" },
  { name: "Sterling Bank", code: "NAMENGLA" },
];

function WithdrawPage() {
  const navigate = useNavigate();
  const { accessToken, user, isLoggedIn } = useAuthStore();

  useEffect(() => {
    if (!isLoggedIn()) navigate({ to: "/signup" });
  }, [isLoggedIn, navigate]);

  const country: CountryConfig | null = user?.phone
    ? dialCodeToCountry(user.phone)
    : null;
  const isBankCountry = country?.code === "NG";
  const supported =
    !!country && (country.code in MOBILE_NETWORKS || isBankCountry);

  const { data: wallet } = useQuery({
    queryKey: ["wallet"],
    queryFn: () => api.wallet.get(accessToken!),
    enabled: !!accessToken,
  });
  const usdcAsset = wallet?.assets?.find((a) => a.symbol === "USDC");
  const balanceUsd = usdcAsset?.balanceUsd ?? 0;

  const [step, setStep] = useState<Step>("recipient");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [editingPhone, setEditingPhone] = useState(false);
  const [mobileNetwork, setMobileNetwork] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankInstitution, setBankInstitution] = useState("");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<PayoutQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Default the amount field to the full balance once it's loaded — user can
  // still edit it down for a partial withdrawal.
  useEffect(() => {
    if (balanceUsd > 0 && !amount) setAmount(balanceUsd.toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balanceUsd]);

  const usd = Number(amount) || 0;

  async function fetchQuote(): Promise<boolean> {
    if (!accessToken || !country) return false;
    setError(null);
    try {
      const q = await api.withdraw.payoutQuote(
        {
          amountUsd: usd,
          recipient: isBankCountry
            ? {
                method: "bank",
                accountNumber: bankAccountNumber,
                institution: bankInstitution,
              }
            : { method: "mobile", phone, mobileNetwork },
        },
        accessToken,
      );
      setQuote(q);
      return true;
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Couldn't get a quote. Try again.",
      );
      return false;
    }
  }

  async function handleReview() {
    setLoading(true);
    const ok = await fetchQuote();
    setLoading(false);
    if (ok) setStep("review");
  }

  async function handleConfirm() {
    if (!quote || !accessToken) return;
    setError(null);
    setStep("confirming");
    try {
      const result = await api.withdraw.payoutConfirm(
        quote.quoteId,
        accessToken,
      );
      navigate({ to: "/track/$id", params: { id: result.transactionId } });
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Withdrawal failed. Try again.",
      );
      setStep("review");
    }
  }

  function handleBack() {
    if (step === "recipient") navigate({ to: "/dashboard" });
    else if (step === "amount") setStep("recipient");
    else if (step === "review") setStep("amount");
    else navigate({ to: "/dashboard" });
  }

  if (!country || !supported) {
    return (
      <UnavailableState
        reason={
          country
            ? `Withdrawals aren't available in ${country.name} yet — Kenya, Nigeria, Ghana, and Uganda are supported today.`
            : "We couldn't determine your country from your account phone number."
        }
        onBack={() => navigate({ to: "/dashboard" })}
      />
    );
  }

  return (
    <PageFrame sidebar maxWidth="narrow">
      <div className="flex min-h-full flex-col">
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-5 py-4 flex items-center justify-between">
          <button
            onClick={handleBack}
            className="h-9 w-9 rounded-full border border-border bg-card flex items-center justify-center"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-sm font-bold">
            {step === "recipient" && "Withdraw"}
            {step === "amount" && "Enter amount"}
            {step === "review" && "Review & confirm"}
            {step === "confirming" && "Withdrawing"}
          </h1>
          <div className="w-9" />
        </header>

        {error && (
          <div className="mx-5 mt-3 flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {step === "recipient" && (
          <RecipientStep
            country={country}
            isBankCountry={isBankCountry}
            phone={phone}
            setPhone={setPhone}
            editingPhone={editingPhone}
            setEditingPhone={setEditingPhone}
            mobileNetwork={mobileNetwork}
            setMobileNetwork={setMobileNetwork}
            bankAccountNumber={bankAccountNumber}
            setBankAccountNumber={setBankAccountNumber}
            bankInstitution={bankInstitution}
            setBankInstitution={setBankInstitution}
            onNext={() => setStep("amount")}
          />
        )}

        {step === "amount" && (
          <AmountStep
            country={country}
            amount={amount}
            setAmount={setAmount}
            balanceUsd={balanceUsd}
            walletLoaded={!!wallet}
            loading={loading}
            onNext={handleReview}
          />
        )}

        {(step === "review" || step === "confirming") && quote && (
          <ReviewStep
            country={country}
            usd={usd}
            quote={quote}
            confirming={step === "confirming"}
            onConfirm={handleConfirm}
            onRefreshQuote={fetchQuote}
          />
        )}
        <div className="h-6" />
      </div>
    </PageFrame>
  );
}

// ── Unavailable (country not covered) ───────────────────────────────────────

function UnavailableState({
  reason,
  onBack,
}: {
  reason: string;
  onBack: () => void;
}) {
  return (
    <PageFrame sidebar maxWidth="narrow">
      <div className="flex min-h-full flex-col">
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-5 py-4 flex items-center justify-between">
          <button
            onClick={onBack}
            className="h-9 w-9 rounded-full border border-border bg-card flex items-center justify-center"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-sm font-bold">Withdraw</h1>
          <div className="w-9" />
        </header>
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
            <ArrowDownToLine className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="mt-4 text-sm font-semibold">Not available yet</p>
          <p className="mt-1 text-xs text-muted-foreground">{reason}</p>
        </div>
      </div>
    </PageFrame>
  );
}

// ── Recipient step ───────────────────────────────────────────────────────────

function RecipientStep({
  country,
  isBankCountry,
  phone,
  setPhone,
  editingPhone,
  setEditingPhone,
  mobileNetwork,
  setMobileNetwork,
  bankAccountNumber,
  setBankAccountNumber,
  bankInstitution,
  setBankInstitution,
  onNext,
}: {
  country: CountryConfig;
  isBankCountry: boolean;
  phone: string;
  setPhone: (v: string) => void;
  editingPhone: boolean;
  setEditingPhone: (v: boolean) => void;
  mobileNetwork: string;
  setMobileNetwork: (v: string) => void;
  bankAccountNumber: string;
  setBankAccountNumber: (v: string) => void;
  bankInstitution: string;
  setBankInstitution: (v: string) => void;
  onNext: () => void;
}) {
  const networks = MOBILE_NETWORKS[country.code] ?? [];
  const [customBank, setCustomBank] = useState(
    () =>
      !!bankInstitution &&
      !NIGERIA_BANKS.some((b) => b.code === bankInstitution),
  );

  const canContinue = isBankCountry
    ? bankAccountNumber.trim().length >= 10 && !!bankInstitution.trim()
    : phone.trim().length > 0 && !!mobileNetwork;

  return (
    <div className="flex-1 flex flex-col px-5 pt-5 pb-6">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Withdraw to
      </p>

      {isBankCountry ? (
        <>
          <label className="mt-2 block rounded-2xl border border-border bg-card p-4">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {country.flag} Account number
            </span>
            <input
              value={bankAccountNumber}
              onChange={(e) =>
                setBankAccountNumber(e.target.value.replace(/[^0-9]/g, ""))
              }
              type="text"
              inputMode="numeric"
              placeholder="0123456789"
              className="mt-1 w-full bg-transparent text-lg font-bold outline-none placeholder:text-muted-foreground/40"
            />
          </label>

          <p className="mt-5 text-[10px] uppercase tracking-wider text-muted-foreground">
            Bank
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {NIGERIA_BANKS.map((b) => (
              <button
                key={b.code}
                onClick={() => {
                  setBankInstitution(b.code);
                  setCustomBank(false);
                }}
                className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                  !customBank && bankInstitution === b.code
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border bg-card text-foreground hover:bg-muted/50"
                }`}
              >
                {b.name}
              </button>
            ))}
            <button
              onClick={() => {
                setCustomBank(true);
                setBankInstitution("");
              }}
              className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                customBank
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border bg-card text-foreground hover:bg-muted/50"
              }`}
            >
              Other bank
            </button>
          </div>

          {customBank && (
            <label className="mt-3 block rounded-2xl border border-border bg-card p-4">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Bank institution code (SWIFT/BIC)
              </span>
              <input
                value={bankInstitution}
                onChange={(e) =>
                  setBankInstitution(e.target.value.toUpperCase())
                }
                type="text"
                placeholder="e.g. GTBINGLA"
                className="mt-1 w-full bg-transparent text-lg font-bold outline-none placeholder:text-muted-foreground/40"
              />
              <span className="mt-1 block text-[11px] text-muted-foreground">
                We'll verify this against your bank before showing a quote.
              </span>
            </label>
          )}
        </>
      ) : (
        <>
          <div className="mt-2 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {country.flag} Mobile number
              </span>
              {!editingPhone && (
                <button
                  onClick={() => setEditingPhone(true)}
                  className="text-[11px] font-semibold text-primary"
                >
                  Edit
                </button>
              )}
            </div>
            {editingPhone ? (
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                type="tel"
                inputMode="tel"
                autoFocus
                onBlur={() => setEditingPhone(false)}
                className="mt-1 w-full bg-transparent text-lg font-bold outline-none"
              />
            ) : (
              <p className="mt-1 text-lg font-bold">{phone}</p>
            )}
          </div>

          <p className="mt-5 text-[10px] uppercase tracking-wider text-muted-foreground">
            Mobile network
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {networks.map((n) => (
              <button
                key={n}
                onClick={() => setMobileNetwork(n)}
                className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                  mobileNetwork === n
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border bg-card text-foreground hover:bg-muted/50"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="mt-auto pt-6">
        <button
          disabled={!canContinue}
          onClick={onNext}
          className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-semibold text-primary-foreground disabled:opacity-40 shadow-(--shadow-elegant)"
          style={{ background: "var(--gradient-portfolio)" }}
        >
          Continue <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Amount step ───────────────────────────────────────────────────────────────

function AmountStep({
  country,
  amount,
  setAmount,
  balanceUsd,
  walletLoaded,
  loading,
  onNext,
}: {
  country: CountryConfig;
  amount: string;
  setAmount: (v: string) => void;
  balanceUsd: number;
  walletLoaded: boolean;
  loading: boolean;
  onNext: () => void;
}) {
  const usd = Number(amount) || 0;
  const insufficientBalance = usd > 0 && usd > balanceUsd;

  return (
    <div className="flex-1 flex flex-col px-5 pt-5 pb-6">
      <div
        className="rounded-3xl p-5 text-primary-foreground shadow-(--shadow-elegant)"
        style={{ background: "var(--gradient-portfolio)" }}
      >
        <p className="text-xs opacity-90">You withdraw</p>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-black opacity-80">USDC</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            className="bg-transparent text-5xl font-black outline-none min-w-0 w-full"
          />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <p className="text-[11px] opacity-80">
            {walletLoaded
              ? `Available: ${balanceUsd.toFixed(2)} USDC`
              : "Loading balance…"}
          </p>
          <button
            onClick={() => setAmount(balanceUsd.toFixed(2))}
            className="rounded-full bg-white/15 backdrop-blur px-3 py-1 text-[10px] font-semibold"
          >
            Max
          </button>
        </div>
      </div>

      {insufficientBalance && (
        <p className="mt-3 text-xs text-destructive">
          That's more than your available balance.
        </p>
      )}

      <div className="mt-auto pt-6">
        <button
          disabled={usd <= 0 || insufficientBalance || loading}
          onClick={onNext}
          className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-semibold text-primary-foreground disabled:opacity-40 shadow-(--shadow-elegant)"
          style={{ background: "var(--gradient-portfolio)" }}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Review withdrawal <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Cashing out to {country.name} · {country.currency}
        </p>
      </div>
    </div>
  );
}

// ── Review step ───────────────────────────────────────────────────────────────

function ReviewStep({
  country,
  usd,
  quote,
  confirming,
  onConfirm,
  onRefreshQuote,
}: {
  country: CountryConfig;
  usd: number;
  quote: PayoutQuote;
  confirming: boolean;
  onConfirm: () => void;
  onRefreshQuote: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col px-5 pt-5 pb-6">
      <div className="rounded-3xl border border-border bg-card overflow-hidden">
        <FxReviewHero
          usd={usd}
          quote={quote}
          onRefreshQuote={onRefreshQuote}
          icon={ArrowDownToLine}
          fromLabel="You withdraw"
          toLabel="You receive"
        />
        <div className="divide-y divide-border text-xs">
          {quote.recipientName && (
            <KV k="Account name" v={quote.recipientName} />
          )}
          <KV k="Country" v={`${country.name} ${country.flag}`} />
          <KV
            k="Rate"
            v={`1 USDC = ${quote.tumaRate.toFixed(2)} ${quote.toCurrency}`}
          />
          <KV
            k="Minisend fee"
            v={`${quote.toCurrency} ${quote.feeLocal.toFixed(2)}`}
          />
          <KV k="Provider" v="Minisend" />
        </div>
      </div>

      <div className="mt-4 flex justify-center">
        <QuoteCountdown
          lockedUntil={quote.lockedUntil}
          onExpire={onRefreshQuote}
        />
      </div>

      <div className="mt-auto pt-6">
        <button
          onClick={onConfirm}
          disabled={confirming}
          className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-semibold text-primary-foreground shadow-(--shadow-elegant) disabled:opacity-60"
          style={{ background: "var(--gradient-portfolio)" }}
        >
          {confirming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Lock className="h-4 w-4" />
          )}
          {confirming ? "Sending…" : "Confirm withdrawal"}
        </button>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Sent directly from your wallet · No treasury involved
        </p>
      </div>
    </div>
  );
}
