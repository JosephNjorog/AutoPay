import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle, XCircle, AlertCircle, RefreshCw } from "lucide-react";
import { opsApi } from "@/lib/api";
import { timeAgo, fmtDate } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, LoadingSpinner, ErrorDisplay } from "@/components/Layout";

export const Route = createFileRoute("/health")({ component: HealthPage });

function StatusIcon({ isStale, status }: { isStale: boolean; status: string }) {
  if (isStale) return <AlertCircle className="h-4 w-4 text-yellow-500" />;
  if (status === "error") return <XCircle className="h-4 w-4 text-red-500" />;
  return <CheckCircle className="h-4 w-4 text-green-500" />;
}

function QueueBar({
  name,
  counts,
}: {
  name: string;
  counts: Record<string, number> | null;
}) {
  if (!counts) {
    return (
      <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
        <span className="text-sm font-mono">{name}</span>
        <span className="text-xs text-muted-foreground">Redis unavailable</span>
      </div>
    );
  }

  const waiting = counts.waiting ?? 0;
  const active = counts.active ?? 0;
  const delayed = counts.delayed ?? 0;
  const failed = counts.failed ?? 0;

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0 gap-4">
      <span className="text-sm font-mono w-36 truncate">{name}</span>
      <div className="flex items-center gap-3 text-xs">
        <span className="text-blue-600">{waiting} waiting</span>
        <span className="text-green-600">{active} active</span>
        <span className="text-orange-500">{delayed} delayed</span>
        {failed > 0 && <span className="text-red-600 font-medium">{failed} failed</span>}
      </div>
    </div>
  );
}

export default function HealthPage() {
  const { data: heartbeatData, isLoading: hbLoading, error: hbError, refetch } = useQuery({
    queryKey: ["heartbeats"],
    queryFn: () => opsApi.health.heartbeats(false),
    refetchInterval: 30_000,
  });

  const { data: queueData, isLoading: qLoading, error: qError } = useQuery({
    queryKey: ["queues"],
    queryFn: opsApi.health.queues,
    refetchInterval: 15_000,
  });

  return (
    <div>
      <PageHeader
        title="Worker & System Health"
        action={
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        }
      />

      <div className="p-6 space-y-6">
        {/* Summary badges */}
        {heartbeatData && (
          <div className="flex items-center gap-3">
            <Badge variant={heartbeatData.staleCount > 0 ? "warning" : "success"}>
              {heartbeatData.staleCount > 0
                ? `${heartbeatData.staleCount} stale workers`
                : "All workers healthy"}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {heartbeatData.totalCount} components tracked
            </span>
          </div>
        )}

        {/* Worker heartbeats */}
        <Card>
          <CardHeader><CardTitle>Worker Heartbeats</CardTitle></CardHeader>
          <CardContent>
            {hbLoading ? (
              <LoadingSpinner />
            ) : hbError ? (
              <ErrorDisplay error={hbError as Error} />
            ) : (
              <div className="space-y-1">
                {heartbeatData?.items.map((item) => (
                  <div
                    key={item.component}
                    className={`flex items-start gap-3 rounded-lg p-3 ${
                      item.isStale ? "bg-yellow-50 dark:bg-yellow-900/10" : "hover:bg-muted/50"
                    }`}
                  >
                    <StatusIcon isStale={item.isStale} status={item.status} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium font-mono">{item.component}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {item.kind}
                        </Badge>
                        {item.isStale && (
                          <Badge variant="warning" className="text-[10px]">STALE</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        <span>Last beat: {timeAgo(item.lastHeartbeatAt)}</span>
                        <span>({item.secondsSinceHeartbeat}s ago)</span>
                        <span>Stale after: {item.staleAfterSeconds}s</span>
                        {item.lastSuccessAt && (
                          <span className="text-green-600">Success: {timeAgo(item.lastSuccessAt)}</span>
                        )}
                        {item.lastFailureAt && (
                          <span className="text-red-600">Failed: {timeAgo(item.lastFailureAt)}</span>
                        )}
                      </div>
                      {item.lastError && (
                        <p className="text-xs text-red-600 mt-1 font-mono">{item.lastError}</p>
                      )}
                    </div>
                  </div>
                ))}
                {heartbeatData?.items.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No heartbeat data yet. Workers may not have started.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Queue depths */}
        <Card>
          <CardHeader><CardTitle>BullMQ Queue Depths</CardTitle></CardHeader>
          <CardContent>
            {qLoading ? (
              <LoadingSpinner />
            ) : qError ? (
              <ErrorDisplay error={qError as Error} />
            ) : (
              <div>
                {Object.entries(queueData?.queues ?? {}).map(([name, counts]) => (
                  <QueueBar key={name} name={name} counts={counts} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
