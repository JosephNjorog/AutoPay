import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw, Send, Hash, AlertTriangle, XCircle, RotateCcw } from "lucide-react";
import { opsApi } from "@/lib/api";
import { fmtUsd, fmtDate, railLabel, statusColor, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { LoadingSpinner, ErrorDisplay } from "@/components/Layout";

export const Route = createFileRoute("/transactions/$id")({ component: TxDetailPage });

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium mt-0.5 break-all">{value ?? "—"}</dd>
    </div>
  );
}

export default function TxDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["tx", id],
    queryFn: () => opsApi.transactions.get(id),
  });

  const [markFailedOpen, setMarkFailedOpen] = useState(false);
  const [failReason, setFailReason] = useState("");
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [hashNote, setHashNote] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tx", id] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
  };

  const markFailed = useMutation({
    mutationFn: (reason: string) => opsApi.transactions.markFailed(id, reason),
    onSuccess: () => { toast.success("Marked as failed"); invalidate(); setMarkFailedOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const retryDisburse = useMutation({
    mutationFn: () => opsApi.review.retryDisbursement(id),
    onSuccess: () => { toast.success("Retry queued"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const resendLink = useMutation({
    mutationFn: () => opsApi.review.resendClaimLink(id),
    onSuccess: () => toast.success("Claim link re-sent"),
    onError: (e: Error) => toast.error(e.message),
  });

  const reconcile = useMutation({
    mutationFn: () => opsApi.review.reconcileHash(id, txHash, hashNote || undefined),
    onSuccess: () => { toast.success("Chain hash attached"); invalidate(); setReconcileOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const refundEscrow = useMutation({
    mutationFn: () => opsApi.review.refundEscrow(id),
    onSuccess: () => { toast.success("Escrow refund triggered"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorDisplay error={error as Error} />;
  if (!data) return null;

  const { transaction: tx, timeline, escrow } = data;
  const canRetry = ["onchain", "routed", "requires_review"].includes(tx.status);
  const canMarkFailed = !["settled", "failed", "expired"].includes(tx.status);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-border">
        <Link to="/transactions" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold font-mono">{tx.reference}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(tx.status)}`}>
              {tx.status}
            </span>
            <span className="text-xs text-muted-foreground">{railLabel(tx.rail)}</span>
            {tx.isEscrow && <span className="text-xs text-blue-600">escrow</span>}
          </div>
        </div>
        {/* Action buttons */}
        <div className="flex gap-2">
          {canRetry && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => retryDisburse.mutate()}
              disabled={retryDisburse.isPending}
            >
              <RefreshCw className="h-4 w-4" />
              Retry Disburse
            </Button>
          )}
          {tx.isEscrow && tx.status !== "settled" && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => resendLink.mutate()}
                disabled={resendLink.isPending}
              >
                <Send className="h-4 w-4" />
                Resend Claim Link
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => refundEscrow.mutate()}
                disabled={refundEscrow.isPending}
              >
                <RotateCcw className="h-4 w-4" />
                Refund Escrow
              </Button>
            </>
          )}
          {tx.status === "requires_review" && (
            <Button size="sm" variant="outline" onClick={() => setReconcileOpen(true)}>
              <Hash className="h-4 w-4" />
              Attach Hash
            </Button>
          )}
          {canMarkFailed && (
            <Button size="sm" variant="destructive" onClick={() => setMarkFailedOpen(true)}>
              <XCircle className="h-4 w-4" />
              Mark Failed
            </Button>
          )}
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Transaction details */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Transaction Details</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
              <Field label="ID" value={<span className="font-mono text-xs">{tx.id}</span>} />
              <Field label="Reference" value={<span className="font-mono">{tx.reference}</span>} />
              <Field label="Sender" value={tx.senderPhone} />
              <Field label="Recipient" value={tx.recipientPhone} />
              <Field label="Amount (USDC)" value={fmtUsd(tx.amountUsdc)} />
              <Field label="Amount (Local)" value={`${tx.amountLocal.toLocaleString()} ${tx.localCurrency}`} />
              <Field label="FX Rate" value={tx.fxRate.toFixed(4)} />
              <Field label="Fee" value={fmtUsd(tx.feeUsdc)} />
              <Field label="Rail" value={railLabel(tx.rail)} />
              <Field label="Token" value={tx.token} />
              <Field label="TX Hash" value={tx.txHash ? <span className="font-mono text-xs">{tx.txHash}</span> : "—"} />
              <Field label="Rail Reference" value={tx.railReference} />
              <Field label="Note" value={tx.note} />
              <Field label="Created" value={fmtDate(tx.createdAt)} />
              <Field label="Settled" value={tx.settledAt ? fmtDate(tx.settledAt) : "—"} />
              {tx.failureStage && <Field label="Failure Stage" value={tx.failureStage} />}
              {tx.failureReason && <Field label="Failure Reason" value={tx.failureReason} />}
              {tx.failedAt && <Field label="Failed At" value={fmtDate(tx.failedAt)} />}
            </dl>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {/* Escrow info */}
          {escrow && (
            <Card>
              <CardHeader><CardTitle>Escrow</CardTitle></CardHeader>
              <CardContent>
                <dl className="space-y-3">
                  <Field label="Ref" value={<span className="font-mono text-xs">{escrow.ref}</span>} />
                  <Field label="Status" value={
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(escrow.status)}`}>
                      {escrow.status}
                    </span>
                  } />
                  <Field label="Amount" value={fmtUsd(escrow.amountUsdc)} />
                  <Field label="Expires" value={fmtDate(escrow.expiresAt)} />
                  {escrow.claimedAt && <Field label="Claimed" value={fmtDate(escrow.claimedAt)} />}
                  {escrow.claimedByWallet && <Field label="Claimed By" value={<span className="font-mono text-xs">{escrow.claimedByWallet}</span>} />}
                </dl>
              </CardContent>
            </Card>
          )}

          {/* Settlement timeline */}
          <Card>
            <CardHeader><CardTitle>Settlement Timeline</CardTitle></CardHeader>
            <CardContent>
              <ol className="relative border-l border-border space-y-4 pl-4">
                {timeline.map((event, i) => (
                  <li key={i} className="relative">
                    <div className="absolute -left-[17px] h-3 w-3 rounded-full border-2 border-background bg-primary" />
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${statusColor(event.step)}`}>
                        {event.step}
                      </span>
                      <span className="text-xs text-muted-foreground">{timeAgo(event.createdAt)}</span>
                    </div>
                    {event.metadata && Object.keys(event.metadata).length > 0 && (
                      <pre className="text-xs text-muted-foreground bg-muted rounded p-2 overflow-x-auto">
                        {JSON.stringify(event.metadata, null, 2)}
                      </pre>
                    )}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Mark Failed dialog */}
      <Dialog open={markFailedOpen} onOpenChange={setMarkFailedOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark Transaction as Failed</DialogTitle></DialogHeader>
          <Textarea
            placeholder="Reason for closing this transaction…"
            value={failReason}
            onChange={(e) => setFailReason(e.target.value)}
            rows={4}
          />
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button
              size="sm"
              variant="destructive"
              disabled={!failReason.trim() || markFailed.isPending}
              onClick={() => markFailed.mutate(failReason)}
            >
              {markFailed.isPending ? "Closing…" : "Mark Failed"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reconcile hash dialog */}
      <Dialog open={reconcileOpen} onOpenChange={setReconcileOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Attach On-Chain Hash</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">TX Hash</label>
              <Input
                placeholder="0x..."
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                className="font-mono text-xs mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Note (optional)</label>
              <Input
                placeholder="e.g. Manual deposit scan"
                value={hashNote}
                onChange={(e) => setHashNote(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button
              size="sm"
              disabled={!/^0x[0-9a-fA-F]{64}$/.test(txHash) || reconcile.isPending}
              onClick={() => reconcile.mutate()}
            >
              {reconcile.isPending ? "Attaching…" : "Attach Hash"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
