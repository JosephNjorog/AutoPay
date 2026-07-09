import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  getContract,
  encodeFunctionData,
  type Address,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalanche, avalancheFuji } from "viem/chains";
import { deriveWalletPrivateKey } from "../lib/crypto";
import { BlockchainError } from "../lib/errors";
import { getRelayerOrSignerAccount } from "../lib/kms-signer";

// ── Utility ───────────────────────────────────────────────────────────────────

/** Encodes a UTF-8 string as a right-zero-padded bytes32 hex value. */
export function stringToBytes32(s: string): `0x${string}` {
  return `0x${Buffer.from(s).toString("hex").padEnd(64, "0").slice(0, 64)}`;
}

// ── Chain setup ───────────────────────────────────────────────────────────────

export const isTestnet = process.env.NODE_ENV !== "production";
const chain = isTestnet ? avalancheFuji : avalanche;
const rpcUrl = isTestnet
  ? process.env.AVALANCHE_FUJI_RPC_URL!
  : process.env.AVALANCHE_RPC_URL!;

export const publicClient = createPublicClient({
  chain,
  transport: http(rpcUrl),
});

// Relayer account/client — lazily initialized so a missing key doesn't crash
// startup. Blockchain write operations will throw BlockchainError if neither
// RELAYER_KMS_KEY_ID nor RELAYER_PRIVATE_KEY is set. Prefers AWS KMS (see
// ../lib/kms-signer.ts) whenever RELAYER_KMS_KEY_ID is configured — that's
// the production path; a raw RELAYER_PRIVATE_KEY remains for local dev/testnet.
let _relayerAccountPromise: ReturnType<typeof getRelayerOrSignerAccount> | null = null;

export function requireRelayerAccount() {
  if (!_relayerAccountPromise) {
    _relayerAccountPromise = getRelayerOrSignerAccount("RELAYER_PRIVATE_KEY", "RELAYER_KMS_KEY_ID").catch((err) => {
      _relayerAccountPromise = null;
      throw new BlockchainError(
        `Relayer account unavailable — blockchain write operations are disabled: ${(err as Error).message}`
      );
    });
  }
  return _relayerAccountPromise;
}

async function requireRelayer() {
  const account = await requireRelayerAccount();
  return createWalletClient({ account, chain, transport: http(rpcUrl) });
}

// ── Token addresses ───────────────────────────────────────────────────────────
// Defaults are network-aware: mainnet defaults are the real Circle USDC /
// Tether USDT contracts on Avalanche C-Chain; testnet defaults are Circle's
// official USDC faucet contract on Fuji (no canonical Fuji USDT exists, so
// USDT requires an explicit USDT_ADDRESS override on testnet).
// All defaults verified on-chain (symbol()/decimals()) — the previous mainnet
// USDC default was missing its last hex digit and silently failing viem's
// address validation on every balance/transfer call.

const MAINNET_TOKEN_ADDRESSES: Record<string, Address> = {
  USDC: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
  USDT: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
};

const FUJI_USDC_ADDRESS: Address = "0x5425890298aed601595a70AB815c96711a31Bc65";

export const TOKEN_ADDRESSES: {
  USDC: Address;
  USDT: Address | undefined;
} = {
  USDC: (process.env.USDC_ADDRESS ??
    (isTestnet ? FUJI_USDC_ADDRESS : MAINNET_TOKEN_ADDRESSES.USDC)) as Address,
  // No canonical USDT test contract exists on Fuji — leave unset there unless
  // USDT_ADDRESS is explicitly provided. getWalletBalances() treats a missing
  // address as a zero balance rather than failing the whole wallet view.
  USDT: process.env.USDT_ADDRESS
    ? (process.env.USDT_ADDRESS as Address)
    : isTestnet
    ? undefined
    : MAINNET_TOKEN_ADDRESSES.USDT,
};

/**
 * Reverse of TOKEN_ADDRESSES — used by admin/ops views that only have a raw
 * escrow tokenAddress on hand and want to show a symbol instead of hex.
 * Escrow can only ever hold USDC/USDT (it's ERC20-only, see AutopayEscrow.sol),
 * so "unknown" here would itself be a signal something's wrong.
 */
export function symbolForTokenAddress(address: string): "USDC" | "USDT" | "unknown" {
  const lower = address.toLowerCase();
  if (TOKEN_ADDRESSES.USDC.toLowerCase() === lower) return "USDC";
  if (TOKEN_ADDRESSES.USDT?.toLowerCase() === lower) return "USDT";
  return "unknown";
}

// ── Contract ABIs (minimal) ───────────────────────────────────────────────────

export const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "Transfer",
    type: "event",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

const TUMA_FACTORY_ABI = [
  {
    name: "createWallet",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "owner", type: "address" },
      { name: "phoneHash", type: "bytes32" },
    ],
    outputs: [{ name: "wallet", type: "address" }],
  },
  {
    name: "getWalletAddress",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "phoneHash", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const TUMA_REGISTRY_ABI = [
  {
    name: "registerWallet",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "phoneHash", type: "bytes32" },
      { name: "wallet", type: "address" },
    ],
    outputs: [],
  },
  {
    name: "getWallet",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "phoneHash", type: "bytes32" }],
    outputs: [{ name: "wallet", type: "address" }],
  },
] as const;

const TUMA_ESCROW_ABI = [
  {
    name: "deposit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "claimRef", type: "bytes32" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "expiryOffset", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "claim",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "claimRef", type: "bytes32" },
      { name: "recipient", type: "address" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    name: "refund",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "claimRef", type: "bytes32" }],
    outputs: [],
  },
] as const;

export const SMART_WALLET_ABI = [
  {
    name: "execute",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [],
  },
  {
    name: "approveToken",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "setGuardianDailyLimit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

// Default cap on guardian-initiated (i.e. the relayer's, which today is
// every send — see the contract audit notes) USDC movement per wallet per
// day. Bounds worst-case exposure from a compromised relayer key to this
// amount per wallet per day instead of the wallet's entire balance at once.
// $2,000/day is generous for any realistic personal-remittance transfer in
// the markets this app serves; raise/lower per wallet via
// setGuardianDailyLimit if real usage patterns say otherwise (merchant
// wallets settling daily revenue may legitimately need a higher cap).
const DEFAULT_GUARDIAN_DAILY_USDC_LIMIT = (() => {
  const override = process.env.GUARDIAN_DAILY_USDC_LIMIT;
  const usd = override ? Number(override) : 2_000;
  return parseUnits(String(usd), 6);
})();

// ── Wallet derivation ─────────────────────────────────────────────────────────

export function getUserAccount(phoneHash: string) {
  const privKey = deriveWalletPrivateKey(phoneHash);
  return privateKeyToAccount(privKey);
}

/** Predicts the smart wallet address for a user before deployment. */
export async function getSmartWalletAddress(phoneHash: string): Promise<Address> {
  const factoryAddress = process.env.AUTOPAYKE_FACTORY_ADDRESS as Address;
  if (!factoryAddress || factoryAddress === "0x") {
    throw new BlockchainError("AUTOPAYKE_FACTORY_ADDRESS is not configured");
  }

  const userAccount = getUserAccount(phoneHash);

  const address = await publicClient.readContract({
    address: factoryAddress,
    abi: TUMA_FACTORY_ABI,
    functionName: "getWalletAddress",
    args: [userAccount.address, `0x${phoneHash}` as `0x${string}`],
  });

  return address as Address;
}

/** Deploys a new smart wallet for the user via the factory. Returns the wallet address. */
export async function deploySmartWallet(phoneHash: string): Promise<Address> {
  const factoryAddress = process.env.AUTOPAYKE_FACTORY_ADDRESS as Address;
  if (!factoryAddress || factoryAddress === "0x") {
    throw new BlockchainError("AUTOPAYKE_FACTORY_ADDRESS is not configured");
  }

  const userAccount = getUserAccount(phoneHash);

  const hash = await (await requireRelayer()).writeContract({
    chain,
    account: await requireRelayerAccount(),
    address: factoryAddress,
    abi: TUMA_FACTORY_ABI,
    functionName: "createWallet",
    args: [userAccount.address, `0x${phoneHash}` as `0x${string}`],
  });

  await publicClient.waitForTransactionReceipt({ hash });

  const walletAddress = await getSmartWalletAddress(phoneHash);
  await setDefaultGuardianDailyLimit(walletAddress);

  return walletAddress;
}

/**
 * Sets the default guardian daily spend cap on a freshly created wallet.
 * Best-effort — a failure here shouldn't block onboarding (the wallet still
 * works, just without this particular defense-in-depth layer until it's set
 * manually or retried), so this logs and swallows rather than throwing.
 */
async function setDefaultGuardianDailyLimit(walletAddress: Address): Promise<void> {
  try {
    const hash = await (await requireRelayer()).writeContract({
      chain,
      account: await requireRelayerAccount(),
      address: walletAddress,
      abi: SMART_WALLET_ABI,
      functionName: "setGuardianDailyLimit",
      args: [TOKEN_ADDRESSES.USDC, DEFAULT_GUARDIAN_DAILY_USDC_LIMIT],
    });
    await publicClient.waitForTransactionReceipt({ hash });
  } catch (err) {
    console.error(
      `[Avalanche] Failed to set default guardian daily limit on ${walletAddress}:`,
      err instanceof Error ? err.message : err
    );
  }
}

// ── Balance queries ───────────────────────────────────────────────────────────

export type TokenBalance = {
  symbol: string;
  address: string;
  balance: string;
  balanceUsd: number;
  decimals: number;
};

export async function getWalletBalances(
  walletAddress: Address,
  usdcPriceUsd = 1.0,
  usdtPriceUsd = 1.0
): Promise<TokenBalance[]> {
  // Each token balance is fetched independently — a missing/misconfigured
  // token address (e.g. no canonical USDT test contract on Fuji) shouldn't
  // take down the whole wallet view.
  async function safeBalanceOf(address: Address | undefined): Promise<bigint> {
    if (!address) return 0n;
    try {
      return (await publicClient.readContract({
        address,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [walletAddress],
      })) as bigint;
    } catch {
      return 0n;
    }
  }

  const [usdcBalance, usdtBalance, avaxBalance] = await Promise.all([
    safeBalanceOf(TOKEN_ADDRESSES.USDC),
    safeBalanceOf(TOKEN_ADDRESSES.USDT),
    publicClient.getBalance({ address: walletAddress }),
  ]);

  const usdc = Number(formatUnits(usdcBalance as bigint, 6));
  const usdt = Number(formatUnits(usdtBalance as bigint, 6));
  const avax = Number(formatUnits(avaxBalance, 18));

  const avaxPriceUsd = await getAvaxPriceUsd();

  return [
    {
      symbol: "USDC",
      address: TOKEN_ADDRESSES.USDC,
      balance: usdc.toFixed(6),
      balanceUsd: usdc * usdcPriceUsd,
      decimals: 6,
    },
    {
      symbol: "USDT",
      address: TOKEN_ADDRESSES.USDT ?? "not configured on this network",
      balance: usdt.toFixed(6),
      balanceUsd: usdt * usdtPriceUsd,
      decimals: 6,
    },
    {
      symbol: "AVAX",
      address: "native",
      balance: avax.toFixed(8),
      balanceUsd: avax * avaxPriceUsd,
      decimals: 18,
    },
  ];
}

// ── Testnet token discovery ──────────────────────────────────────────────────
// Fuji faucets and ad-hoc test tokens don't show up in TOKEN_ADDRESSES (which
// only knows about USDC/USDT). This scans on-chain Transfer events to find
// any other ERC20 the wallet has ever received, purely so it's visible on
// the wallet page for testnet QA — display only, never wired into send/pay.

const DISCOVERY_LOOKBACK_BLOCKS = BigInt(
  parseInt(process.env.TESTNET_TOKEN_DISCOVERY_LOOKBACK_BLOCKS ?? "", 10) || 20_000
);
const DISCOVERY_BATCH_BLOCKS = 2_000n;

export type DiscoveredTokenBalance = TokenBalance & { name: string };

export async function discoverTestnetTokenBalances(
  walletAddress: Address
): Promise<DiscoveredTokenBalance[]> {
  if (!isTestnet) return [];

  const currentBlock = await publicClient.getBlockNumber();
  const fromBlockFloor =
    currentBlock > DISCOVERY_LOOKBACK_BLOCKS ? currentBlock - DISCOVERY_LOOKBACK_BLOCKS : 0n;

  const transferEvent = ERC20_ABI.find((i) => i.name === "Transfer")!;
  const knownAddresses = new Set(
    [TOKEN_ADDRESSES.USDC, TOKEN_ADDRESSES.USDT]
      .filter((a): a is Address => !!a)
      .map((a) => a.toLowerCase())
  );

  // Public RPCs cap the block range per getLogs call, so scan in batches —
  // in parallel since this is a bounded, recent-history window, not the
  // open-ended scan the settlement worker does.
  const batches: Promise<Address[]>[] = [];
  for (let from = fromBlockFloor; from <= currentBlock; from += DISCOVERY_BATCH_BLOCKS) {
    const to = from + DISCOVERY_BATCH_BLOCKS - 1n < currentBlock
      ? from + DISCOVERY_BATCH_BLOCKS - 1n
      : currentBlock;
    batches.push(
      publicClient
        .getLogs({
          event: transferEvent,
          args: { to: walletAddress },
          fromBlock: from,
          toBlock: to,
        })
        .then((logs) => logs.map((log) => log.address))
        .catch(() => [] as Address[])
    );
  }

  const candidateAddresses = new Set(
    (await Promise.all(batches))
      .flat()
      .map((a) => a.toLowerCase())
      .filter((a) => !knownAddresses.has(a))
  );

  const results = await Promise.all(
    Array.from(candidateAddresses).map(async (lowerAddress) => {
      const address = lowerAddress as Address;
      try {
        const [balance, symbol, decimals] = await Promise.all([
          publicClient.readContract({ address, abi: ERC20_ABI, functionName: "balanceOf", args: [walletAddress] }) as Promise<bigint>,
          publicClient.readContract({ address, abi: ERC20_ABI, functionName: "symbol" }) as Promise<string>,
          publicClient.readContract({ address, abi: ERC20_ABI, functionName: "decimals" }) as Promise<number>,
        ]);
        if (balance <= 0n) return null;
        const result: DiscoveredTokenBalance = {
          symbol,
          name: symbol,
          address: address as string,
          balance: formatUnits(balance, decimals),
          balanceUsd: 0, // no price feed for arbitrary discovered tokens
          decimals,
        };
        return result;
      } catch {
        // Not a compliant ERC20 (no symbol()/decimals()), or the call
        // reverted — skip rather than fail the whole discovery pass.
        return null;
      }
    })
  );

  return results.filter((r): r is DiscoveredTokenBalance => r !== null);
}

export type StablecoinToken = "USDC" | "USDT";

/** Resolves an ERC20 token address, throwing rather than silently querying `undefined`. */
function requireTokenAddress(token: StablecoinToken): Address {
  const address = TOKEN_ADDRESSES[token];
  if (!address) {
    throw new BlockchainError(`${token} is not configured on this network`);
  }
  return address;
}

export async function getTokenBalance(
  token: StablecoinToken,
  walletAddress: Address
): Promise<bigint> {
  return publicClient.readContract({
    address: requireTokenAddress(token),
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [walletAddress],
  }) as Promise<bigint>;
}

export async function getUsdcBalance(walletAddress: Address): Promise<bigint> {
  return getTokenBalance("USDC", walletAddress);
}

/** Native AVAX balance, in wei. */
export async function getAvaxBalance(walletAddress: Address): Promise<bigint> {
  return publicClient.getBalance({ address: walletAddress });
}

export type IncomingTransfer = {
  txHash: string;
  from: Address;
  amount: bigint;
  token: "USDC" | "USDT";
  blockNumber: bigint;
};

/**
 * Scans for incoming USDC/USDT transfers to a wallet between two blocks —
 * picks up deposits sent directly to the wallet address from outside the
 * app (e.g. an external wallet), which otherwise leave no record anywhere.
 */
export async function getIncomingTransfers(
  walletAddress: Address,
  fromBlock: bigint,
  toBlock: bigint
): Promise<IncomingTransfer[]> {
  const tokens: { address: Address; symbol: "USDC" | "USDT" }[] = [
    { address: TOKEN_ADDRESSES.USDC, symbol: "USDC" },
    ...(TOKEN_ADDRESSES.USDT ? [{ address: TOKEN_ADDRESSES.USDT, symbol: "USDT" as const }] : []),
  ];

  const results = await Promise.all(
    tokens.map(({ address, symbol }) =>
      publicClient
        .getLogs({
          address,
          event: {
            name: "Transfer",
            type: "event",
            inputs: ERC20_ABI.find((i) => i.name === "Transfer")!.inputs,
          },
          args: { to: walletAddress },
          fromBlock,
          toBlock,
        })
        .then((logs) =>
          logs.map((log) => ({
            txHash: log.transactionHash,
            from: (log.args as { from: Address }).from,
            amount: (log.args as { value: bigint }).value,
            token: symbol,
            blockNumber: log.blockNumber,
          }))
        )
        .catch((err) => {
          console.error(`[Avalanche] getIncomingTransfers(${symbol}) failed:`, (err as Error).message);
          return [] as IncomingTransfer[];
        })
    )
  );

  return results.flat();
}

/**
 * Verifies a transaction hash is a confirmed USDC/USDT transfer to the
 * expected wallet address, returning the real on-chain amount — used by the
 * "pay with connected wallet" funding flow so the credited amount always
 * comes from the chain itself, never from client-supplied input.
 */
export async function verifyIncomingTransfer(
  txHash: Hash,
  expectedTo: Address
): Promise<{ from: Address; amount: bigint; token: "USDC" | "USDT" } | null> {
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") return null;

  const tokens: { address: Address; symbol: "USDC" | "USDT" }[] = [
    { address: TOKEN_ADDRESSES.USDC, symbol: "USDC" },
    ...(TOKEN_ADDRESSES.USDT ? [{ address: TOKEN_ADDRESSES.USDT, symbol: "USDT" as const }] : []),
  ];

  for (const log of receipt.logs) {
    const token = tokens.find((t) => t.address.toLowerCase() === log.address.toLowerCase());
    if (!token) continue;

    // Transfer(address indexed from, address indexed to, uint256 value)
    // topics[1] = from, topics[2] = to (both left-padded to 32 bytes)
    if (log.topics.length < 3) continue;
    const to = `0x${log.topics[2]!.slice(-40)}` as Address;
    if (to.toLowerCase() !== expectedTo.toLowerCase()) continue;

    const from = `0x${log.topics[1]!.slice(-40)}` as Address;
    const amount = BigInt(log.data);
    return { from, amount, token: token.symbol };
  }

  return null;
}

// ── Token transfers ───────────────────────────────────────────────────────────

/**
 * Transfers USDC/USDT from a user's smart wallet to a recipient.
 * The relayer calls execute() on the smart wallet on behalf of the user.
 */
export async function transferToken(
  token: StablecoinToken,
  fromPhoneHash: string,
  fromWalletAddress: Address,
  toAddress: Address,
  amountUsd: number
): Promise<Hash> {
  const tokenAddress = requireTokenAddress(token);
  const amountRaw = parseUnits(amountUsd.toFixed(6), 6);

  const balance = await getTokenBalance(token, fromWalletAddress);
  if (balance < amountRaw) {
    throw new BlockchainError(`Insufficient ${token} balance`);
  }

  const transferCalldata = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [toAddress, amountRaw],
  });

  const hash = await (await requireRelayer()).writeContract({
    chain,
    account: await requireRelayerAccount(),
    address: fromWalletAddress,
    abi: SMART_WALLET_ABI,
    functionName: "execute",
    args: [tokenAddress, 0n, transferCalldata],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function transferUsdc(
  fromPhoneHash: string,
  fromWalletAddress: Address,
  toAddress: Address,
  amountUsd: number
): Promise<Hash> {
  return transferToken("USDC", fromPhoneHash, fromWalletAddress, toAddress, amountUsd);
}

/**
 * Transfers native AVAX from a user's smart wallet to a recipient — a plain
 * value-forwarding call (empty calldata), not an ERC20 transfer. Only used
 * for the direct (Tuma-to-Tuma) send path and Merchant Pay's treasury debit;
 * AutopayEscrow is ERC20-only (no payable/receive), so AVAX never goes
 * through escrow — see the isTumaUser guard in routes/send.ts.
 */
export async function transferNativeAvax(
  fromWalletAddress: Address,
  toAddress: Address,
  amountAvax: number
): Promise<Hash> {
  const amountRaw = parseUnits(amountAvax.toFixed(18), 18);

  const balance = await getAvaxBalance(fromWalletAddress);
  if (balance < amountRaw) {
    throw new BlockchainError("Insufficient AVAX balance");
  }

  const hash = await (await requireRelayer()).writeContract({
    chain,
    account: await requireRelayerAccount(),
    address: fromWalletAddress,
    abi: SMART_WALLET_ABI,
    functionName: "execute",
    args: [toAddress, amountRaw, "0x"],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/** Approves the escrow contract to pull USDC/USDT from a user's wallet. */
export async function approveEscrowToken(
  token: StablecoinToken,
  fromWalletAddress: Address,
  amountUsd: number
): Promise<Hash> {
  const tokenAddress = requireTokenAddress(token);
  const escrowAddress = process.env.AUTOPAYKE_ESCROW_ADDRESS as Address;
  const amountRaw = parseUnits(amountUsd.toFixed(6), 6);

  const approveCalldata = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "approve",
    args: [escrowAddress, amountRaw],
  });

  const hash = await (await requireRelayer()).writeContract({
    chain,
    account: await requireRelayerAccount(),
    address: fromWalletAddress,
    abi: SMART_WALLET_ABI,
    functionName: "execute",
    args: [tokenAddress, 0n, approveCalldata],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function approveEscrow(
  fromWalletAddress: Address,
  amountUsd: number
): Promise<Hash> {
  return approveEscrowToken("USDC", fromWalletAddress, amountUsd);
}

// ── Registry ──────────────────────────────────────────────────────────────────

/**
 * Records a newly deployed smart wallet in TumaRegistry on-chain.
 * Silently skips if AUTOPAYKE_REGISTRY_ADDRESS is not yet configured (pre-deploy).
 */
export async function registerWalletOnChain(
  phoneHash: string,
  walletAddress: Address
): Promise<void> {
  const registryAddress = process.env.AUTOPAYKE_REGISTRY_ADDRESS as Address | undefined;
  if (!registryAddress || registryAddress === "0x") return;

  const hash = await (await requireRelayer()).writeContract({
    chain,
    account: await requireRelayerAccount(),
    address: registryAddress,
    abi: TUMA_REGISTRY_ABI,
    functionName: "registerWallet",
    args: [`0x${phoneHash}` as `0x${string}`, walletAddress],
  });

  await publicClient.waitForTransactionReceipt({ hash });
}

// ── Escrow on-chain calls ─────────────────────────────────────────────────────

/**
 * Locks USDC/USDT in TumaEscrow on behalf of the sender's smart wallet.
 * The smart wallet must have already approved the escrow contract (via approveEscrowToken).
 * The relayer calls smartWallet.execute(escrowAddress, 0, depositCalldata).
 */
export async function depositToEscrowToken(
  token: StablecoinToken,
  senderWalletAddress: Address,
  escrowRef: string,
  amountUsd: number
): Promise<Hash> {
  const tokenAddress = requireTokenAddress(token);
  const escrowAddress = process.env.AUTOPAYKE_ESCROW_ADDRESS as Address;
  if (!escrowAddress || escrowAddress === "0x") {
    throw new BlockchainError("AUTOPAYKE_ESCROW_ADDRESS is not configured");
  }

  const amountRaw = parseUnits(amountUsd.toFixed(6), 6);
  const claimRefBytes32 = stringToBytes32(escrowRef);
  const EXPIRY_OFFSET = BigInt(7 * 24 * 60 * 60); // 7 days

  const depositCalldata = encodeFunctionData({
    abi: TUMA_ESCROW_ABI,
    functionName: "deposit",
    args: [claimRefBytes32, tokenAddress, amountRaw, EXPIRY_OFFSET],
  });

  const hash = await (await requireRelayer()).writeContract({
    chain,
    account: await requireRelayerAccount(),
    address: senderWalletAddress,
    abi: SMART_WALLET_ABI,
    functionName: "execute",
    args: [escrowAddress, 0n, depositCalldata],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function depositToEscrow(
  senderWalletAddress: Address,
  escrowRef: string,
  amountUsd: number
): Promise<Hash> {
  return depositToEscrowToken("USDC", senderWalletAddress, escrowRef, amountUsd);
}

/**
 * Claims a pending escrow and transfers USDC to the recipient's wallet.
 * The signature must be produced by TUMA's SIGNER_ROLE key over (claimRef, recipient, chainId).
 */
export async function claimEscrowOnChain(
  escrowRef: string,
  recipientAddress: Address,
  signature: `0x${string}`
): Promise<Hash> {
  const escrowAddress = process.env.AUTOPAYKE_ESCROW_ADDRESS as Address;
  if (!escrowAddress || escrowAddress === "0x") {
    throw new BlockchainError("AUTOPAYKE_ESCROW_ADDRESS is not configured");
  }

  const claimRefBytes32 = stringToBytes32(escrowRef);

  const hash = await (await requireRelayer()).writeContract({
    chain,
    account: await requireRelayerAccount(),
    address: escrowAddress,
    abi: TUMA_ESCROW_ABI,
    functionName: "claim",
    args: [claimRefBytes32, recipientAddress, signature],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/**
 * Refunds an expired pending escrow back to the original sender.
 * TumaEscrow enforces the expiry and pending-state checks on-chain.
 */
export async function refundEscrowOnChain(escrowRef: string): Promise<Hash> {
  const escrowAddress = process.env.AUTOPAYKE_ESCROW_ADDRESS as Address;
  if (!escrowAddress || escrowAddress === "0x") {
    throw new BlockchainError("AUTOPAYKE_ESCROW_ADDRESS is not configured");
  }

  const hash = await (await requireRelayer()).writeContract({
    chain,
    account: await requireRelayerAccount(),
    address: escrowAddress,
    abi: TUMA_ESCROW_ABI,
    functionName: "refund",
    args: [stringToBytes32(escrowRef)],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/**
 * Credits USDC from TUMA's relayer float directly to a user's smart wallet.
 * Used after a successful card or M-Pesa STK Push funding payment.
 * The relayer EOA must hold sufficient USDC float.
 */
export async function creditFromFloat(
  toWalletAddress: Address,
  amountUsd: number
): Promise<Hash> {
  const amountRaw = parseUnits(amountUsd.toFixed(6), 6);

  const hash = await (await requireRelayer()).writeContract({
    chain,
    account: await requireRelayerAccount(),
    address: TOKEN_ADDRESSES.USDC,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [toWalletAddress, amountRaw],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/**
 * Registers a smart wallet with the Paymaster for gas sponsorship.
 * Called after wallet deploy so the user never pays gas.
 * Silently skips if AUTOPAYKE_PAYMASTER_ADDRESS is not yet configured.
 */
export async function sponsorWallet(walletAddress: Address): Promise<void> {
  const paymasterAddress = process.env.AUTOPAYKE_PAYMASTER_ADDRESS as Address | undefined;
  if (!paymasterAddress || paymasterAddress === "0x") return;

  const PAYMASTER_APPROVE_ABI = [
    {
      name: "approveWallet",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [{ name: "wallet", type: "address" }],
      outputs: [],
    },
  ] as const;

  const hash = await (await requireRelayer()).writeContract({
    chain,
    account: await requireRelayerAccount(),
    address: paymasterAddress,
    abi: PAYMASTER_APPROVE_ABI,
    functionName: "approveWallet",
    args: [walletAddress],
  });

  await publicClient.waitForTransactionReceipt({ hash });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Short in-process cache so quote creation (fx.ts, services/pay.ts) and wallet
// balance display don't each hit CoinGecko on every call — same TTL as fx.ts's
// OXR fiat-rate cache (RATE_CACHE_TTL) for consistency.
const AVAX_PRICE_CACHE_TTL_MS = 60_000;
let cachedAvaxPrice: { price: number; fetchedAt: number } | null = null;

export async function getAvaxPriceUsd(): Promise<number> {
  if (cachedAvaxPrice && Date.now() - cachedAvaxPrice.fetchedAt < AVAX_PRICE_CACHE_TTL_MS) {
    return cachedAvaxPrice.price;
  }
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=avalanche-2&vs_currencies=usd"
    );
    const data = (await res.json()) as { "avalanche-2": { usd: number } };
    const price = data["avalanche-2"].usd;
    cachedAvaxPrice = { price, fetchedAt: Date.now() };
    return price;
  } catch {
    return cachedAvaxPrice?.price ?? 35; // fall back to last known price, else a rough default
  }
}

export function explorerUrl(txHashOrAddress: string): string {
  const base = isTestnet
    ? "https://testnet.snowtrace.io"
    : "https://snowtrace.io";
  return txHashOrAddress.length === 66
    ? `${base}/tx/${txHashOrAddress}`
    : `${base}/address/${txHashOrAddress}`;
}
