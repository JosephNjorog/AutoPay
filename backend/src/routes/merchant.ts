import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../db";
import { merchantSettings, transactions, users } from "../db/schema";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { MerchantSettingsSchema } from "@tuma/shared";
import { NotFoundError } from "../lib/errors";

export const merchantRouter = new Hono();
merchantRouter.use("*", authMiddleware);

// GET /api/merchant/settings
merchantRouter.get("/settings", async (c) => {
  const { sub: userId } = c.get("user");

  const settings = await db.query.merchantSettings.findFirst({
    where: eq(merchantSettings.userId, userId),
  });

  if (!settings) {
    return c.json({
      ok: true,
      data: null,
      message: "Merchant mode not enabled. POST /api/merchant/settings to set up.",
    });
  }

  return c.json({ ok: true, data: settings });
});

// PUT /api/merchant/settings
merchantRouter.put(
  "/settings",
  zValidator("json", MerchantSettingsSchema),
  async (c) => {
    const { sub: userId } = c.get("user");
    const body = c.req.valid("json");

    // Upsert merchant settings
    const [result] = await db
      .insert(merchantSettings)
      .values({ userId, ...body })
      .onConflictDoUpdate({
        target: merchantSettings.userId,
        set: { ...body, updatedAt: new Date() },
      })
      .returning();

    // Mark user as merchant
    await db.update(users).set({ isMerchant: true }).where(eq(users.id, userId));

    return c.json({ ok: true, data: result });
  }
);

// GET /api/merchant/stats
merchantRouter.get("/stats", async (c) => {
  const { sub: userId } = c.get("user");

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [todayResult, weekResult, monthResult, customersResult] =
    await Promise.all([
      db
        .select({ total: sql<string>`sum(amount_usdc)`, count: sql<number>`count(*)` })
        .from(transactions)
        .where(
          and(
            eq(transactions.merchantId, userId),
            gte(transactions.createdAt, startOfDay),
            eq(transactions.status, "settled")
          )
        ),
      db
        .select({ total: sql<string>`sum(amount_usdc)` })
        .from(transactions)
        .where(
          and(
            eq(transactions.merchantId, userId),
            gte(transactions.createdAt, startOfWeek),
            eq(transactions.status, "settled")
          )
        ),
      db
        .select({ total: sql<string>`sum(amount_usdc)` })
        .from(transactions)
        .where(
          and(
            eq(transactions.merchantId, userId),
            gte(transactions.createdAt, startOfMonth),
            eq(transactions.status, "settled")
          )
        ),
      db
        .select({ count: sql<number>`count(distinct sender_id)` })
        .from(transactions)
        .where(
          and(
            eq(transactions.merchantId, userId),
            gte(transactions.createdAt, startOfMonth)
          )
        ),
    ]);

  return c.json({
    ok: true,
    data: {
      today: {
        revenueUsd: parseFloat(todayResult[0]?.total ?? "0"),
        transactions: Number(todayResult[0]?.count ?? 0),
      },
      week: { revenueUsd: parseFloat(weekResult[0]?.total ?? "0") },
      month: { revenueUsd: parseFloat(monthResult[0]?.total ?? "0") },
      customers: Number(customersResult[0]?.count ?? 0),
    },
  });
});

// GET /api/merchant/transactions
merchantRouter.get("/transactions", async (c) => {
  const { sub: userId } = c.get("user");

  const txs = await db.query.transactions.findMany({
    where: and(
      eq(transactions.merchantId, userId),
      eq(transactions.isMerchantPayment, true)
    ),
    orderBy: [desc(transactions.createdAt)],
    limit: 50,
  });

  return c.json({ ok: true, data: { transactions: txs } });
});

// PATCH /api/merchant/till
merchantRouter.patch(
  "/till",
  zValidator("json", z.object({ open: z.boolean() })),
  async (c) => {
    const { sub: userId } = c.get("user");
    const { open } = c.req.valid("json");

    const existing = await db.query.merchantSettings.findFirst({
      where: eq(merchantSettings.userId, userId),
    });

    if (!existing) throw new NotFoundError("Merchant settings");

    await db
      .update(merchantSettings)
      .set({ tillOpen: open, updatedAt: new Date() })
      .where(eq(merchantSettings.userId, userId));

    return c.json({ ok: true, data: { tillOpen: open } });
  }
);
