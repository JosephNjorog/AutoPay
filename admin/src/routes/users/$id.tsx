import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ShieldOff, ShieldCheck, LogOut, ExternalLink } from "lucide-react";
import { opsApi } from "@/lib/api";
import { fmtUsd, fmtDate, statusColor, railLabel } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableRow, TableCell, TableHead, TableHeader } from "@/components/ui/table";
import { LoadingSpinner, ErrorDisplay } from "@/components/Layout";

export const Route = createFileRoute("/users/$id")({ component: UserDetailPage });

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium mt-0.5 break-all">{value ?? "—"}</dd>
    </div>
  );
}

export default function UserDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["user", id],
    queryFn: () => opsApi.users.get(id),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["user", id] });
    qc.invalidateQueries({ queryKey: ["users"] });
  };

  const suspendMutation = useMutation({
    mutationFn: (suspend: boolean) => opsApi.users.suspend(id, suspend),
    onSuccess: (res) => {
      toast.success(res.suspended ? "Account suspended" : "Account reinstated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteSessionsMutation = useMutation({
    mutationFn: () => opsApi.users.deleteSessions(id),
    onSuccess: (res) => {
      toast.success(`Deleted ${res.deletedSessions} session(s) — user force-logged out`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorDisplay error={error as Error} />;
  if (!data) return null;

  const { user, stats, recentTransactions } = data;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-border">
        <Link to="/users" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{user.phone}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-muted-foreground">{user.countryCode}</span>
            {user.isMerchant && <Badge variant="info">Merchant</Badge>}
            {user.suspended && <Badge variant="destructive">Suspended</Badge>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => deleteSessionsMutation.mutate()}
            disabled={deleteSessionsMutation.isPending}
          >
            <LogOut className="h-4 w-4" />
            Force Logout
          </Button>
          {user.suspended ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => suspendMutation.mutate(false)}
              disabled={suspendMutation.isPending}
            >
              <ShieldCheck className="h-4 w-4" />
              Reinstate
            </Button>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => suspendMutation.mutate(true)}
              disabled={suspendMutation.isPending}
            >
              <ShieldOff className="h-4 w-4" />
              Suspend
            </Button>
          )}
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User details */}
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
          <CardContent>
            <dl className="space-y-4">
              <Field label="ID" value={<span className="font-mono text-xs">{user.id}</span>} />
              <Field label="Phone" value={user.phone} />
              <Field label="Email" value={user.email} />
              <Field label="Country" value={user.countryCode} />
              <Field label="Wallet" value={
                user.walletAddress
                  ? <span className="font-mono text-xs">{user.walletAddress}</span>
                  : "Not deployed"
              } />
              {user.externalWalletAddress && (
                <Field label="External Wallet" value={
                  <span className="font-mono text-xs">{user.externalWalletAddress} ({user.externalWalletType})</span>
                } />
              )}
              <Field label="Joined" value={fmtDate(user.createdAt)} />
              {user.suspendedAt && <Field label="Suspended At" value={fmtDate(user.suspendedAt)} />}
            </dl>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardHeader><CardTitle>Total Volume</CardTitle></CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{fmtUsd(stats.totalVolumeUsdc)}</p>
                <p className="text-xs text-muted-foreground mt-1">{stats.txCount} sent</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Active Sessions</CardTitle></CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{stats.activeSessions}</p>
                <p className="text-xs text-muted-foreground mt-1">logged-in devices</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Account Type</CardTitle></CardHeader>
              <CardContent>
                <p className="text-lg font-bold">{user.isMerchant ? "Merchant" : "Personal"}</p>
                {user.suspended && (
                  <p className="text-xs text-red-600 mt-1">Account suspended</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Transaction history */}
          <Card>
            <CardHeader><CardTitle>Recent Transactions</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Dir</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Rail</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentTransactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="font-mono text-xs">{tx.reference}</TableCell>
                      <TableCell>
                        <span className={tx.direction === "in" ? "text-green-600" : "text-foreground"}>
                          {tx.direction === "in" ? "↓ In" : "↑ Out"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div>{fmtUsd(tx.amountUsdc)}</div>
                        <div className="text-xs text-muted-foreground">
                          {tx.amountLocal.toLocaleString()} {tx.localCurrency}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{railLabel(tx.rail)}</TableCell>
                      <TableCell>
                        <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${statusColor(tx.status)}`}>
                          {tx.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtDate(tx.createdAt)}</TableCell>
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
              {recentTransactions.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">No transactions yet</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
