import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) throw new Error("REDIS_URL is not set");

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on("error", (err) => {
  console.error("[Redis] Connection error:", err.message);
});

// ── Key helpers ───────────────────────────────────────────────────────────────

export const keys = {
  otp: (phone: string) => `otp:${phone}`,
  otpAttempts: (phone: string) => `otp_attempts:${phone}`,
  fxQuote: (quoteId: string) => `fx_quote:${quoteId}`,
  fxRate: (currency: string) => `fx_rate:${currency}`,
  session: (tokenHash: string) => `session:${tokenHash}`,
  rateLimit: (ip: string, route: string) => `rl:${route}:${ip}`,
  walletNonce: (address: string) => `nonce:${address}`,
};

// ── Typed helpers ─────────────────────────────────────────────────────────────

export async function setex<T>(key: string, ttlSeconds: number, value: T): Promise<void> {
  await redis.setex(key, ttlSeconds, JSON.stringify(value));
}

export async function getJson<T>(key: string): Promise<T | null> {
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function del(key: string): Promise<void> {
  await redis.del(key);
}

export async function incr(key: string, ttlSeconds?: number): Promise<number> {
  const count = await redis.incr(key);
  if (ttlSeconds && count === 1) {
    await redis.expire(key, ttlSeconds);
  }
  return count;
}
