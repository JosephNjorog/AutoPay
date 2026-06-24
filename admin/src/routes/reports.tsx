import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { opsApi } from "@/lib/api";
import { fmtUsd, railLabel } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { PageHeader, LoadingSpinner } from "@/components/Layout";

export const Route = createFileRoute("/reports")({ component: ReportsPage });

const COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316", "#eab308"];

export default function ReportsPage() {
  const [days, setDays] = useState(30);
  const [rail, setRail] = useState("");

  const { data: volData, isLoading: volLoading } = useQuery({
    queryKey: ["reports-volume", days, rail],
    queryFn: () => opsApi.reports.volume(days, rail || undefined),
  });

  const { data: railData, isLoading: railLoading } = useQuery({
    queryKey: ["reports-rails"],
    queryFn: opsApi.reports.rails,
  });

  const { data: escrowData, isLoading: escrowLoading } = useQuery({
    queryKey: ["reports-escrow"],
    queryFn: opsApi.reports.escrowClaimRate,
  });

  const escrowPieData = escrowData
    ? [
        { name: "Claimed", value: escrowData.claimed, color: "#22c55e" },
        { name: "Refunded", value: escrowData.refunded, color: "#6366f1" },
        { name: "Expired", value: escrowData.expired, color: "#ef4444" },
        { name: "Pending", value: escrowData.pending, color: "#f97316" },
      ].filter((d) => d.value > 0)
    : [];

  return (
    <div>
      <PageHeader title="Financial Reports" />

      <div className="p-6 space-y-6">
        {/* Volume Chart */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Settled Volume Over Time</CardTitle>
            <div className="flex gap-2">
              <Select value={rail} onValueChange={setRail}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="All rails" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All rails</SelectItem>
                  {["mpesa", "momo", "paystack", "wave", "orange_money", "bank", "crypto"].map((r) => (
                    <SelectItem key={r} value={r}>{railLabel(r)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7d</SelectItem>
                  <SelectItem value="30">30d</SelectItem>
                  <SelectItem value="90">90d</SelectItem>
                  <SelectItem value="365">1y</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {volLoading ? <LoadingSpinner /> : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={volData?.chart ?? []}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(v: number, name: string) =>
                      name === "Volume" ? fmtUsd(v) : fmtUsd(v)
                    }
                    labelFormatter={(l) => new Date(l).toLocaleDateString()}
                  />
                  <Legend />
                  <Bar dataKey="volumeUsdc" name="Volume" fill="#6366f1" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="feesUsdc" name="Fees" fill="#ec4899" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Rail success rates */}
          <Card>
            <CardHeader><CardTitle>Settlement Success Rate by Rail (30d)</CardTitle></CardHeader>
            <CardContent>
              {railLoading ? <LoadingSpinner /> : (
                <div className="space-y-3">
                  {(railData?.rails ?? []).map((r) => (
                    <div key={r.rail} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{railLabel(r.rail)}</span>
                        <span className="text-muted-foreground">
                          {(r.successRate * 100).toFixed(1)}% ({r.settled}/{r.total})
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full"
                          style={{ width: `${r.successRate * 100}%` }}
                        />
                      </div>
                      {(r.failed > 0 || r.requiresReview > 0) && (
                        <div className="text-xs text-muted-foreground">
                          {r.failed} failed · {r.requiresReview} in review
                        </div>
                      )}
                    </div>
                  ))}
                  {!railData?.rails.length && (
                    <p className="text-sm text-muted-foreground py-4 text-center">No data</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Escrow claim rate */}
          <Card>
            <CardHeader><CardTitle>Escrow Claim Rate</CardTitle></CardHeader>
            <CardContent>
              {escrowLoading ? <LoadingSpinner /> : (
                <div>
                  {escrowData && escrowData.total > 0 ? (
                    <>
                      <div className="text-center mb-4">
                        <p className="text-3xl font-bold text-green-600">
                          {(escrowData.claimRate * 100).toFixed(1)}%
                        </p>
                        <p className="text-sm text-muted-foreground">claim rate ({escrowData.claimed}/{escrowData.total})</p>
                      </div>
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie data={escrowPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}>
                            {escrowPieData.map((entry, i) => (
                              <Cell key={i} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground py-8 text-center">No escrow data</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
