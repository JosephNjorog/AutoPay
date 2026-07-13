// Shared by any flow that pays/tops-up on-chain from a connected external
// wallet (Fund's "pay with connected wallet", Send's "top up the shortfall").

export const ERC20_TRANSFER_ABI = [
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
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export function friendlyPayError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/exceeds balance|insufficient funds/i.test(msg)) {
    return "Your connected wallet doesn't have enough funds for this amount.";
  }
  if (/user rejected|denied transaction/i.test(msg)) {
    return "Cancelled in wallet.";
  }
  if (/chain mismatch|does not match the target chain/i.test(msg)) {
    return "Switch your wallet to Avalanche and try again.";
  }
  return "Payment failed. Try again.";
}
