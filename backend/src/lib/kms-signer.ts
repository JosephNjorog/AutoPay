/**
 * AWS KMS-backed signer for the relayer/signer accounts.
 *
 * Why this exists: the relayer key is the single highest-value secret in the
 * whole system — see the contract audit notes — and the signer key isn't far
 * behind (it authorizes escrow claims). Holding either as a raw value in an
 * env var means anyone who can read the process environment (a leaked .env,
 * a compromised CI job, a misconfigured logging pipeline) has unrestricted,
 * undetectable use of it forever. An AWS KMS asymmetric key never leaves
 * AWS — signing happens inside KMS via the Sign API, the private material is
 * never exposed to this process, and every signature is in CloudTrail.
 *
 * How it works: KMS supports ECC_SECG_P256K1 keys, which is exactly
 * secp256k1 — Ethereum's curve. We ask KMS to sign a pre-computed digest
 * with SigningAlgorithm "ECDSA_SHA_256" and MessageType "DIGEST" — in DIGEST
 * mode KMS does not hash the input itself, it just runs raw ECDSA over
 * whatever 32 bytes you hand it, so handing it a keccak256 digest (rather
 * than the SHA-256 the algorithm name implies) works correctly. KMS returns
 * a DER-encoded (r, s) signature with no recovery id — Ethereum signatures
 * need one, so we recover it by trying both possible values and checking
 * which one's recovered public key matches the address KMS actually holds.
 *
 * Setup (not done by this code — needs real AWS credentials):
 *   1. Create an asymmetric KMS key: KeySpec=ECC_SECG_P256K1, KeyUsage=SIGN_VERIFY.
 *   2. Grant the backend's IAM role kms:Sign and kms:GetPublicKey on that key.
 *   3. Set RELAYER_KMS_KEY_ID (or SIGNER_KMS_KEY_ID) to the key's ARN/id.
 *   4. Leave RELAYER_PRIVATE_KEY/SIGNER_PRIVATE_KEY unset in that environment —
 *      getRelayerOrSignerAccount() prefers KMS whenever its key id is set.
 *   5. AWS credentials are picked up from the standard SDK provider chain
 *      (env vars, an attached IAM role on Render/ECS/EC2, etc.) — nothing
 *      AWS-specific needs to be passed to this module directly.
 *
 * This module is not yet exercised against a real KMS key in this codebase —
 * there's a local-keypair self-test in kms-signer.test.ts that proves the
 * DER-parsing/recovery-id/address-derivation logic is correct independent of
 * AWS, but the actual KMS API calls (GetPublicKey, Sign) should be smoke
 * tested against a real (ideally non-production) key before this is trusted
 * with the real relayer role.
 */

import { KMSClient, GetPublicKeyCommand, SignCommand } from "@aws-sdk/client-kms";
import { secp256k1 } from "@noble/curves/secp256k1";
import {
  keccak256,
  hashMessage,
  hashTypedData,
  hexToBytes,
  serializeTransaction,
  serializeSignature,
  type Address,
  type Hex,
} from "viem";
import { toAccount, privateKeyToAccount, type LocalAccount } from "viem/accounts";

let kmsClient: KMSClient | null = null;
function getKmsClient(): KMSClient {
  if (!kmsClient) kmsClient = new KMSClient({});
  return kmsClient;
}

/** Extracts the raw 65-byte uncompressed EC point from a KMS SPKI DER public key. */
function extractRawPublicKey(der: Uint8Array): Uint8Array {
  // The uncompressed point (0x04 || X || Y) is always the last 65 bytes of
  // the SPKI structure for an EC key — the ASN.1 prefix length varies
  // slightly by algorithm OID encoding, but the point itself is fixed-size
  // and always last, so this is the standard way every AWS-KMS-as-an-
  // Ethereum-signer implementation extracts it (rather than writing a full
  // ASN.1 parser for a structure this simple).
  const point = der.slice(der.length - 65);
  if (point[0] !== 0x04) {
    throw new Error(
      "KMS public key is not an uncompressed EC point — is this really an ECC_SECG_P256K1 key?"
    );
  }
  return point;
}

function addressFromRawPublicKey(point: Uint8Array): Address {
  const hash = keccak256(point.slice(1)); // drop the 0x04 prefix; address = keccak256(X || Y)
  return `0x${hash.slice(-40)}` as Address;
}

async function deriveKmsAddress(keyId: string): Promise<Address> {
  const res = await getKmsClient().send(new GetPublicKeyCommand({ KeyId: keyId }));
  if (!res.PublicKey) throw new Error(`KMS key ${keyId} returned no public key`);
  return addressFromRawPublicKey(extractRawPublicKey(new Uint8Array(res.PublicKey)));
}

/**
 * Signs a 32-byte digest via KMS and returns a recovery-id-complete
 * (r, s, yParity) tuple, verifying the recovered address matches what KMS
 * actually holds before returning — this is the load-bearing safety check:
 * if anything about the DER parsing or recovery logic is wrong, this throws
 * instead of silently producing an unusable or (worse) subtly wrong signature.
 */
async function kmsSignDigest(
  keyId: string,
  expectedAddress: Address,
  digest: Hex
): Promise<{ r: Hex; s: Hex; yParity: 0 | 1 }> {
  const res = await getKmsClient().send(
    new SignCommand({
      KeyId: keyId,
      Message: hexToBytes(digest),
      MessageType: "DIGEST",
      SigningAlgorithm: "ECDSA_SHA_256",
    })
  );
  if (!res.Signature) throw new Error(`KMS key ${keyId} returned no signature`);

  let sig = secp256k1.Signature.fromDER(new Uint8Array(res.Signature));
  if (sig.hasHighS()) sig = sig.normalizeS(); // Ethereum requires canonical low-S signatures

  const digestBytes = hexToBytes(digest);
  for (const recovery of [0, 1] as const) {
    const recovered = sig.addRecoveryBit(recovery).recoverPublicKey(digestBytes).toBytes(false);
    if (addressFromRawPublicKey(recovered).toLowerCase() === expectedAddress.toLowerCase()) {
      return {
        r: `0x${sig.r.toString(16).padStart(64, "0")}` as Hex,
        s: `0x${sig.s.toString(16).padStart(64, "0")}` as Hex,
        yParity: recovery,
      };
    }
  }
  throw new Error(
    `KMS signature for key ${keyId} did not recover to ${expectedAddress} under either recovery id — refusing to return a signature that doesn't match the expected signer`
  );
}

/** Builds a viem-compatible account backed by an AWS KMS asymmetric key. */
export async function toKmsAccount(keyId: string): Promise<LocalAccount> {
  const address = await deriveKmsAddress(keyId);

  const account = toAccount({
    address,
    async signMessage({ message }) {
      const { r, s, yParity } = await kmsSignDigest(keyId, address, hashMessage(message));
      return serializeSignature({ r, s, yParity });
    },
    async signTransaction(transaction, { serializer = serializeTransaction } = {}) {
      const hash = keccak256(await serializer(transaction));
      const { r, s, yParity } = await kmsSignDigest(keyId, address, hash);
      return (await serializer(transaction, { r, s, yParity } as never)) as Hex;
    },
    async signTypedData(typedData) {
      const { r, s, yParity } = await kmsSignDigest(keyId, address, hashTypedData(typedData));
      return serializeSignature({ r, s, yParity });
    },
  });

  return { ...account, publicKey: "0x" as Hex, source: "kms" } as LocalAccount;
}

/**
 * Resolves the account to use for a given role (relayer or signer): prefers
 * an AWS KMS key if `kmsKeyIdEnvVar` is set, otherwise falls back to a raw
 * private key from `privateKeyEnvVar` (today's behavior — fine for local
 * dev and testnet, not for mainnet with real funds).
 */
export async function getRelayerOrSignerAccount(
  privateKeyEnvVar: string,
  kmsKeyIdEnvVar: string
): Promise<LocalAccount> {
  const kmsKeyId = process.env[kmsKeyIdEnvVar];
  if (kmsKeyId) return toKmsAccount(kmsKeyId);

  const key = process.env[privateKeyEnvVar];
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(`Neither ${kmsKeyIdEnvVar} nor ${privateKeyEnvVar} is configured`);
  }
  return privateKeyToAccount(key as Hex);
}
