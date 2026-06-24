import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { opsApi } from "@/lib/api";
import { fmtDate, statusColor } from "@/lib/utils";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { PageHeader, LoadingSpinner, ErrorDisplay, Pagination } from "@/components/Layout";
import { Search, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/audit")({ component: AuditPage });

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [pendingSearch, setPendingSearch] = useState("");
  const [status, setStatus] = useState("");

  const STATUSES = ["initiated", "onchain", "routed", "settled", "requires_review", "failed", "expired"];

  const params = { page, limit: 100, search, status };

  const { data, isLoading, error } = useQuery({
    queryKey: ["audit-transactions", params],
    queryFn: () => opsApi.transactions.list(params),
  });

  return (
    <div>
      <PageHeader
        title="Audit Log"
        description="Full settlement event log. Use Transactions → detail view for per-transaction timeline."
      />

      <div className="px-6 py-4 border-b border-border flex flex-wrap gap-2">
        <form
          onSubmit={(e) => { e.preventDefault(); setSearch(pendingSearch); setPage(1); }}
          className="flex gap-2"
        >
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Reference or phone…"
              className="pl-8"
              value={pendingSearch}
              onChange={(e) => setPendingSearch(e.target.value)}
            />
          </div>
          <Button type="submit" size="sm">Search</Button>
        </form>
        <Select value={status} onValueChange={(v) => { setStatus(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
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
                <TableHead>Sender</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Failure Stage</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Settled</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.transactions.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="font-mono text-xs">
                    <div>{tx.reference}</div>
                    {tx.isEscrow && <span className="text-blue-600 text-[10px]">escrow</span>}
                  </TableCell>
                  <TableCell className="text-xs">{tx.senderPhone ?? "—"}</TableCell>
                  <TableCell className="text-xs">{tx.recipientPhone}</TableCell>
                  <TableCell>
                    <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${statusColor(tx.status)}`}>
                      {tx.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs font-mono text-orange-600">
                    {tx.failureStage ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtDate(tx.createdAt)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {tx.settledAt ? fmtDate(tx.settledAt) : "—"}
                  </TableCell>
                  <TableCell>
                    <Link
                      to="/transactions/$id"
                      params={{ id: tx.id }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Link>
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
