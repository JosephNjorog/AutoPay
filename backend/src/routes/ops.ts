import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, desc, and, or, gte, lte, like, sql, count, sum, ilike, inArray, ne } from "drizzle-orm";
import { db } from "../db";
import {
  users,
  transactions,
  settlementEvents,
  escrowPayments,
  merchantSettings,
  fxRates,
  workerHeartbeats,
  sessions,
} from "../db/schema";
import { opsAuthMiddleware } from "../middleware/ops";
import {
  listRailDeadLetters,
  retryRailDeadLetter,
} from "../services/rail-dead-letter";
import {
  reconcileChainHash,
  resendClaimLink,
  retryEscrowRefund,
  retryRailDisbursement,
} from "../services/review-recovery";
import { listHeartbeatStatus } from "../services/worker-heartbeat";
import {
  settlementQueue,
  escrowQueue,
  railQueue,
  notifyQueue,
} from "../lib/queue";

export const opsRouter = new Hono();
opsRouter.use("*", opsAuthMiddleware);

// ── Helpers ──────────────────────────────────────────────────────────────────

const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

const UuidParam = z.object({ id: z.string().uuid() });
const BooleanQuery = z.preprocess(
  (v) => v === true || v === "true" || v === "1",
  z.boolean()
);
const HeartbeatQuerySchema = z.object({
  staleOnly: BooleanQuery,
  failOnStale: BooleanQuery,
});

function operator(c: Context): string {
  return c.req.header("x-operator") ?? "ops-token";
}

// ── Overview / Home ───────────────────────────────────────────────────────────

// GET /api/ops/overview
opsRouter.get("/overview", async (c) => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const start30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    todayVol,
    vol7d,
    vol30d,
    statusCounts,
    totalUsers,
    newUsers7d,
    newUsers30d,
    pendingEscrows,
    feeRevenue30d,
    topRails,
  ] = await Promise.all([
    db
      .select({ volume: sum(transactions.amountUsdc), txCount: count() })
      .from(transactions)
      .where(gte(transactions.createdAt, startOfDay)),
    db
      .select({ volume: sum(transactions.amountUsdc), txCount: count() })
      .from(transactions)
      .where(gte(transactions.createdAt, start7d)),
    db
      .select({ volume: sum(transactions.amountUsdc), txCount: count() })
      .from(transactions)
      .where(gte(transactions.createdAt, start30d)),
    db
      .select({ status: transactions.status, cnt: count() })
      .from(transactions)
      .groupBy(transactions.status),
    db.select({ cnt: count() }).from(users),
    db
      .select({ cnt: count() })
      .from(users)
      .where(gte(users.createdAt, start7d)),
    db
      .select({ cnt: count() })
      .from(users)
      .where(gte(users.createdAt, start30d)),
    db
      .select({ cnt: count(), totalUsdc: sum(escrowPayments.amountUsdc) })
      .from(escrowPayments)
      .where(eq(escrowPayments.status, "pending")),
    db
      .select({ fees: sum(transactions.feeUsdc) })
      .from(transactions)
      .where(
        and(
          gte(transactions.createdAt, start30d),
          eq(transactions.status, "settled")
        )
      ),
    db
      .select({ rail: transactions.rail, volume: sum(transactions.amountUsdc), cnt: count() })
      .from(transactions)
      .where(
        and(
          gte(transactions.createdAt, start30d),
          eq(transactions.status, "settled")
        )
      )
      .groupBy(transactions.rail)
      .orderBy(desc(sum(transactions.amountUsdc)))
      .limit(6),
  ]);

  return c.json({
    ok: true,
    data: {
      volume: {
        today: { usd: parseFloat(todayVol[0]?.volume ?? "0"), txCount: Number(todayVol[0]?.txCount ?? 0) },
        "7d": { usd: parseFloat(vol7d[0]?.volume ?? "0"), txCount: Number(vol7d[0]?.txCount ?? 0) },
        "30d": { usd: parseFloat(vol30d[0]?.volume ?? "0"), txCount: Number(vol30d[0]?.txCount ?? 0) },
      },
      statusBreakdown: Object.fromEntries(
        statusCounts.map((r) => [r.status, Number(r.cnt)])
      ),
      users: {
        total: Number(totalUsers[0]?.cnt ?? 0),
        new7d: Number(newUsers7d[0]?.cnt ?? 0),
        new30d: Number(newUsers30d[0]?.cnt ?? 0),
      },
      escrows: {
        pendingCount: Number(pendingEscrows[0]?.cnt ?? 0),
        pendingValueUsdc: parseFloat(pendingEscrows[0]?.totalUsdc ?? "0"),
      },
      feeRevenue30dUsdc: parseFloat(feeRevenue30d[0]?.fees ?? "0"),
      topRails: topRails.map((r) => ({
        rail: r.rail,
        volumeUsdc: parseFloat(r.volume ?? "0"),
        txCount: Number(r.cnt),
      })),
    },
  });
});

// ── Transactions ──────────────────────────────────────────────────────────────

const TxListQuerySchema = PaginationSchema.extend({
  status: z.string().optional(),
  rail: z.string().optional(),
  direction: z.enum(["in", "out", "escrow"]).optional(),
  country: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
});

// GET /api/ops/transactions
opsRouter.get(
  "/transactions",
  zValidator("query", TxListQuerySchema),
  async (c) => {
    const { page, limit, status, rail, direction, country, dateFrom, dateTo, search } =
      c.req.valid("query");
    const offset = (page - 1) * limit;

    const filters: ReturnType<typeof eq>[] = [];

    if (status) {
      const statuses = status.split(",");
      if (statuses.length === 1) {
        filters.push(eq(transactions.status, status as any));
      } else {
        filters.push(inArray(transactions.status, statuses as any[]));
      }
    }
    if (rail) filters.push(eq(transactions.rail, rail as any));
    if (direction === "escrow") filters.push(eq(transactions.isEscrow, true));
    if (dateFrom) filters.push(gte(transactions.createdAt, new Date(dateFrom)));
    if (dateTo) filters.push(lte(transactions.createdAt, new Date(dateTo)));
    if (search) {
      filters.push(
        or(
          ilike(transactions.reference, `%${search}%`),
          ilike(transactions.recipientPhone, `%${search}%`),
          sql`${transactions.id}::text ilike ${"%" + search + "%"}`
        ) as any
      );
    }

    const where = filters.length > 0 ? and(...filters) : undefined;

    const [rows, totalRows] = await Promise.all([
      db.query.transactions.findMany({
        where,
        orderBy: [desc(transactions.createdAt)],
        limit,
        offset,
        with: { sender: { columns: { id: true, phone: true, countryCode: true } } },
      }),
      db.select({ cnt: count() }).from(transactions).where(where),
    ]);

    const total = Number(totalRows[0]?.cnt ?? 0);

    return c.json({
      ok: true,
      data: {
        transactions: rows.map((tx) => ({
          id: tx.id,
          reference: tx.reference,
          senderPhone: (tx as any).sender?.phone ?? null,
          senderCountry: (tx as any).sender?.countryCode ?? null,
          recipientPhone: tx.recipientPhone,
          amountUsdc: parseFloat(tx.amountUsdc),
          amountLocal: parseFloat(tx.amountLocal),
          localCurrency: tx.localCurrency,
          fxRate: parseFloat(tx.fxRate),
          feeUsdc: parseFloat(tx.feeUsdc),
          rail: tx.rail,
          status: tx.status,
          isEscrow: tx.isEscrow,
          txHash: tx.txHash,
          failureStage: tx.failureStage,
          failureReason: tx.failureReason,
          failedAt: tx.failedAt?.toISOString() ?? null,
          createdAt: tx.createdAt.toISOString(),
          settledAt: tx.settledAt?.toISOString() ?? null,
        })),
        pagination: { total, page, limit, pages: Math.ceil(total / limit) },
      },
    });
  }
);

// GET /api/ops/transactions/export  — must be before /:id
opsRouter.get(
  "/transactions/export",
  zValidator("query", TxListQuerySchema),
  async (c) => {
    const { status, rail, direction, dateFrom, dateTo, search } = c.req.valid("query");

    const filters: ReturnType<typeof eq>[] = [];
    if (status) filters.push(eq(transactions.status, status as any));
    if (rail) filters.push(eq(transactions.rail, rail as any));
    if (direction === "escrow") filters.push(eq(transactions.isEscrow, true));
    if (dateFrom) filters.push(gte(transactions.createdAt, new Date(dateFrom)));
    if (dateTo) filters.push(lte(transactions.createdAt, new Date(dateTo)));
    if (search) {
      filters.push(
        or(
          ilike(transactions.reference, `%${search}%`),
          ilike(transactions.recipientPhone, `%${search}%`)
        ) as any
      );
    }

    const rows = await db.query.transactions.findMany({
      where: filters.length > 0 ? and(...filters) : undefined,
      orderBy: [desc(transactions.createdAt)],
      limit: 5000,
    });

    const headers = [
      "id", "reference", "recipient_phone", "amount_usdc", "amount_local",
      "local_currency", "fx_rate", "fee_usdc", "rail", "status",
      "is_escrow", "tx_hash", "failure_stage", "failure_reason",
      "created_at", "settled_at",
    ];

    const csvRows = rows.map((tx) =>
      [
        tx.id,
        tx.reference,
        tx.recipientPhone,
        tx.amountUsdc,
        tx.amountLocal,
        tx.localCurrency,
        tx.fxRate,
        tx.feeUsdc,
        tx.rail,
        tx.status,
        tx.isEscrow ? "1" : "0",
        tx.txHash ?? "",
        tx.failureStage ?? "",
        tx.failureReason ?? "",
        tx.createdAt.toISOString(),
        tx.settledAt?.toISOString() ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );

    const csv = [headers.join(","), ...csvRows].join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="transactions-${Date.now()}.csv"`,
      },
    });
  }
);

// GET /api/ops/transactions/:id
opsRouter.get(
  "/transactions/:id",
  zValidator("param", UuidParam),
  async (c) => {
    const { id } = c.req.valid("param");

    const [tx, events, escrow] = await Promise.all([
      db.query.transactions.findFirst({
        where: eq(transactions.id, id),
        with: {
          sender: { columns: { id: true, phone: true, countryCode: true, walletAddress: true } },
          settlementEvents: { orderBy: [desc(settlementEvents.createdAt)] },
        },
      }),
      db.query.settlementEvents.findMany({
        where: eq(settlementEvents.transactionId, id),
        orderBy: [desc(settlementEvents.createdAt)],
      }),
      db.query.escrowPayments.findFirst({
        where: eq(escrowPayments.transactionId, id),
      }),
    ]);

    if (!tx) {
      return c.json({ ok: false, error: "Transaction not found" }, 404);
    }

    return c.json({
      ok: true,
      data: {
        transaction: {
          id: tx.id,
          reference: tx.reference,
          idempotencyKey: tx.idempotencyKey,
          senderPhone: (tx as any).sender?.phone ?? null,
          senderCountry: (tx as any).sender?.countryCode ?? null,
          senderWalletAddress: (tx as any).sender?.walletAddress ?? null,
          recipientPhone: tx.recipientPhone,
          recipientWalletAddress: tx.recipientWalletAddress,
          amountUsdc: parseFloat(tx.amountUsdc),
          amountLocal: parseFloat(tx.amountLocal),
          localCurrency: tx.localCurrency,
          fxRate: parseFloat(tx.fxRate),
          feeUsdc: parseFloat(tx.feeUsdc),
          token: tx.token,
          rail: tx.rail,
          status: tx.status,
          txHash: tx.txHash,
          railReference: tx.railReference,
          note: tx.note,
          isEscrow: tx.isEscrow,
          escrowRef: tx.escrowRef,
          isMerchantPayment: tx.isMerchantPayment,
          failureStage: tx.failureStage,
          failureReason: tx.failureReason,
          failedAt: tx.failedAt?.toISOString() ?? null,
          createdAt: tx.createdAt.toISOString(),
          settledAt: tx.settledAt?.toISOString() ?? null,
        },
        timeline: events.map((e) => ({
          step: e.step,
          metadata: e.metadata,
          createdAt: e.createdAt.toISOString(),
        })),
        escrow: escrow
          ? {
              ref: escrow.ref,
              status: escrow.status,
              amountUsdc: parseFloat(escrow.amountUsdc),
              expiresAt: escrow.expiresAt.toISOString(),
              claimedAt: escrow.claimedAt?.toISOString() ?? null,
              claimedByWallet: escrow.claimedByWallet,
              claimTxHash: escrow.claimTxHash,
            }
          : null,
      },
    });
  }
);

// POST /api/ops/transactions/:id/mark-failed
opsRouter.post(
  "/transactions/:id/mark-failed",
  zValidator("param", UuidParam),
  zValidator("json", z.object({ reason: z.string().min(1).max(500) })),
  async (c) => {
    const { id } = c.req.valid("param");
    const { reason } = c.req.valid("json");

    const tx = await db.query.transactions.findFirst({
      where: and(
        eq(transactions.id, id),
        ne(transactions.status, "settled"),
        ne(transactions.status, "failed")
      ),
    });

    if (!tx) {
      return c.json({ ok: false, error: "Transaction not found or already terminal" }, 404);
    }

    await db
      .update(transactions)
      .set({
        status: "failed",
        failureStage: "ops_manual_close",
        failureReason: reason,
        failedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, id));

    await db.insert(settlementEvents).values({
      transactionId: id,
      step: "failed",
      metadata: { reason, closedBy: operator(c) },
    });

    return c.json({ ok: true, data: { id, status: "failed" } });
  }
);

// ── Requires Review Queue ─────────────────────────────────────────────────────

const ReviewParamSchema = z.object({ transactionId: z.string().uuid() });

// GET /api/ops/review
opsRouter.get(
  "/review",
  zValidator("query", PaginationSchema),
  async (c) => {
    const { page, limit } = c.req.valid("query");
    const offset = (page - 1) * limit;

    const [rows, totalRows] = await Promise.all([
      db.query.transactions.findMany({
        where: eq(transactions.status, "requires_review"),
        orderBy: [desc(transactions.createdAt)],
        limit,
        offset,
      }),
      db
        .select({ cnt: count() })
        .from(transactions)
        .where(eq(transactions.status, "requires_review")),
    ]);

    const total = Number(totalRows[0]?.cnt ?? 0);

    return c.json({
      ok: true,
      data: {
        transactions: rows.map((tx) => ({
          id: tx.id,
          reference: tx.reference,
          recipientPhone: tx.recipientPhone,
          amountUsdc: parseFloat(tx.amountUsdc),
          amountLocal: parseFloat(tx.amountLocal),
          localCurrency: tx.localCurrency,
          rail: tx.rail,
          isEscrow: tx.isEscrow,
          escrowRef: tx.escrowRef,
          failureStage: tx.failureStage,
          failureReason: tx.failureReason,
          failedAt: tx.failedAt?.toISOString() ?? null,
          createdAt: tx.createdAt.toISOString(),
        })),
        pagination: { total, page, limit, pages: Math.ceil(total / limit) },
      },
    });
  }
);

// POST /api/ops/review/batch-retry
opsRouter.post(
  "/review/batch-retry",
  zValidator("json", z.object({ transactionIds: z.array(z.string().uuid()).min(1).max(50) })),
  async (c) => {
    const { transactionIds } = c.req.valid("json");
    const op = operator(c);

    const results = await Promise.allSettled(
      transactionIds.map((id) => retryRailDisbursement(id, op))
    );

    const summary = results.map((r, i) => ({
      transactionId: transactionIds[i],
      ok: r.status === "fulfilled",
      error: r.status === "rejected" ? String(r.reason) : undefined,
    }));

    return c.json({ ok: true, data: { results: summary } });
  }
);

// Already-existing ops review endpoints (kept intact):
const RetryParamSchema = z.object({ transactionId: z.string().uuid() });
const ChainHashBodySchema = z.object({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  escrowRef: z.string().min(1).optional(),
  note: z.string().max(500).optional(),
});

opsRouter.post(
  "/review/:transactionId/resend-claim-link",
  zValidator("param", RetryParamSchema),
  async (c) => {
    const { transactionId } = c.req.valid("param");
    const data = await resendClaimLink(transactionId, operator(c));
    return c.json({ ok: true, data });
  }
);

opsRouter.post(
  "/review/:transactionId/reconcile-chain-hash",
  zValidator("param", RetryParamSchema),
  zValidator("json", ChainHashBodySchema),
  async (c) => {
    const { transactionId } = c.req.valid("param");
    const body = c.req.valid("json");
    const data = await reconcileChainHash(
      transactionId,
      body.txHash as `0x${string}`,
      operator(c),
      { escrowRef: body.escrowRef, note: body.note }
    );
    return c.json({ ok: true, data });
  }
);

opsRouter.post(
  "/review/:transactionId/retry-disbursement",
  zValidator("param", RetryParamSchema),
  async (c) => {
    const { transactionId } = c.req.valid("param");
    const data = await retryRailDisbursement(transactionId, operator(c));
    return c.json({ ok: true, data });
  }
);

opsRouter.post(
  "/review/:transactionId/refund-escrow",
  zValidator("param", RetryParamSchema),
  async (c) => {
    const { transactionId } = c.req.valid("param");
    const data = await retryEscrowRefund(transactionId, operator(c));
    return c.json({ ok: true, data });
  }
);

// ── Dead Letter Queue ─────────────────────────────────────────────────────────

const DeadLetterQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

opsRouter.get(
  "/rail/dead-letter",
  zValidator("query", DeadLetterQuerySchema),
  async (c) => {
    const { page, limit } = c.req.valid("query");
    const data = await listRailDeadLetters(page, limit);
    return c.json({ ok: true, data });
  }
);

opsRouter.post(
  "/rail/dead-letter/:transactionId/retry",
  zValidator("param", RetryParamSchema),
  async (c) => {
    const { transactionId } = c.req.valid("param");
    const data = await retryRailDeadLetter(transactionId, operator(c));
    return c.json({ ok: true, data });
  }
);

// POST /api/ops/rail/dead-letter/:transactionId/discard  — mark as failed/closed
opsRouter.post(
  "/rail/dead-letter/:transactionId/discard",
  zValidator("param", RetryParamSchema),
  async (c) => {
    const { transactionId } = c.req.valid("param");

    const tx = await db.query.transactions.findFirst({
      where: eq(transactions.id, transactionId),
    });
    if (!tx) return c.json({ ok: false, error: "Transaction not found" }, 404);

    await db
      .update(transactions)
      .set({
        status: "failed",
        failureStage: tx.failureStage ?? "ops_discard",
        failureReason: "Discarded from dead letter queue by operator",
        failedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, transactionId));

    await db.insert(settlementEvents).values({
      transactionId,
      step: "failed",
      metadata: { discardedBy: operator(c) },
    });

    return c.json({ ok: true, data: { transactionId, status: "failed" } });
  }
);

// ── Escrow Management ─────────────────────────────────────────────────────────

const EscrowQuerySchema = PaginationSchema.extend({
  status: z.enum(["pending", "claimed", "refunded", "expired"]).optional(),
});

// GET /api/ops/escrows
opsRouter.get(
  "/escrows",
  zValidator("query", EscrowQuerySchema),
  async (c) => {
    const { page, limit, status } = c.req.valid("query");
    const offset = (page - 1) * limit;

    const where = status ? eq(escrowPayments.status, status) : undefined;

    const [rows, totalRows] = await Promise.all([
      db.query.escrowPayments.findMany({
        where,
        orderBy: [desc(escrowPayments.createdAt)],
        limit,
        offset,
        with: {
          transaction: {
            columns: { reference: true, rail: true, recipientPhone: true, localCurrency: true },
          },
        },
      }),
      db.select({ cnt: count() }).from(escrowPayments).where(where),
    ]);

    const total = Number(totalRows[0]?.cnt ?? 0);
    const now = new Date();

    return c.json({
      ok: true,
      data: {
        escrows: rows.map((e) => ({
          id: e.id,
          ref: e.ref,
          transactionId: e.transactionId,
          reference: (e as any).transaction?.reference ?? null,
          rail: (e as any).transaction?.rail ?? null,
          recipientPhone: e.recipientPhone,
          localCurrency: (e as any).transaction?.localCurrency ?? null,
          amountUsdc: parseFloat(e.amountUsdc),
          status: e.status,
          expiresAt: e.expiresAt.toISOString(),
          secondsToExpiry: Math.max(0, Math.floor((e.expiresAt.getTime() - now.getTime()) / 1000)),
          claimedAt: e.claimedAt?.toISOString() ?? null,
          claimedByWallet: e.claimedByWallet,
          createdAt: e.createdAt.toISOString(),
        })),
        pagination: { total, page, limit, pages: Math.ceil(total / limit) },
      },
    });
  }
);

// POST /api/ops/escrows/:ref/force-expire
opsRouter.post(
  "/escrows/:ref/force-expire",
  zValidator("param", z.object({ ref: z.string().min(1) })),
  async (c) => {
    const { ref } = c.req.valid("param");

    const escrow = await db.query.escrowPayments.findFirst({
      where: and(eq(escrowPayments.ref, ref), eq(escrowPayments.status, "pending")),
    });

    if (!escrow) {
      return c.json({ ok: false, error: "Escrow not found or not pending" }, 404);
    }

    await db
      .update(escrowPayments)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(escrowPayments.ref, ref));

    await db
      .update(transactions)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(transactions.id, escrow.transactionId));

    await db.insert(settlementEvents).values({
      transactionId: escrow.transactionId,
      step: "failed",
      metadata: { action: "force_expired_by_ops", operator: operator(c) },
    });

    return c.json({ ok: true, data: { ref, status: "expired" } });
  }
);

// POST /api/ops/escrows/:ref/resend-link
opsRouter.post(
  "/escrows/:ref/resend-link",
  zValidator("param", z.object({ ref: z.string().min(1) })),
  async (c) => {
    const escrow = await db.query.escrowPayments.findFirst({
      where: eq(escrowPayments.ref, c.req.valid("param").ref),
      with: { transaction: { columns: { id: true } } },
    });
    if (!escrow || escrow.status !== "pending") {
      return c.json({ ok: false, error: "Escrow not found or not pending" }, 404);
    }
    const data = await resendClaimLink(escrow.transactionId, operator(c));
    return c.json({ ok: true, data });
  }
);

// ── Users ─────────────────────────────────────────────────────────────────────

const UserListQuerySchema = PaginationSchema.extend({
  search: z.string().optional(),
  country: z.string().optional(),
  merchant: BooleanQuery.optional(),
});

// GET /api/ops/users
opsRouter.get(
  "/users",
  zValidator("query", UserListQuerySchema),
  async (c) => {
    const { page, limit, search, country, merchant } = c.req.valid("query");
    const offset = (page - 1) * limit;

    const filters: ReturnType<typeof eq>[] = [];
    if (country) filters.push(eq(users.countryCode, country));
    if (merchant !== undefined) filters.push(eq(users.isMerchant, merchant));
    if (search) {
      filters.push(
        or(
          ilike(users.phone, `%${search}%`),
          ilike(users.email, `%${search}%`),
          ilike(users.walletAddress, `%${search}%`)
        ) as any
      );
    }

    const where = filters.length > 0 ? and(...filters) : undefined;

    const [rows, totalRows] = await Promise.all([
      db.query.users.findMany({
        where,
        orderBy: [desc(users.createdAt)],
        limit,
        offset,
        columns: {
          id: true,
          phone: true,
          countryCode: true,
          walletAddress: true,
          isMerchant: true,
          email: true,
          suspendedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      db.select({ cnt: count() }).from(users).where(where),
    ]);

    const total = Number(totalRows[0]?.cnt ?? 0);

    return c.json({
      ok: true,
      data: {
        users: rows.map((u) => ({
          id: u.id,
          phone: u.phone,
          countryCode: u.countryCode,
          walletAddress: u.walletAddress,
          isMerchant: u.isMerchant,
          email: u.email,
          suspended: !!(u as any).suspendedAt,
          createdAt: u.createdAt.toISOString(),
          updatedAt: u.updatedAt.toISOString(),
        })),
        pagination: { total, page, limit, pages: Math.ceil(total / limit) },
      },
    });
  }
);

// GET /api/ops/users/:id
opsRouter.get(
  "/users/:id",
  zValidator("param", UuidParam),
  async (c) => {
    const { id } = c.req.valid("param");

    const [user, txHistory, sessionCount] = await Promise.all([
      db.query.users.findFirst({
        where: eq(users.id, id),
        columns: {
          id: true,
          phone: true,
          countryCode: true,
          walletAddress: true,
          externalWalletAddress: true,
          externalWalletType: true,
          isMerchant: true,
          email: true,
          suspendedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      db.query.transactions.findMany({
        where: or(eq(transactions.senderId, id), eq(transactions.recipientUserId, id)),
        orderBy: [desc(transactions.createdAt)],
        limit: 20,
      }),
      db.select({ cnt: count() }).from(sessions).where(eq(sessions.userId, id)),
    ]);

    if (!user) return c.json({ ok: false, error: "User not found" }, 404);

    const txStats = await db
      .select({
        totalVolume: sum(transactions.amountUsdc),
        txCount: count(),
      })
      .from(transactions)
      .where(eq(transactions.senderId, id));

    return c.json({
      ok: true,
      data: {
        user: {
          id: user.id,
          phone: user.phone,
          countryCode: user.countryCode,
          walletAddress: user.walletAddress,
          externalWalletAddress: user.externalWalletAddress,
          externalWalletType: user.externalWalletType,
          isMerchant: user.isMerchant,
          email: user.email,
          suspended: !!(user as any).suspendedAt,
          suspendedAt: (user as any).suspendedAt?.toISOString() ?? null,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        },
        stats: {
          totalVolumeUsdc: parseFloat(txStats[0]?.totalVolume ?? "0"),
          txCount: Number(txStats[0]?.txCount ?? 0),
          activeSessions: Number(sessionCount[0]?.cnt ?? 0),
        },
        recentTransactions: txHistory.map((tx) => ({
          id: tx.id,
          reference: tx.reference,
          direction: tx.senderId === id ? "out" : "in",
          recipientPhone: tx.recipientPhone,
          amountUsdc: parseFloat(tx.amountUsdc),
          amountLocal: parseFloat(tx.amountLocal),
          localCurrency: tx.localCurrency,
          rail: tx.rail,
          status: tx.status,
          createdAt: tx.createdAt.toISOString(),
        })),
      },
    });
  }
);

// POST /api/ops/users/:id/suspend
opsRouter.post(
  "/users/:id/suspend",
  zValidator("param", UuidParam),
  zValidator("json", z.object({ suspend: z.boolean() })),
  async (c) => {
    const { id } = c.req.valid("param");
    const { suspend } = c.req.valid("json");

    const user = await db.query.users.findFirst({ where: eq(users.id, id) });
    if (!user) return c.json({ ok: false, error: "User not found" }, 404);

    await db
      .update(users)
      .set({
        suspendedAt: suspend ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id));

    if (suspend) {
      await db.delete(sessions).where(eq(sessions.userId, id));
    }

    return c.json({ ok: true, data: { id, suspended: suspend } });
  }
);

// DELETE /api/ops/users/:id/sessions
opsRouter.delete(
  "/users/:id/sessions",
  zValidator("param", UuidParam),
  async (c) => {
    const { id } = c.req.valid("param");

    const result = await db.delete(sessions).where(eq(sessions.userId, id)).returning({ id: sessions.id });

    return c.json({ ok: true, data: { userId: id, deletedSessions: result.length } });
  }
);

// ── Merchants ─────────────────────────────────────────────────────────────────

// GET /api/ops/merchants
opsRouter.get(
  "/merchants",
  zValidator("query", PaginationSchema),
  async (c) => {
    const { page, limit } = c.req.valid("query");
    const offset = (page - 1) * limit;

    const [rows, totalRows] = await Promise.all([
      db.query.merchantSettings.findMany({
        orderBy: [desc(merchantSettings.createdAt)],
        limit,
        offset,
        with: {
          user: {
            columns: { id: true, phone: true, countryCode: true, email: true, createdAt: true },
          },
        },
      }),
      db.select({ cnt: count() }).from(merchantSettings),
    ]);

    const total = Number(totalRows[0]?.cnt ?? 0);

    const merchantIds = rows.map((r) => (r as any).user?.id).filter(Boolean);
    const volumeRows =
      merchantIds.length > 0
        ? await db
            .select({
              merchantId: transactions.merchantId,
              totalVol: sum(transactions.amountUsdc),
              txCount: count(),
            })
            .from(transactions)
            .where(inArray(transactions.merchantId, merchantIds))
            .groupBy(transactions.merchantId)
        : [];

    const volMap = new Map(volumeRows.map((r) => [r.merchantId, r]));

    return c.json({
      ok: true,
      data: {
        merchants: rows.map((m) => {
          const userId = (m as any).user?.id;
          const vol = volMap.get(userId);
          return {
            id: m.id,
            userId,
            businessName: m.businessName,
            tillOpen: m.tillOpen,
            feeBps: m.feeBps,
            settleRail: m.settleRail,
            settleSchedule: m.settleSchedule,
            autoSettleTo: m.autoSettleTo,
            lastSettledAt: m.lastSettledAt?.toISOString() ?? null,
            phone: (m as any).user?.phone ?? null,
            countryCode: (m as any).user?.countryCode ?? null,
            email: (m as any).user?.email ?? null,
            memberSince: (m as any).user?.createdAt?.toISOString() ?? null,
            totalVolumeUsdc: parseFloat(vol?.totalVol ?? "0"),
            txCount: Number(vol?.txCount ?? 0),
          };
        }),
        pagination: { total, page, limit, pages: Math.ceil(total / limit) },
      },
    });
  }
);

// PATCH /api/ops/merchants/:userId/till
opsRouter.patch(
  "/merchants/:userId/till",
  zValidator("param", UuidParam),
  zValidator("json", z.object({ open: z.boolean() })),
  async (c) => {
    const { id: userId } = c.req.valid("param");
    const { open } = c.req.valid("json");

    const result = await db
      .update(merchantSettings)
      .set({ tillOpen: open, updatedAt: new Date() })
      .where(eq(merchantSettings.userId, userId))
      .returning({ tillOpen: merchantSettings.tillOpen });

    if (!result.length) return c.json({ ok: false, error: "Merchant not found" }, 404);

    return c.json({ ok: true, data: { userId, tillOpen: open } });
  }
);

// PATCH /api/ops/merchants/:userId/fee-bps
opsRouter.patch(
  "/merchants/:userId/fee-bps",
  zValidator("param", UuidParam),
  zValidator("json", z.object({ feeBps: z.number().int().min(0).max(10000) })),
  async (c) => {
    const { id: userId } = c.req.valid("param");
    const { feeBps } = c.req.valid("json");

    const result = await db
      .update(merchantSettings)
      .set({ feeBps, updatedAt: new Date() })
      .where(eq(merchantSettings.userId, userId))
      .returning({ feeBps: merchantSettings.feeBps });

    if (!result.length) return c.json({ ok: false, error: "Merchant not found" }, 404);

    return c.json({ ok: true, data: { userId, feeBps } });
  }
);

// ── FX Rates ─────────────────────────────────────────────────────────────────

// GET /api/ops/fx
opsRouter.get("/fx", async (c) => {
  const currencies = ["KES", "NGN", "GHS", "UGX", "TZS", "XOF"];

  const latestRates = await Promise.all(
    currencies.map(async (currency) => {
      const row = await db.query.fxRates.findFirst({
        where: eq(fxRates.toCurrency, currency),
        orderBy: [desc(fxRates.fetchedAt)],
      });
      return row;
    })
  );

  return c.json({
    ok: true,
    data: {
      rates: latestRates
        .filter(Boolean)
        .map((r) => ({
          currency: r!.toCurrency,
          midRate: parseFloat(r!.midRate),
          tumaRate: parseFloat(r!.tumaRate),
          spread: parseFloat(r!.spread),
          source: r!.source,
          fetchedAt: r!.fetchedAt.toISOString(),
        })),
    },
  });
});

// GET /api/ops/fx/history
opsRouter.get(
  "/fx/history",
  zValidator(
    "query",
    z.object({
      currency: z.string().optional(),
      days: z.coerce.number().int().min(1).max(90).default(7),
    })
  ),
  async (c) => {
    const { currency, days } = c.req.valid("query");
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await db.query.fxRates.findMany({
      where: and(
        currency ? eq(fxRates.toCurrency, currency) : undefined,
        gte(fxRates.fetchedAt, since)
      ),
      orderBy: [desc(fxRates.fetchedAt)],
      limit: 500,
    });

    return c.json({
      ok: true,
      data: {
        history: rows.map((r) => ({
          id: r.id,
          currency: r.toCurrency,
          midRate: parseFloat(r.midRate),
          tumaRate: parseFloat(r.tumaRate),
          spread: parseFloat(r.spread),
          source: r.source,
          fetchedAt: r.fetchedAt.toISOString(),
        })),
      },
    });
  }
);

// POST /api/ops/fx/override — emergency manual rate override
opsRouter.post(
  "/fx/override",
  zValidator(
    "json",
    z.object({
      currency: z.string().min(2).max(6),
      tumaRate: z.number().positive(),
      note: z.string().max(500).optional(),
    })
  ),
  async (c) => {
    const { currency, tumaRate, note } = c.req.valid("json");

    const latest = await db.query.fxRates.findFirst({
      where: eq(fxRates.toCurrency, currency),
      orderBy: [desc(fxRates.fetchedAt)],
    });

    if (!latest) {
      return c.json({ ok: false, error: `No existing rate for ${currency}` }, 404);
    }

    const mid = parseFloat(latest.midRate);
    const spread = mid > 0 ? (1 - tumaRate / mid).toFixed(4) : "0";

    const [inserted] = await db
      .insert(fxRates)
      .values({
        fromCurrency: "USD",
        toCurrency: currency,
        midRate: latest.midRate,
        tumaRate: String(tumaRate),
        spread,
        source: `ops_override:${operator(c)}${note ? `:${note}` : ""}`,
        fetchedAt: new Date(),
      })
      .returning();

    return c.json({
      ok: true,
      data: {
        currency,
        tumaRate,
        midRate: mid,
        spread: parseFloat(spread),
        overriddenBy: operator(c),
        note: note ?? null,
        fetchedAt: inserted.fetchedAt.toISOString(),
      },
    });
  }
);

// ── Worker Health ─────────────────────────────────────────────────────────────

opsRouter.get(
  "/health/heartbeats",
  zValidator("query", HeartbeatQuerySchema),
  async (c) => {
    const { staleOnly, failOnStale } = c.req.valid("query");
    const data = await listHeartbeatStatus(staleOnly);
    const status = (failOnStale && data.staleCount > 0 ? 503 : 200) as 200 | 503;
    return c.json({ ok: data.staleCount === 0, data }, status);
  }
);

// GET /api/ops/health/queues — BullMQ queue depths
opsRouter.get("/health/queues", async (c) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function queueDepth(queue: { getJobCounts: (...args: any[]) => Promise<Record<string, number>> } | null) {
    if (!queue) return null;
    try {
      const counts = await queue.getJobCounts(
        "waiting",
        "active",
        "delayed",
        "failed",
        "completed"
      );
      return counts;
    } catch {
      return null;
    }
  }

  const [settlement, escrow, rail, notify] = await Promise.all([
    queueDepth(settlementQueue),
    queueDepth(escrowQueue),
    queueDepth(railQueue),
    queueDepth(notifyQueue),
  ]);

  return c.json({
    ok: true,
    data: {
      queues: {
        settlement_poll: settlement,
        escrow_expire: escrow,
        rail_disburse: rail,
        whatsapp_notify: notify,
      },
    },
  });
});

// ── Notifications ─────────────────────────────────────────────────────────────

// GET /api/ops/notifications — recent failed/pending notifications derived from transactions
opsRouter.get(
  "/notifications",
  zValidator("query", PaginationSchema),
  async (c) => {
    const { page, limit } = c.req.valid("query");
    const offset = (page - 1) * limit;

    const [rows, totalRows] = await Promise.all([
      db.query.transactions.findMany({
        where: or(
          eq(transactions.status, "failed"),
          eq(transactions.status, "requires_review")
        ),
        orderBy: [desc(transactions.updatedAt)],
        limit,
        offset,
      }),
      db
        .select({ cnt: count() })
        .from(transactions)
        .where(
          or(
            eq(transactions.status, "failed"),
            eq(transactions.status, "requires_review")
          )
        ),
    ]);

    const total = Number(totalRows[0]?.cnt ?? 0);

    return c.json({
      ok: true,
      data: {
        notifications: rows.map((tx) => ({
          transactionId: tx.id,
          reference: tx.reference,
          recipientPhone: tx.recipientPhone,
          amountUsdc: parseFloat(tx.amountUsdc),
          localCurrency: tx.localCurrency,
          rail: tx.rail,
          status: tx.status,
          failureStage: tx.failureStage,
          failureReason: tx.failureReason,
          isEscrow: tx.isEscrow,
          escrowRef: tx.escrowRef,
          updatedAt: tx.updatedAt.toISOString(),
        })),
        pagination: { total, page, limit, pages: Math.ceil(total / limit) },
      },
    });
  }
);

// ── Financial Reports ─────────────────────────────────────────────────────────

// GET /api/ops/reports/volume — daily volume breakdown
opsRouter.get(
  "/reports/volume",
  zValidator(
    "query",
    z.object({
      days: z.coerce.number().int().min(1).max(365).default(30),
      rail: z.string().optional(),
    })
  ),
  async (c) => {
    const { days, rail } = c.req.valid("query");
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const filters: ReturnType<typeof eq>[] = [
      gte(transactions.createdAt, since),
      eq(transactions.status, "settled"),
    ];
    if (rail) filters.push(eq(transactions.rail, rail as any));

    const rows = await db
      .select({
        date: sql<string>`date_trunc('day', ${transactions.createdAt})::date`,
        volumeUsdc: sum(transactions.amountUsdc),
        feesUsdc: sum(transactions.feeUsdc),
        txCount: count(),
      })
      .from(transactions)
      .where(and(...filters))
      .groupBy(sql`date_trunc('day', ${transactions.createdAt})::date`)
      .orderBy(sql`date_trunc('day', ${transactions.createdAt})::date`);

    return c.json({
      ok: true,
      data: {
        chart: rows.map((r) => ({
          date: r.date,
          volumeUsdc: parseFloat(r.volumeUsdc ?? "0"),
          feesUsdc: parseFloat(r.feesUsdc ?? "0"),
          txCount: Number(r.txCount),
        })),
      },
    });
  }
);

// GET /api/ops/reports/rails — settlement success rate per rail
opsRouter.get("/reports/rails", async (c) => {
  const rows = await db
    .select({
      rail: transactions.rail,
      total: count(),
      settled: sql<number>`count(*) filter (where status = 'settled')`,
      failed: sql<number>`count(*) filter (where status = 'failed')`,
      review: sql<number>`count(*) filter (where status = 'requires_review')`,
      avgUsdc: sql<string>`avg(amount_usdc)`,
    })
    .from(transactions)
    .where(gte(transactions.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)))
    .groupBy(transactions.rail);

  return c.json({
    ok: true,
    data: {
      rails: rows.map((r) => ({
        rail: r.rail,
        total: Number(r.total),
        settled: Number(r.settled),
        failed: Number(r.failed),
        requiresReview: Number(r.review),
        successRate: Number(r.total) > 0 ? Number(r.settled) / Number(r.total) : 0,
        avgAmountUsdc: parseFloat(r.avgUsdc ?? "0"),
      })),
    },
  });
});

// GET /api/ops/reports/escrow-claim-rate
opsRouter.get("/reports/escrow-claim-rate", async (c) => {
  const [totals] = await db
    .select({
      total: count(),
      claimed: sql<number>`count(*) filter (where status = 'claimed')`,
      refunded: sql<number>`count(*) filter (where status = 'refunded')`,
      expired: sql<number>`count(*) filter (where status = 'expired')`,
      pending: sql<number>`count(*) filter (where status = 'pending')`,
    })
    .from(escrowPayments);

  return c.json({
    ok: true,
    data: {
      total: Number(totals?.total ?? 0),
      claimed: Number(totals?.claimed ?? 0),
      refunded: Number(totals?.refunded ?? 0),
      expired: Number(totals?.expired ?? 0),
      pending: Number(totals?.pending ?? 0),
      claimRate:
        Number(totals?.total ?? 0) > 0
          ? Number(totals?.claimed ?? 0) / Number(totals?.total ?? 0)
          : 0,
    },
  });
});
