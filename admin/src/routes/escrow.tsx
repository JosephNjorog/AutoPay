import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Timer, Send, XCircle, ExternalLink } from "lucide-react";
import { opsApi } from "@/lib/api";
import { fmtUsd, fmtDate, statusColor, railLabel } from "@/lib/utils";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PageHeader, LoadingSpinner, ErrorDisplay, Pagination, EmptyState } from "@/components/Layout";

export const Route = createFileRoute("/escrow")({ component: EscrowPage });

function TimeToExpiry({ seconds }: { seconds: number }) {
  if (seconds <= 0) return <span className="text-xs text-red-500">Expired</span>;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const urgent = seconds < 3600;
  return (
    <span className={`text-xs flex items-center gap-1 ${urgent ? "text-orange-600" : "text-muted-foreground"}`}>
      <Timer className="h-3 w-3" />
      {h > 0 ? `${h}h ${m}m` : `${m}m`}
    </span>
  );
}

export default function EscrowPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["escrows", page, status],
    queryFn: () => opsApi.escrows.list({ page, limit: 50, status: status || undefined }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["escrows"] });

  const forceExpire = useMutation({
    mutationFn: (ref: string) => opsApi.escrows.forceExpire(ref),
    onSuccess: () => { toast.success("Escrow force-expired"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const resendLink = useMutation({
    mutationFn: (ref: string) => opsApi.escrows.resendLink(ref),
    onSuccess: () => toast.success("Claim link sent"),
    onError: (e: Error) => toast.error(e.message),
  });

  const escrows = data?.escrows ?? [];

  return (
    <div>
      <PageHeader
        title="Escrow Management"
        description={data ? `${data.pagination.total} escrows` : undefined}
      />

      <div className="px-6 py-4 border-b border-border">
        <Select value={status} onValueChange={(v) => { setStatus(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="claimed">Claimed</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorDisplay error={error as Error} />
      ) : escrows.length === 0 ? (
        <EmptyState title="No escrows found" />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Rail</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expires / Time Left</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {escrows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs">
                    <div>{e.ref}</div>
                    {e.reference && (
                      <div className="text-muted-foreground text-[10px]">{e.reference}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{e.recipientPhone}</TableCell>
                  <TableCell>
                    <div className="font-medium">{fmtUsd(e.amountUsdc)}</div>
                    {e.localCurrency && (
                      <div className="text-xs text-muted-foreground">{e.localCurrency}</div>
                    )}
                  </TableCell>
                  <TableCell>{e.rail ? railLabel(e.rail) : "—"}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(e.status)}`}>
                      {e.status}
                    </span>
                    {e.claimedByWallet && (
                      <div className="text-xs text-muted-foreground mt-0.5 font-mono truncate max-w-[100px]">
                        {e.claimedByWallet.slice(0, 10)}…
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-xs text-muted-foreground">{fmtDate(e.expiresAt)}</div>
                    {e.status === "pending" && <TimeToExpiry seconds={e.secondsToExpiry} />}
                    {e.claimedAt && (
                      <div className="text-xs text-green-600">Claimed {fmtDate(e.claimedAt)}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtDate(e.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {e.status === "pending" && (
                        <>
                          <button
                            onClick={() => resendLink.mutate(e.ref)}
                            disabled={resendLink.isPending}
                            className="text-xs text-primary hover:underline flex items-center gap-1"
                          >
                            <Send className="h-3 w-3" /> Link
                          </button>
                          <button
                            onClick={() => forceExpire.mutate(e.ref)}
                            disabled={forceExpire.isPending}
                            className="text-xs text-destructive hover:underline flex items-center gap-1"
                          >
                            <XCircle className="h-3 w-3" /> Expire
                          </button>
                        </>
                      )}
                      <Link
                        to="/transactions/$id"
                        params={{ id: e.transactionId }}
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
