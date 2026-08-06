import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { opsApi } from "@/lib/api";
import { PageHeader, LoadingSpinner } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/config")({ component: ConfigPage });

// Legacy/direct rails — used by Send's fallback path (non-Autopayke recipient
// on the OLD claim-cashout rails, pre-Pretium) and Fund's Paystack card/bank/
// mobile flows. Kept in sync with @tuma/shared's COUNTRY_CONFIG.primaryRail —
// admin doesn't depend on @tuma/shared, so this is a manual mirror, not a
// live read.
const LEGACY_RAILS = ["mpesa", "momo", "paystack", "wave", "orange_money", "bank", "crypto"];

// Withdraw, Merchant Pay, and (opt-in) Fund mobile-money all settle via
// Pretium now — see the "Pretium Markets" card below for which of these are
// actually verified live vs just candidate coverage.
const COUNTRIES = [
  { code: "KE", name: "Kenya", primaryRail: "mpesa", fallbackRail: null, currency: "KES" },
  { code: "GH", name: "Ghana", primaryRail: "momo", fallbackRail: null, currency: "GHS" },
  { code: "NG", name: "Nigeria", primaryRail: "paystack", fallbackRail: null, currency: "NGN" },
  { code: "SN", name: "Senegal", primaryRail: "wave", fallbackRail: "orange_money", currency: "XOF" },
  { code: "CI", name: "Côte d'Ivoire", primaryRail: "orange_money", fallbackRail: null, currency: "XOF" },
  { code: "TZ", name: "Tanzania", primaryRail: "mpesa", fallbackRail: null, currency: "TZS" },
  { code: "UG", name: "Uganda", primaryRail: "momo", fallbackRail: null, currency: "UGX" },
];

function PretiumBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <Badge variant="success" className="text-[10px]">Pretium verified</Badge>
  ) : (
    <Badge variant="outline" className="text-[10px] text-muted-foreground">Pretium not verified</Badge>
  );
}

export default function ConfigPage() {
  const { data: markets, isLoading: marketsLoading } = useQuery({
    queryKey: ["pretium-markets"],
    queryFn: opsApi.pretiumMarkets,
  });

  return (
    <div>
      <PageHeader
        title="System Configuration"
        description="Read-only view — edits require env var changes or a dedicated config table"
      />

      <div className="p-6 space-y-6">
        {/* Environment */}
        <Card>
          <CardHeader><CardTitle>Environment</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">API Base</dt>
                <dd className="font-mono text-xs mt-0.5">{import.meta.env.VITE_API_URL ?? "http://localhost:3001"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Admin Version</dt>
                <dd className="text-xs mt-0.5">1.0.0</dd>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pretium markets — live */}
        <Card>
          <CardHeader>
            <CardTitle>Pretium Markets</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Withdraw, Merchant Pay, and (opt-in) Fund mobile-money all settle via Pretium.
              Verified sets stay empty until a human runs the account-network verification
              script and sets PRETIUM_VERIFIED_OFFRAMP_MARKETS / PRETIUM_VERIFIED_ONRAMP_MARKETS
              — candidate coverage alone does NOT mean a market is live.
            </p>
          </CardHeader>
          <CardContent>
            {marketsLoading ? (
              <LoadingSpinner />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(markets?.candidateMarkets ?? []).map((code) => (
                  <div key={code} className="rounded-lg border border-border p-3">
                    <div className="font-medium text-sm mb-2">{code}</div>
                    <div className="flex flex-wrap gap-1">
                      <PretiumBadge verified={!!markets?.verifiedOfframpMarkets.includes(code)} />
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">Offramp (Withdraw/Pay)</div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      <PretiumBadge verified={!!markets?.verifiedOnrampMarkets.includes(code)} />
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">Onramp (Fund)</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rails */}
        <Card>
          <CardHeader>
            <CardTitle>Legacy/Direct Rails</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Fund's Paystack card/bank/mobile flows, and Send's counterparty-facing display —
              separate from Pretium above.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {LEGACY_RAILS.map((r) => (
                <Badge key={r} variant="outline" className="font-mono">{r}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Countries */}
        <Card>
          <CardHeader><CardTitle>Country Config</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {COUNTRIES.map((c) => (
                <div key={c.code} className="rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium text-sm">{c.name}</span>
                    <Badge variant="secondary" className="text-[10px]">{c.code}</Badge>
                    <Badge variant="outline" className="text-[10px]">{c.currency}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="info" className="text-[10px] font-mono">{c.primaryRail}</Badge>
                    {c.fallbackRail && (
                      <Badge variant="info" className="text-[10px] font-mono">{c.fallbackRail}</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader><CardTitle>Configuration Management</CardTitle></CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground space-y-2">
              <p>To enable dynamic config (toggle rails, set transfer limits, rotate webhook secrets), add:</p>
              <ul className="list-disc list-inside ml-2 space-y-1">
                <li>A <code className="text-foreground">system_config</code> table in Drizzle schema</li>
                <li>Ops endpoints for reading/writing config values</li>
                <li>Config-aware guards in the send/route services</li>
              </ul>
              <p className="mt-2">
                Current limits and rail routing are controlled via environment variables and hardcoded logic
                in the rail service files.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
