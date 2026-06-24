import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw, Trash2, ExternalLink } from "lucide-react";
import { opsApi } from "@/lib/api";
import { fmtUsd, fmtDate, railLabel } from "@/lib/utils";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { PageHeader, LoadingSpinner, ErrorDisplay, Pagination, EmptyState } from "@/components/Layout";

export const Route = createFileRoute("/dead-letter")({ component: DeadLetterPage });

export default function DeadLetterPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ["dead-letter", page],
    queryFn: () => opsApi.deadLetter.list(page, 50),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["dead-letter"] });

  const retry = useMutation({
    mutationFn: (id: string) => opsApi.deadLetter.retry(id),
    onSuccess: () => { toast.success("Job re-queued for retry"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const discard = useMutation({
    mutationFn: (id: string) => opsApi.deadLetter.discard(id),
    onSuccess: () => { toast.success("Job discarded"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Dead Letter Queue"
        description={data ? `${data.pagination.total} failed disbursement jobs` : undefined}
      />

      {isLoading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorDisplay error={error as Error} />
      ) : items.length === 0 ? (
        <EmptyState title="Dead letter queue is empty" description="All disbursement jobs succeeded." />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Transaction</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Rail</TableHead>
                <TableHead>Failure Stage</TableHead>
                <TableHead>Failure Reason</TableHead>
                <TableHead>Failed At</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.transactionId}>
                  <TableCell className="font-mono text-xs">
                    <div>{item.reference}</div>
                    <div className="text-muted-foreground text-[10px]">
                      {item.providerIdempotencyKey.slice(0, 16)}…
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{item.recipientPhone}</TableCell>
                  <TableCell>
                    <div>{item.amountLocal.toLocaleString()} {item.localCurrency}</div>
                  </TableCell>
                  <TableCell>{railLabel(item.rail)}</TableCell>
                  <TableCell>
                    <span className="text-xs font-mono text-orange-600">
                      {item.failureStage ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs text-muted-foreground max-w-[220px]">
                      <p className="truncate">{item.failureReason ?? "—"}</p>
                      {item.reviewMetadata && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-primary text-[10px]">Metadata</summary>
                          <pre className="text-[10px] bg-muted rounded p-1 mt-1 overflow-x-auto">
                            {JSON.stringify(item.reviewMetadata, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.failedAt ? fmtDate(item.failedAt) : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => retry.mutate(item.transactionId)}
                        disabled={retry.isPending}
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        <RefreshCw className="h-3 w-3" /> Retry
                      </button>
                      <button
                        onClick={() => discard.mutate(item.transactionId)}
                        disabled={discard.isPending}
                        className="text-xs text-destructive hover:underline flex items-center gap-1"
                      >
                        <Trash2 className="h-3 w-3" /> Discard
                      </button>
                      <Link
                        to="/transactions/$id"
                        params={{ id: item.transactionId }}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {data && (
            <Pagination page={data.pagination.page} pages={data.pagination.pages} onPage={setPage} />
          )}
        </>
      )}
    </div>
  );
}
