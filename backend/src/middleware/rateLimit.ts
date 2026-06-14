import type { Context, Next } from "hono";
import { incr } from "../lib/redis";
import { RateLimitError } from "../lib/errors";

type RateLimitOptions = {
  /** Max requests allowed within the window. */
  max: number;
  /** Window duration in seconds. */
  windowSeconds: number;
  /** Route identifier — used to scope the key. */
  route: string;
};

export function rateLimit(opts: RateLimitOptions) {
  return async (c: Context, next: Next) => {
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      "unknown";

    const key = `rl:${opts.route}:${ip}`;
    const count = await incr(key, opts.windowSeconds);

    if (count > opts.max) {
      throw new RateLimitError(
        `Rate limit exceeded. Max ${opts.max} requests per ${opts.windowSeconds}s.`
      );
    }

    c.header("X-RateLimit-Limit", String(opts.max));
    c.header("X-RateLimit-Remaining", String(Math.max(0, opts.max - count)));

    await next();
  };
}

// Pre-configured limiters for common routes
export const otpSendLimiter = rateLimit({ max: 3, windowSeconds: 300, route: "otp_send" });
export const otpVerifyLimiter = rateLimit({ max: 5, windowSeconds: 300, route: "otp_verify" });
export const sendMoneyLimiter = rateLimit({ max: 10, windowSeconds: 60, route: "send" });
export const generalLimiter = rateLimit({ max: 120, windowSeconds: 60, route: "general" });
