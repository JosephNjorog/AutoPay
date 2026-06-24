import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ExternalLink } from "lucide-react";
import { opsApi } from "@/lib/api";
import { fmtDate } from "@/lib/utils";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PageHeader, LoadingSpinner, ErrorDisplay, Pagination } from "@/components/Layout";

export const Route = createFileRoute("/users/")({ component: UsersPage });

export default function UsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [pendingSearch, setPendingSearch] = useState("");
  const [merchant, setMerchant] = useState("");

  const params = { page, limit: 50, search, merchant: merchant || undefined };

  const { data, isLoading, error } = useQuery({
    queryKey: ["users", params],
    queryFn: () => opsApi.users.list(params),
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(pendingSearch);
    setPage(1);
  }

  return (
    <div>
      <PageHeader
        title="Users"
        description={data ? `${data.pagination.total.toLocaleString()} users` : undefined}
      />

      <div className="px-6 py-4 border-b border-border flex flex-wrap gap-2">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Phone, email, or wallet…"
              className="pl-8"
              value={pendingSearch}
              onChange={(e) => setPendingSearch(e.target.value)}
            />
          </div>
          <Button type="submit" size="sm">Search</Button>
        </form>
        <Select
          value={merchant}
          onValueChange={(v) => { setMerchant(v === "all" ? "" : v); setPage(1); }}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All users" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            <SelectItem value="true">Merchants only</SelectItem>
            <SelectItem value="false">Non-merchants</SelectItem>
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
                <TableHead>Phone</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Wallet</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="text-sm font-medium">{u.phone}</div>
                    {u.email && <div className="text-xs text-muted-foreground">{u.email}</div>}
                  </TableCell>
                  <TableCell className="text-sm">{u.countryCode}</TableCell>
                  <TableCell>
                    {u.walletAddress ? (
                      <span className="font-mono text-xs text-muted-foreground">
                        {u.walletAddress.slice(0, 8)}…{u.walletAddress.slice(-4)}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {u.isMerchant && <Badge variant="info">Merchant</Badge>}
                      {u.suspended && <Badge variant="destructive">Suspended</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtDate(u.createdAt)}</TableCell>
                  <TableCell>
                    <Link
                      to="/users/$id"
                      params={{ id: u.id }}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" /> View
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
