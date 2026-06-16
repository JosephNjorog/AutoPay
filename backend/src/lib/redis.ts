import Redis from "ioredis";

// ── In-memory fallback (dev / demo when REDIS_URL is not set) ────────────────
type MemEntry = { value: string; expiresAt: number | null };
const _mem = new Map<string, MemEntry>();

function _memGet(key: string): string | null {
  const e = _mem.get(key);
  if (!e) return null;
  if (e.expiresAt !== null && Date.now() > e.expiresAt) { _mem.delete(key); return null; }
  return e.value;
}

const _memStore = {
  async get(key: string) { return _memGet(key); },
  async setex(key: string, ttl: number, value: string) {
    _mem.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
  },
  async del(key: string) { _mem.delete(key); },
  async incr(key: string): Promise<number> {
    const cur = parseInt(_memGet(key) ?? "0", 10);
    const next = cur + 1;
    const existing = _mem.get(key);
    _mem.set(key, { value: String(next), expiresAt: existing?.expiresAt ?? null });
    return next;
  },
  async expire(key: string, ttl: number) {
    const e = _mem.get(key);
    if (e) _mem.set(key, { ...e, expiresAt: Date.now() + ttl * 1000 });
  },
};

// ── Real Redis (required in production) ──────────────────────────────────────
const redisUrl = process.env.REDIS_URL;

if (!redisUrl && process.env.NODE_ENV === "production") {
  throw new Error("REDIS_URL is required in production");
}

let _redis: Redis | null = null;
if (redisUrl) {
  _redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });
  _redis.on("error", (err) => console.error("[Redis] Connection error:", err.message));
} else {
  console.warn("[Redis] REDIS_URL not set — using in-memory store (dev/demo only)");
}

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

// ── Typed helpers (delegates to Redis or in-memory) ───────────────────────────
export async function setex<T>(key: string, ttlSeconds: number, value: T): Promise<void> {
  const serialized = JSON.stringify(value);
  if (_redis) {
    await _redis.setex(key, ttlSeconds, serialized);
  } else {
    await _memStore.setex(key, ttlSeconds, serialized);
  }
}

export async function getJson<T>(key: string): Promise<T | null> {
  const raw = _redis ? await _redis.get(key) : await _memStore.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export async function del(key: string): Promise<void> {
  if (_redis) await _redis.del(key);
  else await _memStore.del(key);
}

export async function incr(key: string, ttlSeconds?: number): Promise<number> {
  if (_redis) {
    const count = await _redis.incr(key);
    if (ttlSeconds && count === 1) await _redis.expire(key, ttlSeconds);
    return count;
  }
  const count = await _memStore.incr(key);
  if (ttlSeconds && count === 1) await _memStore.expire(key, ttlSeconds);
  return count;
}
