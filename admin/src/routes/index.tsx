import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { opsApi } from "@/lib/api";
import { fmtUsd, fmt, railLabel, statusColor } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardValue, CardContent } from "@/components/ui/card";
import { LoadingSpinner, ErrorDisplay, PageHeader } from "@/components/Layout";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign,
  ArrowLeftRight,
  Users,
  Lock,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";

export const Route = createFileRoute("/")({ component: OverviewPage });

const RAIL_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316", "#eab308"];

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

export default function OverviewPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["overview"],
    queryFn: opsApi.overview,
    refetchInterval: 30_000,
  });

  const { data: volData } = useQuery({
    queryKey: ["reports-volume-7d"],
    queryFn: () => opsApi.reports.volume(7),
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorDisplay error={error as Error} />;
  if (!data) return null;

  const statusEntries = Object.entries(data.statusBreakdown).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <PageHeader title="Overview" description="Platform health at a glance" />

      <div className="p-6 space-y-6">
        {/* Volume cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={DollarSign}
            label="Volume Today"
            value={fmtUsd(data.volume.today.usd)}
            sub={`${data.volume.today.txCount} transactions`}
          />
          <StatCard
            icon={DollarSign}
            label="Volume 7d"
            value={fmtUsd(data.volume["7d"].usd)}
            sub={`${data.volume["7d"].txCount} transactions`}
          />
          <StatCard
            icon={DollarSign}
            label="Volume 30d"
            value={fmtUsd(data.volume["30d"].usd)}
            sub={`${data.volume["30d"].txCount} transactions`}
          />
          <StatCard
            icon={TrendingUp}
            label="Fees 30d"
            value={fmtUsd(data.feeRevenue30dUsdc)}
            sub="Settled transactions"
          />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Users}
            label="Total Users"
            value={data.users.total.toLocaleString()}
            sub={`+${data.users.new7d} this week`}
          />
          <StatCard
            icon={Lock}
            label="Pending Escrows"
            value={data.escrows.pendingCount.toLocaleString()}
            sub={fmtUsd(data.escrows.pendingValueUsdc) + " at risk"}
          />
          <StatCard
            icon={AlertTriangle}
            label="Requires Review"
            value={String(data.statusBreakdown["requires_review"] ?? 0)}
            sub="Needs operator attention"
          />
          <StatCard
            icon={ArrowLeftRight}
            label="Failed (All Time)"
            value={String(data.statusBreakdown["failed"] ?? 0)}
            sub={`${data.statusBreakdown["expired"] ?? 0} expired`}
          />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Volume chart */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Daily Volume (7d)</CardTitle>
            </CardHeader>
            <CardContent>
              {volData?.chart && volData.chart.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={volData.chart}>
                    <defs>
                      <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(d) => new Date(d).toLocaleDateString("en-US", { weekday: "short" })}
                    />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(v: number) => fmtUsd(v)}
                      labelFormatter={(l) => new Date(l).toLocaleDateString()}
                    />
                    <Area
                      type="monotone"
                      dataKey="volumeUsdc"
                      name="Volume"
                      stroke="#6366f1"
                      fill="url(#volGrad)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
                  No volume data
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top rails */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Top Rails (30d)</CardTitle>
            </CardHeader>
            <CardContent>
              {data.topRails.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.topRails} layout="vertical">
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="rail"
                      tick={{ fontSize: 11 }}
                      tickFormatter={railLabel}
                      width={60}
                    />
                    <Tooltip
                      formatter={(v: number) => fmtUsd(v)}
                      labelFormatter={railLabel}
                    />
                    <Bar dataKey="volumeUsdc" name="Volume" radius={[0, 4, 4, 0]}>
                      {data.topRails.map((_, i) => (
                        <Cell key={i} fill={RAIL_COLORS[i % RAIL_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
                  No rail data
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Status breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Transaction Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {statusEntries.map(([status, count]) => (
                <div
                  key={status}
                  className="flex items-center gap-2 rounded-lg border border-border px-4 py-2"
                >
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(status)}`}>
                    {status}
                  </span>
                  <span className="text-lg font-bold">{count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
