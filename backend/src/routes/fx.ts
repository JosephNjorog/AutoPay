import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { FxQuoteRequestSchema } from "@tuma/shared";
import { authMiddleware } from "../middleware/auth";
import { createFxQuote, getLatestRates, getTokenPricesUsd } from "../services/fx";

export const fxRouter = new Hono();

// GET /api/fx/rates — public, used by landing page
fxRouter.get("/rates", async (c) => {
  const rates = await getLatestRates();
  return c.json({ ok: true, data: { rates } });
});

// GET /api/fx/token-prices — public. Live USD price per unit for the
// assets Autopayke treats as spendable/sendable (USDC/USDT/AVAX) — used by
// the Wallet page's Rates tab.
fxRouter.get("/token-prices", async (c) => {
  const prices = await getTokenPricesUsd();
  return c.json({ ok: true, data: { prices } });
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
