import {
  createFileRoute,
  Link,
  useNavigate,
  redirect,
} from "@tanstack/react-router";
import { useSessionStore } from "@/stores/sessionStore";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Search,
  UserPlus,
  Check,
  ArrowRight,
  Loader2,
  Lock,
  Send as SendIcon,
  MessageCircle,
  AlertCircle,
  BookUser,
  X,
  Download,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageFrame } from "@/components/PageFrame";
import { midRates, type Contact } from "@/lib/tuma-data";
import { api, type FxQuote, type Corridor, ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { usePwaInstall } from "@/lib/use-pwa-install";
import {
  QuoteCountdown,
  KV,
  FxQuoteSummaryCard,
  FxReviewHero,
} from "@/components/FxTransparencyCard";
import { TokenStep } from "@/components/TokenStep";
import { TopUpFromWallet } from "@/components/TopUpFromWallet";
import type { PayableAsset } from "@tuma/shared";

type SendSearch = { to?: string; amount?: string };

export const Route = createFileRoute("/send")({
  beforeLoad: () => {
    const s = useSessionStore.getState();
    if (!s.isAuthenticated() || !s.is_unlocked) {
      sessionStorage.setItem("autopayke_redirect_to", "/send");
      throw redirect({ to: "/login", replace: true });
    }
  },
  head: () => ({
    meta: [
      { title: "Send · Autopayke" },
      {
        name: "description",
        content: "Send money to any African phone number.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): SendSearch => ({
    to: typeof search.to === "string" ? search.to : undefined,
    amount: typeof search.amount === "string" ? search.amount : undefined,
  }),
  component: SendPage,
});

type Step =
  | "country"
  | "pick"
  | "verify"
  | "token"
  | "amount"
  | "review"
  | "sending"
  | "done";

function SendPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { accessToken, isLoggedIn } = useAuthStore();
  const { canInstall, install } = usePwaInstall();
  const [step, setStep] = useState<Step>("country");
  const [country, setCountry] = useState<Corridor | null>(null);
  const [recipient, setRecipient] = useState<Contact | null>(null);
  const [token, setToken] = useState<PayableAsset>("USDC");
  const [amount, setAmount] = useState("25");
  const [note, setNote] = useState("");
  const [quote, setQuote] = useState<FxQuote | null>(null);
  const [sendResult, setSendResult] = useState<{
    id: string;
    type: "direct" | "escrow";
    rail: string;
    amountLocal: number;
    localCurrency: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const usd = Number(amount) || 0;

  useEffect(() => {
    if (!isLoggedIn()) navigate({ to: "/signup" });
  }, [isLoggedIn, navigate]);

  const { data: corridors } = useQuery({
    queryKey: ["send-corridors"],
    queryFn: () => api.send.corridors(accessToken!),
    enabled: !!accessToken,
    staleTime: 5 * 60_000,
  });

  // Arrived from a scanned QR (or a deep link) with a recipient pre-filled —
  // derive the destination country from the corridors config once loaded and
  // skip straight to amount entry.
  useEffect(() => {
    if (!search.to || !corridors) return;
    const matched = corridors.find((c) => search.to!.startsWith(c.dial));
    if (!matched) return;
    setCountry(matched);
    setRecipient({
      id: "scanned",
      name: search.to,
      msisdn: search.to,
      country: matched.name,
      flag: matched.flag,
      rail: matched.rail,
    });
    if (search.amount) setAmount(search.amount);
    setStep("token");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corridors]);

  const { data: wallet } = useQuery({
    queryKey: ["wallet"],
    queryFn: () => api.wallet.get(accessToken!),
    enabled: !!accessToken,
  });

  // AutopayEscrow (which backs sends to recipients who aren't registered yet)
  // is ERC20-only, so AVAX is only offered once the recipient is a verified
  // existing Autopayke user. `registered` is unset for the scanned-QR path,
  // which correctly defaults to "no AVAX" too.
  const canUseAvax = recipient?.registered === true;
  const tokenAssets = (wallet?.assets ?? []).filter(
    (a) => parseFloat(a.balance) > 0 && (a.symbol !== "AVAX" || canUseAvax),
  );
  const selectedAsset = wallet?.assets?.find((a) => a.symbol === token);
  const maxBalance = selectedAsset ? parseFloat(selectedAsset.balance) : 0;
  // In USD terms (not raw token units) so the "can I afford this" check works
  // the same way for AVAX (volatile, 18dp) as it does for USDC/USDT (1:1).
  const maxBalanceUsd = selectedAsset?.balanceUsd ?? 0;

  async function handleQuoteAndReview() {
    if (!recipient || !accessToken || usd <= 0) return;
    setError(null);
    setStep("sending");
    try {
      const q = await api.fx.quote(usd, recipient.msisdn, token, accessToken);
      setQuote(q);
      setStep("review");
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Couldn't get quote. Try again.",
      );
      setStep("amount");
    }
  }

  // Re-fetches the quote in place (no step change) when the lock TTL expires
  // while the user is still reviewing amount/review — keeps the quoted rate
  // from going stale out from under them.
  async function refreshQuote() {
    if (!recipient || !accessToken || usd <= 0) return;
    try {
      const q = await api.fx.quote(usd, recipient.msisdn, token, accessToken);
      setQuote(q);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Rate expired — couldn't refresh. Try again.",
      );
    }
  }

  async function handleSend() {
    if (!quote || !recipient || !accessToken) return;
    setError(null);
    setStep("sending");
    try {
      const result = await api.send.send(
        {
          quoteId: quote.quoteId,
          recipientPhone: recipient.msisdn,
          amountUsd: usd,
          token,
          note: note || undefined,
        },
        accessToken,
      );
      setSendResult({
        id: result.transactionId,
        type: result.type,
        rail: result.rail,
        amountLocal: result.amountLocal,
        localCurrency: result.localCurrency,
      });
      setStep("done");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Send failed. Try again.");
      setStep("review");
    }
  }

  function handleBack() {
    if (step === "country") navigate({ to: "/dashboard" });
    else if (step === "pick") setStep("country");
    else if (step === "verify") setStep("pick");
    else if (step === "token")
      setStep(recipient?.id === "scanned" ? "country" : "pick");
    else if (step === "amount") setStep("token");
    else if (step === "review") setStep("amount");
    else navigate({ to: "/dashboard" });
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
            {step === "country" && "Send money"}
            {step === "pick" && "Choose recipient"}
            {step === "verify" && "Verify recipient"}
            {step === "token" && "Pay with"}
            {step === "amount" && "Enter amount"}
            {step === "review" && "Review & confirm"}
            {(step === "sending" || step === "done") && "Sending"}
          </h1>
          <div className="w-9" />
        </header>

        {error && (
          <div className="mx-5 mt-3 flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {step === "country" && (
          <CountryStep
            accessToken={accessToken}
            corridors={corridors}
            onPick={(c) => {
              setCountry(c);
              setStep("pick");
            }}
          />
        )}

        {step === "pick" && country && (
          <PickRecipient
            accessToken={accessToken}
            country={country}
            onPick={(c) => {
              setRecipient(c);
              setStep("verify");
            }}
          />
        )}

        {step === "verify" && country && recipient && (
          <VerifyRecipientStep
            accessToken={accessToken}
            country={country}
            recipient={recipient}
            onConfirmed={() => setStep("token")}
            onRejected={() => {
              setRecipient(null);
              setStep("pick");
            }}
          />
        )}

        {step === "token" && (
          <TokenStep
            assets={tokenAssets}
            onPick={(t) => {
              setToken(t);
              setStep("amount");
            }}
          />
        )}

        {step === "amount" && recipient && country && (
          <AmountStep
            recipient={recipient}
            country={country}
            amount={amount}
            setAmount={setAmount}
            usd={usd}
            token={token}
            maxBalance={maxBalance}
            maxBalanceUsd={maxBalanceUsd}
            quote={quote}
            onRefreshQuote={refreshQuote}
            onNext={handleQuoteAndReview}
          />
        )}

        {step === "review" && recipient && country && quote && (
          <ReviewStep
            recipient={recipient}
            country={country}
            usd={usd}
            quote={quote}
            note={note}
            setNote={setNote}
            onSend={handleSend}
            onRefreshQuote={refreshQuote}
          />
        )}

        {step === "sending" && (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <div className="relative h-24 w-24">
              <div
                className="absolute inset-0 rounded-full opacity-40 blur-2xl"
                style={{ background: "var(--gradient-portfolio)" }}
              />
              <div
                className="relative h-full w-full rounded-full flex items-center justify-center text-primary-foreground"
                style={{ background: "var(--gradient-portfolio)" }}
              >
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            </div>
            <h2 className="mt-6 text-2xl font-black">
              {quote
                ? `Sending to ${recipient?.msisdn.slice(-4)}`
                : "Getting quote…"}
            </h2>
            {quote && (
              <p className="mt-2 text-xs text-muted-foreground">
                Broadcasting on Avalanche → routing to {quote.rail}
              </p>
            )}
          </div>
        )}

        {step === "done" && sendResult && recipient && (
          <div className="flex-1 flex flex-col p-5">
            <div className="mt-8 flex flex-col items-center text-center">
              <div className="h-20 w-20 rounded-full bg-success-soft flex items-center justify-center">
                <Check className="h-10 w-10 text-success" />
              </div>
              <h2 className="mt-6 text-3xl font-black">
                {sendResult.type === "direct" ? "Sent!" : "Link sent!"}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {sendResult.type === "direct"
                  ? `${sendResult.localCurrency} ${sendResult.amountLocal.toLocaleString("en-US", { maximumFractionDigits: 2 })} is settling via ${sendResult.rail}.`
                  : `We texted ${recipient.msisdn} a claim link. Funds stay in escrow until they verify their number.`}
              </p>
            </div>

            {sendResult.type === "escrow" && (
              <div className="mt-6 rounded-2xl border border-border bg-card p-4 flex items-start gap-3">
                <MessageCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">SMS preview</p>
                  <p className="mt-1 text-[11px] text-muted-foreground italic">
                    "Someone sent you {sendResult.localCurrency}{" "}
                    {sendResult.amountLocal.toFixed(2)} on Autopayke. Tap to
                    claim: autopayke.com/claim/…"
                  </p>
                </div>
              </div>
            )}

            {canInstall && (
              <button
                onClick={install}
                className="mt-6 w-full flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left hover:bg-muted/50 transition"
              >
                <div className="h-10 w-10 rounded-full bg-primary-soft flex items-center justify-center shrink-0">
                  <Download className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">Install Autopayke</p>
                  <p className="text-[11px] text-muted-foreground">
                    One tap for faster, full-screen access next time.
                  </p>
                </div>
              </button>
            )}

            <div className="mt-auto pt-6 space-y-2">
              <Link
                to="/track/$id"
                params={{ id: sendResult.id }}
                className="w-full block text-center rounded-2xl px-6 py-4 text-sm font-semibold text-primary-foreground shadow-(--shadow-elegant)"
                style={{ background: "var(--gradient-portfolio)" }}
              >
                Track settlement
              </Link>
              <Link
                to="/dashboard"
                className="w-full block text-center rounded-2xl border border-border bg-card py-4 text-sm font-semibold"
              >
                Back to home
              </Link>
            </div>
          </div>
        )}
        <div className="h-6" />
      </div>
    </PageFrame>
  );
}

// ── Country step ─────────────────────────────────────────────────────────────

function CountryStep({
  accessToken,
  corridors,
  onPick,
}: {
  accessToken: string | null;
  corridors: Corridor[] | undefined;
  onPick: (c: Corridor) => void;
}) {
  const [q, setQ] = useState("");

  // Recent destination countries, derived from real send history — no
  // separate backend concept needed.
  const { data: history } = useQuery({
    queryKey: ["history", "out", "recents"],
    queryFn: () => api.history.list(accessToken!, { filter: "out", limit: 20 }),
    enabled: !!accessToken,
  });

  const recents: Corridor[] = [];
  if (corridors && history) {
    const seen = new Set<string>();
    for (const tx of history.transactions) {
      const match = corridors.find((c) => tx.counterparty.startsWith(c.dial));
      if (!match || seen.has(match.code)) continue;
      seen.add(match.code);
      recents.push(match);
      if (recents.length >= 3) break;
    }
  }

  const filtered = (corridors ?? []).filter(
    (c) =>
      !q ||
      c.name.toLowerCase().includes(q.toLowerCase()) ||
      c.code.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="flex-1 flex flex-col px-5 pt-5 pb-6">
      <div className="flex items-center gap-2 rounded-2xl bg-card border border-border px-4 py-3">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search countries"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      {!corridors && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {recents.length > 0 && !q && (
        <div className="mt-5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Recent
          </p>
          <div className="flex flex-wrap gap-2">
            {recents.map((c) => (
              <button
                key={c.code}
                onClick={() => onPick(c)}
                className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted/50 transition"
              >
                <span>{c.flag}</span>
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 flex-1 space-y-2">
        {filtered.map((c) => (
          <button
            key={c.code}
            onClick={() => onPick(c)}
            className="w-full flex items-center gap-3 rounded-2xl border border-border bg-card hover:bg-muted/50 p-3.5 text-left transition"
          >
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-xl">
              {c.flag}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{c.name}</p>
              <p className="text-[11px] text-muted-foreground">
                {c.dial} · {c.currency}
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
        {corridors && filtered.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No match for "{q}"
          </p>
        )}
      </div>
    </div>
  );
}

// ── Recipient identification ────────────────────────────────────────────────

// Normalizes free-typed input against the already-selected destination
// country, returning a canonical E.164 msisdn or null if it doesn't match
// that country's expected format.
function normalizeToCountry(input: string, country: Corridor): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  const dialDigits = country.dial.replace("+", "");
  let national: string;
  if (digits.startsWith(country.dial))
    national = digits.slice(country.dial.length);
  else if (digits.startsWith(dialDigits))
    national = digits.slice(dialDigits.length);
  else if (digits.startsWith("+"))
    return null; // a different country's code was typed
  else if (digits.startsWith("0")) national = digits.slice(1);
  else national = digits;

  if (!/^\d+$/.test(national) || national.length !== country.phoneLength)
    return null;
  return country.dial + national;
}

function PickRecipient({
  accessToken,
  country,
  onPick,
}: {
  accessToken: string | null;
  country: Corridor;
  onPick: (c: Contact) => void;
}) {
  const [q, setQ] = useState("");
  const [importing, setImporting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [pendingContact, setPendingContact] = useState<{
    name: string;
    rawNumber: string;
  } | null>(null);
  const [debouncedPhone, setDebouncedPhone] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasContactPicker =
    typeof navigator !== "undefined" && "contacts" in (navigator as any);

  // Recent recipients within this destination country, built from real send
  // history — no mock contacts.
  const { data: history } = useQuery({
    queryKey: ["history", "out", "recents"],
    queryFn: () => api.history.list(accessToken!, { filter: "out", limit: 20 }),
    enabled: !!accessToken,
  });

  const recents: Contact[] = [];
  const seen = new Set<string>();
  for (const tx of history?.transactions ?? []) {
    if (!tx.counterparty.startsWith(country.dial) || seen.has(tx.counterparty))
      continue;
    seen.add(tx.counterparty);
    recents.push({
      id: tx.id,
      name: tx.counterparty,
      msisdn: tx.counterparty,
      country: country.name,
      flag: country.flag,
      rail: tx.rail,
    });
  }

  const filtered = q
    ? recents.filter(
        (c) =>
          c.name.toLowerCase().includes(q.toLowerCase()) ||
          c.msisdn.includes(q),
      )
    : recents;

  const normalized = normalizeToCountry(q, country);
  const noMatch = filtered.length === 0;
  const newContact = !!normalized && noMatch;

  // Debounce the phone input by 400 ms before firing the lookup query.
  useEffect(() => {
    if (!normalized) {
      setDebouncedPhone("");
      return;
    }
    const t = setTimeout(() => setDebouncedPhone(normalized), 400);
    return () => clearTimeout(t);
  }, [normalized]);

  const { data: lookupData, isFetching: lookupFetching } = useQuery({
    queryKey: ["lookup", debouncedPhone],
    queryFn: () => api.send.lookup(debouncedPhone, accessToken!),
    enabled: !!debouncedPhone && !!accessToken,
    staleTime: 60_000,
  });

  const isRegistered = lookupData?.registered;
  // True while the debounce hasn't settled or the request is in-flight.
  const lookupPending =
    (!!normalized && debouncedPhone === "") || lookupFetching;

  async function finalizePick(name: string, msisdn: string) {
    let registered: boolean | undefined;
    try {
      if (accessToken)
        registered = (await api.send.lookup(msisdn, accessToken)).registered;
    } catch {
      /* non-fatal */
    }
    onPick({
      id: "new",
      name,
      msisdn,
      country: country.name,
      flag: country.flag,
      rail: country.rail,
      registered,
    });
  }

  async function importFromContacts() {
    if (!hasContactPicker) return;
    setInlineError(null);
    setImporting(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results = await (navigator as any).contacts.select(
        ["name", "tel"],
        { multiple: false },
      );
      if (results.length > 0) {
        const first = results[0];
        const raw = (first.tel?.[0] ?? "").replace(/[\s\-().]/g, "");
        const name = first.name?.[0] ?? raw;
        const hasCallingCode = raw.startsWith("+") || raw.startsWith("00");

        if (!hasCallingCode) {
          // No country calling code on this number — confirm against the
          // selected destination country rather than silently guessing.
          setPendingContact({ name, rawNumber: raw });
          return;
        }

        const e164 = raw.startsWith("00") ? "+" + raw.slice(2) : raw;
        const msisdn = normalizeToCountry(e164, country);
        if (!msisdn) {
          setInlineError(
            `That contact's number doesn't look like a ${country.name} number.`,
          );
          return;
        }
        await finalizePick(name, msisdn);
      }
    } catch {
      // user dismissed or permission denied
    } finally {
      setImporting(false);
    }
  }

  function confirmPendingContact() {
    if (!pendingContact) return;
    const msisdn = normalizeToCountry(pendingContact.rawNumber, country);
    setPendingContact(null);
    if (!msisdn) {
      setInlineError(
        `That contact's number doesn't look like a ${country.name} number.`,
      );
      return;
    }
    finalizePick(pendingContact.name, msisdn);
  }

  return (
    <>
      <div className="px-5 pt-5">
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          <span>{country.flag}</span>
          <span>
            Sending to {country.name} · {country.dial}
          </span>
        </div>

        {pendingContact && (
          <div className="mt-3 rounded-2xl border border-primary/30 bg-primary-soft/30 p-4">
            <p className="text-sm font-semibold">
              "{pendingContact.rawNumber}" doesn't have a country code — treat
              it as a {country.name} number ({country.dial})?
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={confirmPendingContact}
                className="flex-1 rounded-xl bg-primary py-2 text-xs font-semibold text-primary-foreground"
              >
                Yes, use {country.dial}
              </button>
              <button
                onClick={() => setPendingContact(null)}
                className="flex-1 rounded-xl border border-border bg-card py-2 text-xs font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {inlineError && (
          <div className="mt-3 flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {inlineError}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-card border border-border px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Phone number, e.g. ${"0".repeat(country.phoneLength)}`}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {hasContactPicker && (
            <button
              onClick={importFromContacts}
              title="Import from phone contacts"
              className="h-8 w-8 rounded-xl bg-muted flex items-center justify-center shrink-0 hover:bg-primary/10 transition"
            >
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <BookUser className="h-4 w-4 text-primary" />
              )}
            </button>
          )}
        </div>

        {hasContactPicker && (
          <button
            onClick={importFromContacts}
            className="mt-3 w-full flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-left hover:bg-muted/50 transition"
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <BookUser className="h-4 w-4 text-primary" />
            )}
            <span className="text-sm font-semibold">
              Choose from phone contacts
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto" />
          </button>
        )}

        {newContact && (
          <button
            onClick={() => finalizePick(normalized!, normalized!)}
            className={`mt-4 w-full flex items-center gap-3 rounded-2xl border p-4 text-left transition ${
              isRegistered
                ? "border-success/50 bg-success/5"
                : "border-dashed border-primary bg-primary-soft/50"
            }`}
          >
            <div
              className={`h-10 w-10 rounded-full flex items-center justify-center text-primary-foreground ${
                isRegistered ? "bg-success" : "bg-primary"
              }`}
            >
              {lookupPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isRegistered ? (
                <Check className="h-4 w-4" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">
                Send to {normalized} {country.flag}
              </p>
              {lookupPending ? (
                <p className="text-[11px] text-muted-foreground">
                  Checking Autopayke…
                </p>
              ) : isRegistered ? (
                <p className="text-[11px] text-success font-medium">
                  On Autopayke · instant settlement
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Not on Autopayke yet — we'll text them a claim link
                </p>
              )}
            </div>
            <ArrowRight
              className={`h-4 w-4 ${isRegistered ? "text-success" : "text-primary"}`}
            />
          </button>
        )}
      </div>

      <div className="px-5 mt-5 flex-1">
        {filtered.length > 0 && (
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Recent
          </p>
        )}
        <div className="space-y-2">
          {filtered.map((c) => (
            // Recents are built from send history, which doesn't carry
            // registration status — resolve it fresh on pick (same lookup
            // finalizePick already does for a typed number) rather than
            // defaulting to "unregistered", which would wrongly hide AVAX
            // as a send option for a recipient who's actually registered.
            <button
              key={c.id}
              onClick={() => finalizePick(c.name, c.msisdn)}
              className="w-full flex items-center gap-3 rounded-2xl border border-border bg-card hover:bg-muted/50 p-3.5 text-left transition"
            >
              <div className="relative h-11 w-11 rounded-full bg-muted flex items-center justify-center text-xl">
                {c.flag}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{c.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {c.msisdn} · {c.rail}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
          {filtered.length === 0 && !newContact && q && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No match for "{q}"
            </p>
          )}
          {filtered.length === 0 && !newContact && !q && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No recent recipients in {country.name} yet — type a phone number
              or import from contacts above.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

// ── Recipient name verification ──────────────────────────────────────────────

function VerifyRecipientStep({
  accessToken,
  country,
  recipient,
  onConfirmed,
  onRejected,
}: {
  accessToken: string | null;
  country: Corridor;
  recipient: Contact;
  onConfirmed: () => void;
  onRejected: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["verify-recipient", recipient.msisdn, country.code],
    queryFn: () =>
      api.send.verifyRecipient(recipient.msisdn, country.code, accessToken!),
    enabled: !!accessToken,
  });

  // If a registered name can't be resolved (the case for every rail today),
  // skip this step gracefully rather than block the send flow.
  useEffect(() => {
    if (!isLoading && data && !data.available) onConfirmed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, data]);

  if (isLoading || !data || !data.available) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="mt-3 text-xs text-muted-foreground">
          Verifying recipient…
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col px-5 pt-5 pb-6">
      <div className="rounded-3xl border border-border bg-card p-5 text-center">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Sending to
        </p>
        <p className="mt-2 text-2xl font-black">{data.recipientName}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {recipient.msisdn} {country.flag}
        </p>
        <p className="mt-3 text-sm font-semibold">Is this correct?</p>
      </div>
      <div className="mt-auto pt-6 space-y-2">
        <button
          onClick={onConfirmed}
          className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-semibold text-primary-foreground shadow-(--shadow-elegant)"
          style={{ background: "var(--gradient-portfolio)" }}
        >
          <Check className="h-4 w-4" /> Yes, that's them
        </button>
        <button
          onClick={onRejected}
          className="w-full flex items-center justify-center gap-2 rounded-2xl border border-border bg-card py-4 text-sm font-semibold"
        >
          <X className="h-4 w-4" /> Not them — go back
        </button>
      </div>
    </div>
  );
}

// ── Amount step with currency toggle ─────────────────────────────────────────

type AmountMode = "usdc" | "local";

const LOCAL_QUICK_AMOUNTS: Record<string, number[]> = {
  KE: [500, 1_000, 2_500, 5_000],
  TZ: [2_000, 5_000, 10_000, 25_000],
  GH: [50, 100, 250, 500],
  NG: [2_000, 5_000, 10_000, 25_000],
  UG: [10_000, 25_000, 50_000, 100_000],
  SN: [2_000, 5_000, 10_000, 25_000],
  CI: [2_000, 5_000, 10_000, 25_000],
};

function fmtQuick(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

function AmountStep({
  recipient,
  country,
  amount,
  setAmount,
  usd,
  token,
  maxBalance,
  maxBalanceUsd,
  quote,
  onRefreshQuote,
  onNext,
}: {
  recipient: Contact;
  country: Corridor;
  amount: string;
  setAmount: (v: string) => void;
  usd: number;
  token: PayableAsset;
  maxBalance: number;
  maxBalanceUsd: number;
  quote: FxQuote | null;
  onRefreshQuote: () => void;
  onNext: () => void;
}) {
  const [mode, setMode] = useState<AmountMode>("usdc");
  const [localInput, setLocalInput] = useState("");

  const localRate = midRates[country.code]?.rate ?? null;
  const quickLocal = LOCAL_QUICK_AMOUNTS[country.code] ?? [
    500, 1_000, 2_500, 5_000,
  ];

  function switchMode(next: AmountMode) {
    if (next === "local" && localRate) {
      setLocalInput(((parseFloat(amount) || 0) * localRate).toFixed(0));
    }
    setMode(next);
  }

  function handleLocalChange(v: string) {
    setLocalInput(v);
    if (localRate) {
      const usdc = (parseFloat(v) || 0) / localRate;
      setAmount(usdc.toFixed(6));
    }
  }

  function handleQuickAmount(v: number) {
    if (mode === "local") {
      setLocalInput(String(v));
      if (localRate) setAmount((v / localRate).toFixed(6));
    } else {
      setAmount(String(v));
    }
  }

  const displayValue = mode === "local" ? localInput : amount;
  const displayCurrency = mode === "local" ? country.currency : token;

  // Insufficient AutoPayKe balance for the entered amount — the token
  // quantity actually needed comes straight from the FX quote for AVAX
  // (non-1:1 with USD), or is just `usd` itself for the 1:1-pegged tokens.
  // Also folds in the network fee (charged on top of the send amount) once
  // the quote has loaded, so the balance/top-up UI doesn't undercount it.
  const networkFeeUsd = quote?.networkFeeUsd ?? 0;
  const feeTokenAmount =
    token === "AVAX"
      ? quote?.tokenPriceUsd
        ? networkFeeUsd / quote.tokenPriceUsd
        : 0
      : networkFeeUsd;
  const insufficientBalance = usd > 0 && usd + networkFeeUsd > maxBalanceUsd;
  const quoteReady = token !== "AVAX" || quote?.tokenAmount != null;
  const neededTokenAmount =
    (token === "AVAX" ? (quote?.tokenAmount ?? 0) : usd) + feeTokenAmount;
  const tokenShortfall = Math.max(0, neededTokenAmount - maxBalance);

  return (
    <div className="flex-1 flex flex-col px-5 pt-5 pb-6">
      {/* Recipient row */}
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-lg">
          {country.flag}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">
            {recipient.name !== recipient.msisdn
              ? recipient.name
              : recipient.msisdn}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {recipient.msisdn}
          </p>
        </div>
      </div>

      {/* Amount card with toggle */}
      <div
        className="mt-6 rounded-3xl p-5 text-primary-foreground shadow-(--shadow-elegant)"
        style={{ background: "var(--gradient-portfolio)" }}
      >
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs opacity-90">You send</p>
          <div className="flex items-center rounded-full bg-white/20 p-0.5">
            <button
              onClick={() => switchMode("usdc")}
              className={`rounded-full px-3 py-1 text-[10px] font-bold transition ${mode === "usdc" ? "bg-white text-foreground shadow" : "text-white/70"}`}
            >
              {token}
            </button>
            <button
              onClick={() => switchMode("local")}
              className={`rounded-full px-3 py-1 text-[10px] font-bold transition ${mode === "local" ? "bg-white text-foreground shadow" : "text-white/70"}`}
            >
              {country.currency}
            </button>
          </div>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-xl font-black opacity-80">
            {displayCurrency}
          </span>
          <input
            value={displayValue}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.]/g, "");
              if (mode === "local") handleLocalChange(v);
              else setAmount(v);
            }}
            inputMode="decimal"
            className="bg-transparent text-5xl font-black outline-none min-w-0 w-full"
          />
        </div>

        {mode === "local" && localRate && (
          <p className="mt-1 text-[11px] opacity-80">
            ≈ {((parseFloat(localInput) || 0) / localRate).toFixed(2)} {token}
          </p>
        )}
        {mode === "usdc" && (
          <p className="mt-2 text-[11px] opacity-80">
            Available: {maxBalance.toFixed(2)} {token}
          </p>
        )}

        <div className="mt-3 flex gap-2">
          {(mode === "local" ? quickLocal : [10, 25, 50, 100]).map((v) => (
            <button
              key={v}
              onClick={() => handleQuickAmount(v)}
              className="flex-1 rounded-full bg-white/15 backdrop-blur py-1.5 text-xs font-semibold"
            >
              {mode === "local" ? fmtQuick(v) : `${v}`}
            </button>
          ))}
        </div>
      </div>

      {insufficientBalance && quoteReady && (
        <TopUpFromWallet token={token} tokenShortfall={tokenShortfall} />
      )}

      {quote && (
        <FxQuoteSummaryCard
          quote={quote}
          usd={usd}
          onRefreshQuote={onRefreshQuote}
        />
      )}

      <div className="mt-auto pt-6">
        <button
          disabled={usd <= 0 || insufficientBalance}
          onClick={onNext}
          className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-semibold text-primary-foreground disabled:opacity-40 shadow-(--shadow-elegant)"
          style={{ background: "var(--gradient-portfolio)" }}
        >
          Review transfer <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Review step ───────────────────────────────────────────────────────────────

function ReviewStep({
  recipient,
  country,
  usd,
  quote,
  note,
  setNote,
  onSend,
  onRefreshQuote,
}: {
  recipient: Contact;
  country: Corridor;
  usd: number;
  quote: FxQuote;
  note: string;
  setNote: (v: string) => void;
  onSend: () => void;
  onRefreshQuote: () => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    setLoading(true);
    await onSend();
    setLoading(false);
  }

  return (
    <div className="flex-1 flex flex-col px-5 pt-5 pb-6">
      <div className="rounded-3xl border border-border bg-card overflow-hidden">
        <FxReviewHero
          usd={usd}
          quote={quote}
          onRefreshQuote={onRefreshQuote}
          icon={SendIcon}
        />
        <div className="divide-y divide-border text-xs">
          <KV
            k="To"
            v={`${recipient.name !== recipient.msisdn ? recipient.name : recipient.msisdn} ${country.flag}`}
          />
          <KV k="Number" v={recipient.msisdn} mono />
          <KV
            k="Paying with"
            v={
              quote.tokenAmount !== undefined
                ? `${quote.tokenAmount.toFixed(4)} ${quote.fromToken}`
                : quote.fromToken
            }
          />
          <KV k="Settles via" v={quote.rail} />
          <KV
            k="Rate"
            v={`1 USD = ${quote.tumaRate.toFixed(2)} ${quote.toCurrency}`}
          />
          <KV k="Network fee" v="Free" />
          <KV k="Arrival" v="≈ 12 seconds" />
        </div>
      </div>

      <label className="mt-4 block rounded-2xl border border-border bg-card p-3.5">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Add a note (optional)
        </span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Rent · groceries · birthday 🎁"
          className="mt-1 w-full bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground/50"
        />
      </label>

      <div className="mt-auto pt-6">
        <button
          onClick={handleSend}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-semibold text-primary-foreground shadow-(--shadow-elegant) disabled:opacity-60"
          style={{ background: "var(--gradient-portfolio)" }}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Lock className="h-4 w-4" />
          )}
          {loading ? "Processing…" : "Confirm & send"}
        </button>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Signed on-device · Settled on Avalanche
        </p>
      </div>
    </div>
  );
}
