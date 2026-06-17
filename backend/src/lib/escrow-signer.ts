import { stringToBytes32 } from "../services/avalanche";
import type { Address } from "viem";
import { keccak256, encodePacked, toBytes } from "viem";
import type { LocalAccount } from "viem/accounts";
import { BlockchainError } from "./errors";
import { getRelayerOrSignerAccount } from "./kms-signer";

// Prefers AWS KMS (see ./kms-signer.ts) whenever SIGNER_KMS_KEY_ID is
// configured; falls back to a raw SIGNER_PRIVATE_KEY otherwise. Anyone
// holding this key can authorize an escrow claim to any recipient, so it
// deserves the same KMS treatment as the relayer key, not just the relayer.
let _signerAccountPromise: Promise<LocalAccount> | null = null;

function requireSigner(): Promise<LocalAccount> {
  if (!_signerAccountPromise) {
    _signerAccountPromise = getRelayerOrSignerAccount("SIGNER_PRIVATE_KEY", "SIGNER_KMS_KEY_ID").catch((err) => {
      _signerAccountPromise = null;
      throw new BlockchainError(`Signer account unavailable — escrow signing is disabled: ${(err as Error).message}`);
    });
  }
  return _signerAccountPromise;
}

export async function signEscrowClaim(
  escrowRef: string,
  recipientAddress: Address,
  chainId: number
): Promise<`0x${string}`> {
  const claimRefBytes32 = stringToBytes32(escrowRef);

  const digest = keccak256(
    encodePacked(
      ["bytes32", "address", "uint256"],
      [claimRefBytes32, recipientAddress, BigInt(chainId)]
    )
  );

  const signer = await requireSigner();
  return signer.signMessage({ message: { raw: toBytes(digest) } });
}
