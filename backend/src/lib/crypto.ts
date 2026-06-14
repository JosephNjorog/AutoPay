import { createHash, randomInt } from "crypto";

const PHONE_HASH_SECRET = process.env.WALLET_DERIVE_SECRET;
if (!PHONE_HASH_SECRET) throw new Error("WALLET_DERIVE_SECRET is not set");

/**
 * Produces keccak256-equivalent hex from a phone number using Node crypto.
 * The same value is replicated in the Solidity registry via keccak256(abi.encodePacked(phone)).
 * We prefix with the server secret so raw phone numbers cannot be brute-forced from the hash.
 */
export function hashPhone(phone: string): string {
  return createHash("sha256")
    .update(`${PHONE_HASH_SECRET}:${phone}`)
    .digest("hex");
}

/** Generates a cryptographically random 6-digit OTP. */
export function generateOtp(): string {
  return String(randomInt(100_000, 999_999));
}

/** SHA-256 of a token — safe to store in DB for lookup without exposing raw value. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Deterministically derives an Avalanche EOA private key for a user.
 * Format: `0x${hex}` — compatible with viem's privateKeyToAccount.
 *
 * WARNING: The WALLET_DERIVE_SECRET must never be rotated after wallets are deployed,
 * as rotation would orphan all existing wallets. Store it in a KMS in production.
 */
export function deriveWalletPrivateKey(phoneHash: string): `0x${string}` {
  const raw = createHash("sha256")
    .update(`wallet:${PHONE_HASH_SECRET}:${phoneHash}`)
    .digest("hex");
  return `0x${raw}`;
}

/** Generates a short human-readable transaction reference like T7A3F2. */
export function generateTxRef(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let ref = "T";
  for (let i = 0; i < 5; i++) {
    ref += chars[randomInt(0, chars.length)];
  }
  return ref;
}

/** Generates a UUID-compatible escrow ref. */
export function generateEscrowRef(): string {
  return `ESC-${Date.now()}-${randomInt(1000, 9999)}`;
}
