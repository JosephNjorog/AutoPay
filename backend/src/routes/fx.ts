import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { FxQuoteRequestSchema } from "@tuma/shared";
import { authMiddleware } from "../middleware/auth";
import { createFxQuote, getLatestRates } from "../services/fx";

export const fxRouter = new Hono();

// GET /api/fx/rates — public, used by landing page
fxRouter.get("/rates", async (c) => {
  const rates = await getLatestRates();
  return c.json({ ok: true, data: { rates } });
});

// POST /api/fx/quote — requires auth
fxRouter.post(
  "/quote",
  authMiddleware,
  zValidator("json", FxQuoteRequestSchema),
  async (c) => {
    const { amountUsd, recipientPhone, token } = c.req.valid("json");
    const quote = await createFxQuote(amountUsd, recipientPhone, token);
    return c.json({ ok: true, data: quote });
  }
);
