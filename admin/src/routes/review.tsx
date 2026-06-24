import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw, Send, RotateCcw, ExternalLink } from "lucide-react";
import { opsApi } from "@/lib/api";
import { fmtUsd, fmtDate, railLabel, statusColor } from "@/lib/utils";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader, LoadingSpinner, ErrorDisplay, Pagination, EmptyState } from "@/components/Layout";

export const Route = createFileRoute("/review")({ component: ReviewPage });

export default function ReviewPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery({
    queryKey: ["review", page],
    queryFn: () => opsApi.review.list(page, 50),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["review"] });

  const batchRetry = useMutation({
    mutationFn: (ids: string[]) => opsApi.review.batchRetry(ids),
    onSuccess: (res) => {
      const ok = res.results.filter((r) => r.ok).length;
      const fail = res.results.filter((r) => !r.ok).length;
      toast.success(`Retried ${ok} transaction(s)${fail ? `, ${fail} failed` : ""}`);
      setSelected(new Set());
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const retryOne = useMutation({
    mutationFn: (id: string) => opsApi.review.retryDisbursement(id),
    onSuccess: () => { toast.success("Retry queued"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const resend = useMutation({
    mutationFn: (id: string) => opsApi.review.resendClaimLink(id),
    onSuccess: () => toast.success("Claim link sent"),
    onError: (e: Error) => toast.error(e.message),
  });

  const refund = useMutation({
    mutationFn: (id: string) => opsApi.review.refundEscrow(id),
    onSuccess: () => { toast.success("Refund triggered"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const txs = data?.transactions ?? [];
  const allSelected = txs.length > 0 && selected.size === txs.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(txs.map((t) => t.id)));
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div>
      <PageHeader
        title="Requires Review"
        description={data ? `${data.pagination.total} transactions need attention` : undefined}
        action={
          selected.size > 0 ? (
            <Button
              size="sm"
              onClick={() => batchRetry.mutate([...selected])}
              disabled={batchRetry.isPending}
            >
              <RefreshCw className="h-4 w-4" />
              Retry {selected.size} selected
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorDisplay error={error as Error} />
      ) : txs.length === 0 ? (
        <EmptyState title="No transactions require review" description="All clear!" />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="rounded"
                  />
                </TableHead>
                <TableHead>Reference</TableHead>
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
              {txs.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selected.has(tx.id)}
                      onChange={() => toggle(tx.id)}
                      className="rounded"
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <div>{tx.reference}</div>
                    {tx.isEscrow && <Badge variant="info" className="mt-0.5">escrow</Badge>}
                  </TableCell>
                  <TableCell className="text-sm">{tx.recipientPhone}</TableCell>
                  <TableCell>
                    <div>{fmtUsd(tx.amountUsdc)}</div>
                    <div className="text-xs text-muted-foreground">
                      {tx.amountLocal?.toLocaleString()} {tx.localCurrency}
                    </div>
                  </TableCell>
                  <TableCell>{railLabel(tx.rail)}</TableCell>
                  <TableCell>
                    <span className="text-xs font-mono text-orange-600">
                      {tx.failureStage ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground max-w-[200px] truncate block">
                      {tx.failureReason ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {tx.failedAt ? fmtDate(tx.failedAt) : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => retryOne.mutate(tx.id)}
                        disabled={retryOne.isPending}
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                        title="Retry disbursement"
                      >
                        <RefreshCw className="h-3 w-3" />
                      </button>
                      {tx.isEscrow && (
                        <>
                          <button
                            onClick={() => resend.mutate(tx.id)}
                            disabled={resend.isPending}
                            className="text-xs text-primary hover:underline"
                            title="Resend claim link"
                          >
                            <Send className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => refund.mutate(tx.id)}
                            disabled={refund.isPending}
                            className="text-xs text-orange-600 hover:underline"
                            title="Refund escrow"
                          >
                            <RotateCcw className="h-3 w-3" />
                          </button>
                        </>
                      )}
                      <Link
                        to="/transactions/$id"
                        params={{ id: tx.id }}
                        className="text-xs text-muted-foreground hover:text-foreground"
                        title="View details"
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
