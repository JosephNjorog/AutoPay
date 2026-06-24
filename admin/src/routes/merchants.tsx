import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { opsApi, type Merchant } from "@/lib/api";
import { fmtUsd, fmtDate, railLabel } from "@/lib/utils";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { PageHeader, LoadingSpinner, ErrorDisplay, Pagination } from "@/components/Layout";
import { ToggleLeft, ToggleRight, Pencil } from "lucide-react";

export const Route = createFileRoute("/merchants")({ component: MerchantsPage });

export default function MerchantsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [editFeeUserId, setEditFeeUserId] = useState<string | null>(null);
  const [feeBpsInput, setFeeBpsInput] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["merchants", page],
    queryFn: () => opsApi.merchants.list(page, 50),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["merchants"] });

  const toggleTill = useMutation({
    mutationFn: ({ userId, open }: { userId: string; open: boolean }) =>
      opsApi.merchants.toggleTill(userId, open),
    onSuccess: () => { toast.success("Till updated"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateFee = useMutation({
    mutationFn: ({ userId, feeBps }: { userId: string; feeBps: number }) =>
      opsApi.merchants.updateFeeBps(userId, feeBps),
    onSuccess: () => { toast.success("Fee updated"); invalidate(); setEditFeeUserId(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const editMerchant = data?.merchants.find((m) => m.userId === editFeeUserId);

  return (
    <div>
      <PageHeader
        title="Merchant Management"
        description={data ? `${data.pagination.total} merchants` : undefined}
      />

      {isLoading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorDisplay error={error as Error} />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Till</TableHead>
                <TableHead>Rail</TableHead>
                <TableHead>Fee</TableHead>
                <TableHead>Volume (All)</TableHead>
                <TableHead>Last Settled</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.merchants.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="font-medium text-sm">{m.businessName}</div>
                    {m.memberSince && (
                      <div className="text-xs text-muted-foreground">
                        Since {fmtDate(m.memberSince)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{m.phone ?? "—"}</TableCell>
                  <TableCell className="text-sm">{m.countryCode ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={m.tillOpen ? "success" : "secondary"}>
                      {m.tillOpen ? "Open" : "Closed"}
                    </Badge>
                  </TableCell>
                  <TableCell>{railLabel(m.settleRail)}</TableCell>
                  <TableCell>{m.feeBps} bps ({(m.feeBps / 100).toFixed(2)}%)</TableCell>
                  <TableCell>
                    <div>{fmtUsd(m.totalVolumeUsdc)}</div>
                    <div className="text-xs text-muted-foreground">{m.txCount} txs</div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {m.lastSettledAt ? fmtDate(m.lastSettledAt) : "Never"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleTill.mutate({ userId: m.userId, open: !m.tillOpen })}
                        disabled={toggleTill.isPending}
                        className="text-primary hover:text-primary/70"
                        title={m.tillOpen ? "Close till" : "Open till"}
                      >
                        {m.tillOpen ? (
                          <ToggleRight className="h-5 w-5" />
                        ) : (
                          <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setEditFeeUserId(m.userId);
                          setFeeBpsInput(String(m.feeBps));
                        }}
                        className="text-muted-foreground hover:text-foreground"
                        title="Edit fee"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
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

      {/* Edit fee dialog */}
      <Dialog open={!!editFeeUserId} onOpenChange={(o) => { if (!o) setEditFeeUserId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Fee — {editMerchant?.businessName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Fee (basis points)</label>
              <Input
                type="number"
                min={0}
                max={10000}
                value={feeBpsInput}
                onChange={(e) => setFeeBpsInput(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                100 bps = 1%. Current:{" "}
                {feeBpsInput ? `${(parseInt(feeBpsInput) / 100).toFixed(2)}%` : "—"}
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm">Cancel</Button>
            </DialogClose>
            <Button
              size="sm"
              disabled={!feeBpsInput || updateFee.isPending}
              onClick={() =>
                editFeeUserId &&
                updateFee.mutate({ userId: editFeeUserId, feeBps: parseInt(feeBpsInput) })
              }
            >
              {updateFee.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
