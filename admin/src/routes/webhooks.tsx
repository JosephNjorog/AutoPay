import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyState } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/webhooks")({ component: WebhooksPage });

export default function WebhooksPage() {
  return (
    <div>
      <PageHeader
        title="Webhook Inspector"
        description="Inbound Paystack and rail webhook events"
      />
      <div className="p-6 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Recent Webhooks</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              title="Webhook log not yet persisted"
              description="Add a webhook_log table and persist events in the Paystack / M-Pesa / MoMo webhook handlers to see them here."
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Webhook Configuration</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Endpoints configured:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><code className="text-foreground text-xs">/webhooks/paystack</code> — charge.success, transfer.success/failed</li>
                <li><code className="text-foreground text-xs">/webhooks/mpesa</code> — M-Pesa result callbacks</li>
                <li><code className="text-foreground text-xs">/webhooks/momo</code> — MoMo callbacks</li>
                <li><code className="text-foreground text-xs">/webhooks/pretium/offramp</code> — send/withdraw/pay payout result</li>
                <li><code className="text-foreground text-xs">/webhooks/pretium/onramp</code> — funding (add money) result</li>
              </ul>
              <p className="mt-2 text-xs">
                Pretium has no documented webhook signature scheme — both handlers treat the
                payload as a hint and re-fetch authoritative status before crediting anything
                (see backend <code className="text-foreground">pretium.ts</code>).
              </p>
              <p className="mt-3">
                To enable full webhook inspection, create a <code className="text-foreground">webhook_events</code> table
                and log all inbound payloads in the webhook handlers.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
