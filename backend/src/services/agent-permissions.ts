import { db } from "../db";
import { agentPermissions, transactions } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import { enqueueAgentReview } from "../lib/queue";

// Real retention period is pending legal input for the KE/TZ/UG markets
// this app currently serves — kept as a named constant rather than
// hardcoded into a deletion job, since no job should run against a number
// nobody has confirmed yet.
export const AGENT_AUDIT_RETENTION_DAYS = 365;

export type AgentTransactionContext = {
  userId: string;
  amountUsd: number;
  recipientPhone: string;
  corridor: string; // e.g. "KE-KE"
};

export type AgentEvaluationResult =
  | { decision: "allow" }
  | { decision: "block"; reason: string }
  | { decision: "flag"; reason: string };

/**
 * Anomaly/permission check for an agent-initiated transaction. Nothing in
 * the product creates agent-initiated transactions yet — this is
 * foundation for a future agent-send endpoint to call before moving money,
 * not wired into the existing human-initiated POST /api/send.
 *
 * Hard limit violations (permission scope, daily cap) block outright.
 * Statistical deviation from the payer's own recent sending pattern is
 * flagged to the review queue instead of blocked, per spec: an agent
 * shouldn't be auto-blocked just for looking unusual.
 */
export async function evaluateAgentTransaction(
  ctx: AgentTransactionContext
): Promise<AgentEvaluationResult> {
  const permissions = await db.query.agentPermissions.findFirst({
    where: eq(agentPermissions.userId, ctx.userId),
  });

  if (!permissions || permissions.revokedAt) {
    return { decision: "block", reason: "No active agent permissions for this account." };
  }

  const maxUsd = parseFloat(permissions.maxTransactionUsd);
  if (ctx.amountUsd > maxUsd) {
    return {
      decision: "block",
      reason: `Amount exceeds the agent's max transaction size of $${maxUsd.toFixed(2)}.`,
    };
  }

  const approvedCorridors = permissions.approvedCorridors as string[];
  if (approvedCorridors.length > 0 && !approvedCorridors.includes(ctx.corridor)) {
    return { decision: "block", reason: `Corridor ${ctx.corridor} is not approved for this agent.` };
  }

  const approvedRecipients = permissions.approvedRecipients as string[];
  if (approvedRecipients.length > 0 && !approvedRecipients.includes(ctx.recipientPhone)) {
    return { decision: "block", reason: "Recipient is not on the agent's approved list." };
  }

  const recent = await db.query.transactions.findMany({
    where: eq(transactions.senderId, ctx.userId),
    orderBy: [desc(transactions.createdAt)],
    limit: 20,
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const sentToday = recent.filter((t) => t.createdAt >= todayStart).length;
  if (sentToday >= permissions.maxTxPerDay) {
    return {
      decision: "block",
      reason: `Daily transaction limit of ${permissions.maxTxPerDay} already reached.`,
    };
  }

  // Deviation-from-normal-pattern check, per spec 3.3 — needs a handful of
  // prior transactions to establish a baseline.
  if (recent.length >= 3) {
    const avg = recent.reduce((sum, t) => sum + parseFloat(t.amountUsdc), 0) / recent.length;
    if (ctx.amountUsd > avg * 3) {
      const reason = `Amount ($${ctx.amountUsd.toFixed(2)}) is more than 3x this payer's recent average send ($${avg.toFixed(2)}).`;
      await enqueueAgentReview({ userId: ctx.userId, reason, detail: { amountUsd: ctx.amountUsd, avgUsd: avg } });
      return { decision: "flag", reason };
    }
  }

  return { decision: "allow" };
}
