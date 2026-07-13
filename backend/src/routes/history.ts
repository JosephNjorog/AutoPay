import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../db";
import { transactions, users } from "../db/schema";
import { and, eq, or, desc, sql } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { backfillCryptoDeposits } from "../services/deposit-scan";
import { AuthError, NotFoundError } from "../lib/errors";
import type { TransactionSummary } from "@tuma/shared";
import type { Address } from "viem";

export const historyRouter = new Hono();
historyRouter.use("*", authMiddleware);

const QuerySchema = z.object({
  filter: z.enum(["all", "in", "out"]).default("all"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// GET /api/history
historyRouter.get("/", zValidator("query", QuerySchema), async (c) => {
  const { filter, page, limit } = c.req.valid("query");
  const { sub: userId } = c.get("user");

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (user?.walletAddress) {
    await backfillCryptoDeposits(userId, user.walletAddress as Address);
  }

  const offset = (page - 1) * limit;

  const directionClause =
    filter === "in"
      ? eq(transactions.recipientUserId, userId)
      : filter === "out"
      ? eq(transactions.senderId, userId)
      : or(
          eq(transactions.senderId, userId),
          eq(transactions.recipientUserId, userId)
        );

  // Excludes rows the caller has "deleted" from their own view — a per-party
  // flag, not a real delete (see schema.ts's hiddenForSender/hiddenForRecipient).
  const visibilityClause = or(
    and(eq(transactions.senderId, userId), eq(transactions.hiddenForSender, false)),
    and(eq(transactions.recipientUserId, userId), eq(transactions.hiddenForRecipient, false))
  );

  const whereClause = and(directionClause, visibilityClause);

  const [rows, countResult] = await Promise.all([
    db.query.transactions.findMany({
      where: whereClause,
      orderBy: [desc(transactions.createdAt)],
      limit,
      offset,
    }),
    db
      .select({ count: sql<number>`count(*)` })
      .from(transactions)
      .where(whereClause),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  const data: TransactionSummary[] = rows.map((tx) => ({
    id: tx.id,
    reference: tx.reference,
    direction: tx.recipientUserId === userId ? "in" : "out",
    counterparty:
      tx.senderId === userId
        ? tx.recipientPhone ??
          (tx.merchantTillNumber
            ? `Till ${tx.merchantTillNumber}`
            : tx.merchantPaybillNumber
            ? `PayBill ${tx.merchantPaybillNumber}`
            : "Merchant")
        : (tx.senderId ?? "Autopayke"),
    amountUsd: parseFloat(tx.amountUsdc),
    amountLocal: parseFloat(tx.amountLocal),
    localCurrency: tx.localCurrency,
    fxRate: parseFloat(tx.fxRate),
    rail: tx.rail,
    status: tx.status,
    note: tx.note,
    failureStage: tx.failureStage,
    failureReason: tx.failureReason,
    createdAt: tx.createdAt.toISOString(),
    settledAt: tx.settledAt?.toISOString() ?? null,
  }));

  return c.json({
    ok: true,
    data: {
      transactions: data,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    },
  });
});

// DELETE /api/history/:id — hide a transaction from the caller's own History
// list. Only affects the calling party's side (sender or recipient); the
// underlying record, its settlement timeline, and ops/admin visibility are
// untouched.
historyRouter.delete("/:id", async (c) => {
  const { id } = c.req.param();
  const { sub: userId } = c.get("user");

  const tx = await db.query.transactions.findFirst({ where: eq(transactions.id, id) });
  if (!tx) throw new NotFoundError("Transaction");

  const updates: Partial<typeof transactions.$inferInsert> = {};
  if (tx.senderId === userId) updates.hiddenForSender = true;
  if (tx.recipientUserId === userId) updates.hiddenForRecipient = true;
  if (Object.keys(updates).length === 0) throw new AuthError("Access denied");

  await db.update(transactions).set(updates).where(eq(transactions.id, id));

  return c.json({ ok: true });
});

// POST /api/history/:id/restore — undo the above.
historyRouter.post("/:id/restore", async (c) => {
  const { id } = c.req.param();
  const { sub: userId } = c.get("user");

  const tx = await db.query.transactions.findFirst({ where: eq(transactions.id, id) });
  if (!tx) throw new NotFoundError("Transaction");

  const updates: Partial<typeof transactions.$inferInsert> = {};
  if (tx.senderId === userId) updates.hiddenForSender = false;
  if (tx.recipientUserId === userId) updates.hiddenForRecipient = false;
  if (Object.keys(updates).length === 0) throw new AuthError("Access denied");

  await db.update(transactions).set(updates).where(eq(transactions.id, id));

  return c.json({ ok: true });
});
