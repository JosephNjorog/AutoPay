import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { opsApi } from "@/lib/api";
import { fmtDate, railLabel, statusColor } from "@/lib/utils";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { PageHeader, LoadingSpinner, ErrorDisplay, Pagination, EmptyState } from "@/components/Layout";

export const Route = createFileRoute("/notifications")({ component: NotificationsPage });

type Notification = {
  transactionId: string;
  reference: string;
  recipientPhone: string;
  amountUsdc: number;
  localCurrency: string;
  rail: string;
  status: string;
  failureStage: string | null;
  failureReason: string | null;
  isEscrow: boolean;
  escrowRef: string | null;
  updatedAt: string;
};

export default function NotificationsPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ["notifications", page],
    queryFn: () => opsApi.notifications.list(page, 50),
  });

  const items = (data?.notifications ?? []) as Notification[];

  return (
    <div>
      <PageHeader
        title="Failed Notifications"
        description="Transactions that failed or require review — delivery tracking"
      />

      {isLoading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorDisplay error={error as Error} />
      ) : items.length === 0 ? (
        <EmptyState title="No failed notifications" />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Rail</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Failure Stage</TableHead>
                <TableHead>Failure Reason</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((n) => (
                <TableRow key={n.transactionId}>
                  <TableCell className="font-mono text-xs">
                    <div>{n.reference}</div>
                    {n.isEscrow && n.escrowRef && (
                      <div className="text-muted-foreground text-[10px]">{n.escrowRef}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{n.recipientPhone}</TableCell>
                  <TableCell>{railLabel(n.rail)}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(n.status)}`}>
                      {n.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs font-mono text-orange-600">
                    {n.failureStage ?? "—"}
                  </TableCell>
                  <TableCell>
                    <p className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {n.failureReason ?? "—"}
                    </p>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtDate(n.updatedAt)}</TableCell>
                  <TableCell>
                    <Link
                      to="/transactions/$id"
                      params={{ id: n.transactionId }}
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
            <Pagination
              page={(data as any).pagination.page}
              pages={(data as any).pagination.pages}
              onPage={setPage}
            />
          )}
        </>
      )}
    </div>
  );
}
