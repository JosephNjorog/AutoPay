import type { Context } from "hono";
import { recordSettlementStep } from "../services/settlement";
import { ValidationError } from "./errors";
import { del, setnxTtl } from "./redis";

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:-]+$/;

/** Reads + validates an idempotency key from the request body or headers. */
export function normalizeIdempotencyKey(c: Context, bodyKey?: string): string | null {
  const key =
    bodyKey ??
    c.req.header("idempotency-key") ??
    c.req.header("x-idempotency-key") ??
    null;

  if (!key) return null;

  const trimmed = key.trim();
  if (
    trimmed.length < 8 ||
    trimmed.length > 128 ||
    !IDEMPOTENCY_KEY_RE.test(trimmed)
  ) {
    throw new ValidationError(
      "Idempotency key must be 8-128 characters using letters, numbers, '.', '_', ':', or '-'"
    );
  }

  return trimmed;
}

/**
 * Acquires a short-lived Redis lock so two concurrent requests with the same
 * idempotency key can't both proceed past the DB replay check. `scope`
 * namespaces the lock per route (e.g. "send", "pay") so keys can't collide
 * across features.
 */
export async function acquireIdempotencyLock(
  scope: string,
  userId: string,
  idempotencyKey: string | null
): Promise<string | null> {
  if (!idempotencyKey) return null;

  const lockKey = `idem:${scope}:${userId}:${idempotencyKey}`;
  const acquired = await setnxTtl(lockKey, 120);
  return acquired ? lockKey : null;
}

export async function releaseIdempotencyLock(lockKey: string | null): Promise<void> {
  if (!lockKey) return;

  try {
    await del(lockKey);
  } catch (err) {
    console.error(`[Idempotency] Failed to release lock ${lockKey}:`, errorMessage(err));
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function markRequiresReview(
  transactionId: string,
  stage: string,
  err: unknown
): Promise<void> {
  await recordSettlementStep(transactionId, "requires_review", {
    stage,
    error: errorMessage(err),
  });
}
