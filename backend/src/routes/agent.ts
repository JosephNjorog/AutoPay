import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../db";
import { agentPermissions, agentAuditLog } from "../db/schema";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { NotFoundError } from "../lib/errors";
import { PhoneSchema } from "@tuma/shared";
import { removeQueuedAgentReviewsForUser } from "../lib/queue";

export const agentRouter = new Hono();
agentRouter.use("*", authMiddleware);

const PermissionsSchema = z.object({
  maxTransactionUsd: z.number().positive(),
  approvedRecipients: z.array(PhoneSchema).default([]),
  approvedCorridors: z.array(z.string()).default([]),
  maxTxPerDay: z.number().int().positive(),
});

// GET /api/agent/permissions
agentRouter.get("/permissions", async (c) => {
  const { sub: userId } = c.get("user");

  const permissions = await db.query.agentPermissions.findFirst({
    where: eq(agentPermissions.userId, userId),
  });

  return c.json({ ok: true, data: permissions ?? null });
});

// PUT /api/agent/permissions — create or update the caller's agent grant.
agentRouter.put("/permissions", zValidator("json", PermissionsSchema), async (c) => {
  const { sub: userId } = c.get("user");
  const { maxTransactionUsd, approvedRecipients, approvedCorridors, maxTxPerDay } =
    c.req.valid("json");

  const existing = await db.query.agentPermissions.findFirst({
    where: eq(agentPermissions.userId, userId),
  });

  const values = {
    maxTransactionUsd: maxTransactionUsd.toFixed(2),
    approvedRecipients,
    approvedCorridors,
    maxTxPerDay,
  };

  const [row] = existing
    ? await db
        .update(agentPermissions)
        .set({ ...values, version: existing.version + 1, updatedAt: new Date() })
        .where(eq(agentPermissions.userId, userId))
        .returning()
    : await db.insert(agentPermissions).values({ userId, ...values }).returning();

  await db.insert(agentAuditLog).values({
    userId,
    eventType: existing ? "permission_updated" : "permission_granted",
    detail: { ...values, version: row.version },
  });

  return c.json({ ok: true, data: row });
});

// POST /api/agent/kill-switch — { confirm: true } is the explicit
// second-step safety gate, mirroring ops.ts's { suspend: boolean } pattern.
agentRouter.post(
  "/kill-switch",
  zValidator("json", z.object({ confirm: z.literal(true) })),
  async (c) => {
    const { sub: userId } = c.get("user");

    const existing = await db.query.agentPermissions.findFirst({
      where: eq(agentPermissions.userId, userId),
    });
    if (!existing) throw new NotFoundError("Agent permissions");

    await db
      .update(agentPermissions)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(agentPermissions.userId, userId));

    const removedJobs = await removeQueuedAgentReviewsForUser(userId);

    await db.insert(agentAuditLog).values({
      userId,
      eventType: "kill_switch_activated",
      detail: { removedQueuedJobs: removedJobs },
    });

    return c.json({ ok: true, data: { revoked: true, removedQueuedJobs: removedJobs } });
  }
);

// GET /api/agent/audit-log?from=&to=
agentRouter.get(
  "/audit-log",
  zValidator(
    "query",
    z.object({
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    })
  ),
  async (c) => {
    const { sub: userId } = c.get("user");
    const { from, to, limit } = c.req.valid("query");

    const conditions = [eq(agentAuditLog.userId, userId)];
    if (from) conditions.push(gte(agentAuditLog.createdAt, new Date(from)));
    if (to) conditions.push(lte(agentAuditLog.createdAt, new Date(to)));

    const events = await db.query.agentAuditLog.findMany({
      where: and(...conditions),
      orderBy: [desc(agentAuditLog.createdAt)],
      limit,
    });

    return c.json({ ok: true, data: { events } });
  }
);
