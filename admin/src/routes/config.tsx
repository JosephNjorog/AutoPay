import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/config")({ component: ConfigPage });

const RAILS = ["mpesa", "momo", "paystack", "wave", "orange_money", "bank", "crypto"];
const COUNTRIES = [
  { code: "KE", name: "Kenya", rails: ["mpesa"], currency: "KES" },
  { code: "NG", name: "Nigeria", rails: ["momo", "paystack"], currency: "NGN" },
  { code: "GH", name: "Ghana", rails: ["momo", "paystack"], currency: "GHS" },
  { code: "UG", name: "Uganda", rails: ["momo"], currency: "UGX" },
  { code: "TZ", name: "Tanzania", rails: ["mpesa"], currency: "TZS" },
  { code: "SN", name: "Senegal", rails: ["wave", "orange_money"], currency: "XOF" },
];

export default function ConfigPage() {
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

        {/* Rails */}
        <Card>
          <CardHeader><CardTitle>Supported Rails</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {RAILS.map((r) => (
                <Badge key={r} variant="outline" className="font-mono">{r}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Countries */}
        <Card>
          <CardHeader><CardTitle>Supported Countries</CardTitle></CardHeader>
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
                    {c.rails.map((r) => (
                      <Badge key={r} variant="info" className="text-[10px] font-mono">{r}</Badge>
                    ))}
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
