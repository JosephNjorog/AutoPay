import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { FileText, Receipt as ReceiptIcon, CalendarDays, CalendarRange } from "lucide-react";
import { opsApi } from "@/lib/api";
import { fmtUsd, fmtDate } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardValue, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { PageHeader, LoadingSpinner, ErrorDisplay, Pagination } from "@/components/Layout";

export const Route = createFileRoute("/receipts")({ component: ReceiptsPage });

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle>{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <CardValue>{value}</CardValue>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function ReceiptsPage() {
  const [page, setPage] = useState(1);

  const { data: overview, isLoading: overviewLoading, error: overviewError } = useQuery({
    queryKey: ["receipts-overview"],
    queryFn: opsApi.receipts.overview,
  });

  const { data: list, isLoading: listLoading, error: listError } = useQuery({
    queryKey: ["receipts-list", page],
    queryFn: () => opsApi.receipts.list(page, 50),
  });

  if (overviewError) return <ErrorDisplay error={overviewError as Error} />;

  return (
    <div>
      <PageHeader
        title="Receipts"
        description="PDF receipts generated from the transfer tracker's Share receipt button"
      />

      <div className="p-6 space-y-6">
        {overviewLoading ? (
          <LoadingSpinner />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                icon={ReceiptIcon}
                label="Total generated"
                value={(overview?.total.generated ?? 0).toLocaleString()}
                sub={`${(overview?.total.uniqueTransactions ?? 0).toLocaleString()} unique transactions`}
              />
              <StatCard
                icon={FileText}
                label="Today"
                value={(overview?.today.generated ?? 0).toLocaleString()}
                sub={`${(overview?.today.uniqueTransactions ?? 0).toLocaleString()} unique`}
              />
              <StatCard
                icon={CalendarDays}
                label="Last 7 days"
                value={(overview?.["7d"].generated ?? 0).toLocaleString()}
                sub={`${(overview?.["7d"].uniqueTransactions ?? 0).toLocaleString()} unique`}
              />
              <StatCard
                icon={CalendarRange}
                label="Last 30 days"
                value={(overview?.["30d"].generated ?? 0).toLocaleString()}
                sub={`${(overview?.["30d"].uniqueTransactions ?? 0).toLocaleString()} unique`}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Receipts generated per day (30d)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={overview?.chart ?? []}>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip labelFormatter={(l) => new Date(l).toLocaleDateString()} />
                    <Legend />
                    <Bar dataKey="generated" name="Generated" fill="#6366f1" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="uniqueTransactions" name="Unique transactions" fill="#f97316" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Recent receipts</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {listLoading ? (
              <LoadingSpinner />
            ) : listError ? (
              <ErrorDisplay error={listError as Error} />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Generated by</TableHead>
                      <TableHead>Merchant</TableHead>
                      <TableHead>Generated at</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(list?.receipts ?? []).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">{r.reference ?? "—"}</TableCell>
                        <TableCell>{r.amountUsdc != null ? fmtUsd(r.amountUsdc) : "—"}</TableCell>
                        <TableCell>{r.status ?? "—"}</TableCell>
                        <TableCell>{r.generatedByName ?? r.generatedByPhone ?? "—"}</TableCell>
                        <TableCell>{r.merchantBusinessName ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(r.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                    {!list?.receipts.length && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No receipts generated yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                {list && <Pagination page={list.pagination.page} pages={list.pagination.pages} onPage={setPage} />}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
