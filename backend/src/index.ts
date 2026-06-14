import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { serve } from "@hono/node-server";

import { authRouter } from "./routes/auth";
import { walletRouter } from "./routes/wallet";
import { fxRouter } from "./routes/fx";
import { sendRouter } from "./routes/send";
import { receiveRouter } from "./routes/receive";
import { fundRouter, paystackWebhookRouter } from "./routes/fund";
import { historyRouter } from "./routes/history";
import { trackRouter } from "./routes/track";
import { claimRouter } from "./routes/claim";
import { merchantRouter } from "./routes/merchant";
import { isKnownError } from "./lib/errors";

const app = new Hono();

// ── Global middleware ─────────────────────────────────────────────────────────

app.use("*", logger());
app.use("*", prettyJSON());
app.use(
  "*",
  cors({
    origin: (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(","),
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// ── Health check ──────────────────────────────────────────────────────────────

app.get("/health", (c) =>
  c.json({ ok: true, service: "tuma-api", version: "1.0.0", ts: new Date().toISOString() })
);

// ── Routes ────────────────────────────────────────────────────────────────────

app.route("/api/auth", authRouter);
app.route("/api/wallet", walletRouter);
app.route("/api/fx", fxRouter);
app.route("/api/send", sendRouter);
app.route("/api/receive", receiveRouter);
app.route("/api/fund", fundRouter);
app.route("/api/history", historyRouter);
app.route("/api/track", trackRouter);
app.route("/api/claim", claimRouter);
app.route("/api/merchant", merchantRouter);

// Paystack webhook — public endpoint (signature-verified internally)
app.route("/webhooks/paystack", paystackWebhookRouter);

// M-Pesa webhooks
app.post("/webhooks/mpesa/result", async (c) => {
  const body = await c.req.json();
  console.log("[Webhook] M-Pesa B2C result:", JSON.stringify(body));
  // TODO: parse B2CResult, update transaction status
  return c.json({ ResultCode: 0, ResultDesc: "Success" });
});

app.post("/webhooks/mpesa/timeout", async (c) => {
  console.warn("[Webhook] M-Pesa timeout received");
  return c.json({ ResultCode: 0, ResultDesc: "Success" });
});

app.post("/webhooks/mpesa/stk", async (c) => {
  const body = await c.req.json();
  console.log("[Webhook] M-Pesa STK result:", JSON.stringify(body));
  return c.json({ ResultCode: 0, ResultDesc: "Success" });
});

// MTN MoMo callback
app.post("/webhooks/momo", async (c) => {
  const body = await c.req.json();
  console.log("[Webhook] MoMo callback:", JSON.stringify(body));
  return c.json({ received: true });
});

// ── Global error handler ──────────────────────────────────────────────────────

app.onError((err, c) => {
  if (isKnownError(err)) {
    return c.json({ ok: false, error: err.message, code: err.code }, err.statusCode as 400 | 401 | 402 | 404 | 410 | 422 | 429 | 502);
  }

  console.error("[API] Unhandled error:", err);
  return c.json(
    { ok: false, error: "Internal server error", code: "INTERNAL_ERROR" },
    500
  );
});

app.notFound((c) =>
  c.json({ ok: false, error: "Not found", code: "NOT_FOUND" }, 404)
);

// ── Start ─────────────────────────────────────────────────────────────────────

const port = parseInt(process.env.PORT ?? "3001");

serve({ fetch: app.fetch, port }, () => {
  console.log(`\n🚀 TUMA API running on http://localhost:${port}`);
  console.log(`   Environment: ${process.env.NODE_ENV ?? "development"}`);
  console.log(`   Health: http://localhost:${port}/health\n`);
});

export default app;
