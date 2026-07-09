import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Search, ExternalLink } from "lucide-react";
import { opsApi } from "@/lib/api";
import { fmtUsd, fmtDate, railLabel, statusColor } from "@/lib/utils";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PageHeader, LoadingSpinner, ErrorDisplay, Pagination } from "@/components/Layout";

export const Route = createFileRoute("/transactions/")({ component: TransactionsPage });

const STATUSES = ["initiated", "onchain", "routed", "settled", "requires_review", "failed", "expired"];
const RAILS = ["mpesa", "momo", "paystack", "wave", "orange_money", "bank", "crypto"];
const TOKENS = ["USDC", "USDT", "AVAX"];

export default function TransactionsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [rail, setRail] = useState("");
  const [token, setToken] = useState("");
  const [direction, setDirection] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [closeId, setCloseId] = useState<string | null>(null);
  const [closeReason, setCloseReason] = useState("");

  const params = { page, limit: 50, search, status, rail, token, direction, dateFrom, dateTo };

  const { data, isLoading, error } = useQuery({
    queryKey: ["transactions", params],
    queryFn: () => opsApi.transactions.list(params),
  });

  const markFailed = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      opsApi.transactions.markFailed(id, reason),
    onSuccess: () => {
      toast.success("Transaction marked as failed");
      qc.invalidateQueries({ queryKey: ["transactions"] });
      setCloseId(null);
      setCloseReason("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  }, []);

  return (
    <div>
      <PageHeader
        title="Transactions"
        description={data ? `${data.pagination.total.toLocaleString()} total` : undefined}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => opsApi.transactions.export(params)}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      {/* Filters */}
      <div className="px-6 py-4 border-b border-border space-y-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Phone, reference, or ID…"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button type="submit" size="sm">Search</Button>
        </form>
        <div className="flex flex-wrap gap-2">
          <Select value={status} onValueChange={(v) => { setStatus(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={rail} onValueChange={(v) => { setRail(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All rails" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All rails</SelectItem>
              {RAILS.map((r) => <SelectItem key={r} value={r}>{railLabel(r)}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={token} onValueChange={(v) => { setToken(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="All tokens" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tokens</SelectItem>
              {TOKENS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={direction} onValueChange={(v) => { setDirection(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Direction" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="out">Outbound</SelectItem>
              <SelectItem value="escrow">Escrow</SelectItem>
            </SelectContent>
          </Select>

          <Input
            type="date"
            className="w-36"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          />
          <Input
            type="date"
            className="w-36"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorDisplay error={error as Error} />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Token</TableHead>
                <TableHead>Rail</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.transactions.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="font-mono text-xs">
                    <div>{tx.reference}</div>
                    {tx.isEscrow && (
                      <Badge variant="info" className="mt-0.5">escrow</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{tx.recipientPhone}</TableCell>
                  <TableCell>
                    <div className="font-medium">{fmtUsd(tx.amountUsdc)}</div>
                    <div className="text-xs text-muted-foreground">
                      {tx.amountLocal.toLocaleString()} {tx.localCurrency}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm font-mono">{tx.token}</TableCell>
                  <TableCell className="text-sm">{railLabel(tx.rail)}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(tx.status)}`}>
                      {tx.status}
                    </span>
                    {tx.failureStage && (
                      <div className="text-xs text-muted-foreground mt-0.5">{tx.failureStage}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtDate(tx.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Link
                        to="/transactions/$id"
                        params={{ id: tx.id }}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" /> View
                      </Link>
                      {tx.status !== "settled" && tx.status !== "failed" && tx.status !== "expired" && (
                        <Dialog open={closeId === tx.id} onOpenChange={(o) => { if (!o) setCloseId(null); }}>
                          <DialogTrigger asChild>
                            <button
                              onClick={() => setCloseId(tx.id)}
                              className="text-xs text-destructive hover:underline ml-1"
                            >
                              Close
                            </button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Mark as Failed</DialogTitle>
                            </DialogHeader>
                            <p className="text-sm text-muted-foreground">
                              Reference: <code className="text-foreground">{tx.reference}</code>
                            </p>
                            <Textarea
                              placeholder="Reason for closing…"
                              value={closeReason}
                              onChange={(e) => setCloseReason(e.target.value)}
                              rows={3}
                            />
                            <div className="flex justify-end gap-2 mt-2">
                              <DialogClose asChild>
                                <Button variant="outline" size="sm">Cancel</Button>
                              </DialogClose>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={!closeReason.trim() || markFailed.isPending}
                                onClick={() => markFailed.mutate({ id: tx.id, reason: closeReason })}
                              >
                                {markFailed.isPending ? "Closing…" : "Mark Failed"}
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}
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
