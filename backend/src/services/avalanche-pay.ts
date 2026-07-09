/**
 * Merchant Pay's on-chain operations — deliberately hard-pinned to Avalanche
 * Fuji TESTNET, independent of NODE_ENV/isTestnet in services/avalanche.ts.
 *
 * Why a separate client instead of reusing avalanche.ts's chain/rpcUrl:
 * Pay is explicitly sandbox-only (see the feature flag in routes/pay.ts).
 * Send/Fund/Withdraw must keep using the app's real NODE_ENV-driven chain
 * config in production. If Pay shared that same module-level chain/client,
 * a production deploy (NODE_ENV=production) would silently point Pay's
 * on-chain debit/refund at Avalanche MAINNET with real USDC. Pinning Pay to
 * Fuji here means that even if the feature flag were mistakenly enabled in
 * production before Daraja credentials/contract review are ready, the
 * on-chain leg still cannot touch mainnet — it would try to call a
 * mainnet-deployed wallet address on Fuji, where no such contract exists,
 * and fail closed instead of moving real funds.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  encodeFunctionData,
  type Address,
  type Hash,
} from "viem";
import { avalancheFuji } from "viem/chains";
import { BlockchainError } from "../lib/errors";
import { getRelayerOrSignerAccount } from "../lib/kms-signer";
import { ERC20_ABI, SMART_WALLET_ABI, type StablecoinToken } from "./avalanche";

const FUJI_RPC_URL = process.env.AVALANCHE_FUJI_RPC_URL!;
// Same Circle-issued Fuji USDC faucet contract avalanche.ts uses for testnet.
const FUJI_USDC_ADDRESS: Address = "0x5425890298aed601595a70AB815c96711a31Bc65";
// No canonical Fuji USDT test contract exists (same gap as avalanche.ts) —
// unset until ops points USDT_ADDRESS at one and it stays unusable here too.
const FUJI_USDT_ADDRESS: Address | undefined = process.env.USDT_ADDRESS
  ? (process.env.USDT_ADDRESS as Address)
  : undefined;

const FUJI_TOKEN_ADDRESSES: Record<StablecoinToken, Address | undefined> = {
  USDC: FUJI_USDC_ADDRESS,
  USDT: FUJI_USDT_ADDRESS,
};

function requirePayTokenAddress(token: StablecoinToken): Address {
  const address = FUJI_TOKEN_ADDRESSES[token];
  if (!address) throw new BlockchainError(`${token} is not configured on this network`);
  return address;
}

const payPublicClient = createPublicClient({
  chain: avalancheFuji,
  transport: http(FUJI_RPC_URL),
});

let _relayerAccountPromise: ReturnType<typeof getRelayerOrSignerAccount> | null = null;

function requireRelayerAccount() {
  if (!_relayerAccountPromise) {
    _relayerAccountPromise = getRelayerOrSignerAccount("RELAYER_PRIVATE_KEY", "RELAYER_KMS_KEY_ID").catch((err) => {
      _relayerAccountPromise = null;
      throw new BlockchainError(
        `Relayer account unavailable — Merchant Pay on-chain operations are disabled: ${(err as Error).message}`
      );
    });
  }
  return _relayerAccountPromise;
}

async function requireRelayer() {
  const account = await requireRelayerAccount();
  return createWalletClient({ account, chain: avalancheFuji, transport: http(FUJI_RPC_URL) });
}

export async function getPayTokenBalance(
  token: StablecoinToken,
  walletAddress: Address
): Promise<bigint> {
  return payPublicClient.readContract({
    address: requirePayTokenAddress(token),
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [walletAddress],
  }) as Promise<bigint>;
}

export async function getPayUsdcBalance(walletAddress: Address): Promise<bigint> {
  return getPayTokenBalance("USDC", walletAddress);
}

/** Native AVAX balance on Fuji, in wei. */
export async function getPayAvaxBalance(walletAddress: Address): Promise<bigint> {
  return payPublicClient.getBalance({ address: walletAddress });
}

/** Debits the user's stablecoin (Fuji testnet only) to Autopayke's treasury. */
export async function transferPayToken(
  token: StablecoinToken,
  fromWalletAddress: Address,
  toAddress: Address,
  amountUsd: number
): Promise<Hash> {
  const tokenAddress = requirePayTokenAddress(token);
  const amountRaw = parseUnits(amountUsd.toFixed(6), 6);

  const balance = await getPayTokenBalance(token, fromWalletAddress);
  if (balance < amountRaw) throw new BlockchainError(`Insufficient ${token} balance`);

  const transferCalldata = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [toAddress, amountRaw],
  });

  const hash = await (await requireRelayer()).writeContract({
    chain: avalancheFuji,
    account: await requireRelayerAccount(),
    address: fromWalletAddress,
    abi: SMART_WALLET_ABI,
    functionName: "execute",
    args: [tokenAddress, 0n, transferCalldata],
  });

  await payPublicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function transferPayUsdc(
  fromWalletAddress: Address,
  toAddress: Address,
  amountUsd: number
): Promise<Hash> {
  return transferPayToken("USDC", fromWalletAddress, toAddress, amountUsd);
}

/**
 * Debits native AVAX (Fuji testnet only) to Autopayke's treasury — a plain
 * value-forwarding call, not an ERC20 transfer. Merchant Pay never uses
 * escrow (it debits straight to the treasury), so unlike Send, AVAX needs no
 * extra gating here.
 */
export async function transferPayNativeAvax(
  fromWalletAddress: Address,
  toAddress: Address,
  amountAvax: number
): Promise<Hash> {
  const amountRaw = parseUnits(amountAvax.toFixed(18), 18);

  const balance = await getPayAvaxBalance(fromWalletAddress);
  if (balance < amountRaw) throw new BlockchainError("Insufficient AVAX balance");

  const hash = await (await requireRelayer()).writeContract({
    chain: avalancheFuji,
    account: await requireRelayerAccount(),
    address: fromWalletAddress,
    abi: SMART_WALLET_ABI,
    functionName: "execute",
    args: [toAddress, amountRaw, "0x"],
  });

  await payPublicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/** Refunds the user (Fuji testnet only) from Autopayke's relayer float. */
export async function creditPayFromFloat(toWalletAddress: Address, amountUsd: number): Promise<Hash> {
  const amountRaw = parseUnits(amountUsd.toFixed(6), 6);

  const hash = await (await requireRelayer()).writeContract({
    chain: avalancheFuji,
    account: await requireRelayerAccount(),
    address: FUJI_USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [toWalletAddress, amountRaw],
  });

  await payPublicClient.waitForTransactionReceipt({ hash });
  return hash;
}
