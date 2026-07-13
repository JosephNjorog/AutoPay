import { useState } from "react";
import { Loader2, Zap } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useAccount,
  useWriteContract,
  useSendTransaction,
  usePublicClient,
} from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { parseUnits, parseEther } from "viem";
import { api } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { ERC20_TRANSFER_ABI, friendlyPayError } from "@/lib/wallet-pay";
import type { PayableAsset } from "@tuma/shared";

type PayStep = "idle" | "sending" | "confirming" | "recording" | "error";

// Inline top-up for the Send flow: when the AutoPayKe balance can't cover
// the amount being sent, this lets the user cover the shortfall straight
// from an already-connected external wallet, reusing the exact same
// on-chain-transfer-then-verify mechanism as Fund's "pay with connected
// wallet" (see routes/fund.tsx's PayCrypto + POST /api/fund/crypto/confirm).
export function TopUpFromWallet({ token, tokenShortfall }: { token: PayableAsset; tokenShortfall: number }) {
  const { accessToken } = useAuthStore();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<PayStep>("idle");
  const [error, setError] = useState<string | null>(null);

  const { open } = useAppKit();
  const { address: connectedAddress, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();
  const publicClient = usePublicClient();

  const { data: cryptoInfo } = useQuery({
    queryKey: ["fund-crypto", token],
    queryFn: () => api.fund.crypto(token),
  });

  const { data: extBalances } = useQuery({
    queryKey: ["ext-wallet-balances", connectedAddress],
    queryFn: () => api.wallet.balances(connectedAddress!, accessToken!),
    enabled: isConnected && !!connectedAddress && !!accessToken,
  });
  const connectedTokenBalance = extBalances?.assets.find((a) => a.symbol === token);
  const connectedBalanceAmount = connectedTokenBalance ? parseFloat(connectedTokenBalance.balance) : null;
  const insufficientConnectedBalance =
    connectedBalanceAmount !== null && connectedBalanceAmount < tokenShortfall;

  const paying = step === "sending" || step === "confirming" || step === "recording";
  const payLabel: Record<PayStep, string> = {
    idle: `Top up ${tokenShortfall.toFixed(token === "AVAX" ? 4 : 2)} ${token} from connected wallet`,
    sending: "Approve in your wallet…",
    confirming: "Confirming on-chain…",
    recording: "Recording top-up…",
    error: "Try again",
  };

  async function handleTopUp() {
    const targetAddress = cryptoInfo?.walletAddress;
    if (!targetAddress || !cryptoInfo) return;

    setError(null);
    setStep("sending");
    try {
      let hash: `0x${string}`;
      if (token === "AVAX") {
        hash = await sendTransactionAsync({
          to: targetAddress as `0x${string}`,
          value: parseEther(tokenShortfall.toFixed(18)),
          chainId: cryptoInfo.chainId,
        });
      } else {
        const tokenAddress = token === "USDC" ? cryptoInfo.usdcAddress : cryptoInfo.usdtAddress;
        if (!tokenAddress) throw new Error(`${token} isn't supported on this network`);
        hash = await writeContractAsync({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_TRANSFER_ABI,
          functionName: "transfer",
          args: [targetAddress as `0x${string}`, parseUnits(tokenShortfall.toFixed(6), 6)],
          chainId: cryptoInfo.chainId,
        });
      }

      setStep("confirming");
      await publicClient?.waitForTransactionReceipt({ hash });

      setStep("recording");
      await api.fund.confirmCrypto(hash, token);

      await queryClient.invalidateQueries({ queryKey: ["wallet"] });
      setStep("idle");
    } catch (e) {
      setError(friendlyPayError(e));
      setStep("error");
    }
  }

  return (
    <div className="mt-3 rounded-2xl border border-primary/30 bg-primary-soft/40 p-3.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <Zap className="h-3 w-3 text-primary" /> Insufficient AutoPayKe balance
      </p>

      {!isConnected ? (
        <button
          onClick={() => open()}
          className="mt-2.5 w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold text-primary-foreground shadow-(--shadow-elegant)"
          style={{ background: "var(--gradient-portfolio)" }}
        >
          Connect wallet to cover the difference
        </button>
      ) : (
        <>
          {connectedBalanceAmount !== null && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Connected wallet balance: {connectedBalanceAmount.toFixed(token === "AVAX" ? 4 : 2)} {token}
            </p>
          )}
          <button
            onClick={handleTopUp}
            disabled={paying || insufficientConnectedBalance}
            className="mt-2.5 w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50 shadow-(--shadow-elegant)"
            style={{ background: "var(--gradient-portfolio)" }}
          >
            {paying && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {payLabel[step]}
          </button>
          {insufficientConnectedBalance && !error && (
            <p className="mt-2 text-[11px] text-destructive text-center">
              Connected wallet only has {connectedBalanceAmount?.toFixed(token === "AVAX" ? 4 : 2)} {token} —
              not enough to cover the difference.
            </p>
          )}
          {error && <p className="mt-2 text-[11px] text-destructive text-center">{error}</p>}
        </>
      )}
    </div>
  );
}
