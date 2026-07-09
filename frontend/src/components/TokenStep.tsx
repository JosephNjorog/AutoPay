import { ArrowRight } from "lucide-react";
import type { PayableAsset } from "@tuma/shared";
import type { WalletAsset } from "@/lib/api/client";
import { getAssetMeta } from "@/lib/asset-meta";

/**
 * Row-list token picker shared by Send and Merchant Pay — matches the visual
 * pattern of send.tsx's CountryStep / pay-merchant.tsx's MethodStep. Callers
 * are responsible for filtering `assets` down to what should be offered
 * (e.g. balance > 0, and — for Send — excluding AVAX unless the recipient is
 * a verified existing Autopayke user, since escrow can't hold native AVAX).
 */
export function TokenStep({
  assets,
  onPick,
}: {
  assets: WalletAsset[];
  onPick: (symbol: PayableAsset) => void;
}) {
  return (
    <div className="flex-1 flex flex-col px-5 pt-5 pb-6 gap-3">
      {assets.map((asset) => {
        const meta = getAssetMeta(asset.symbol);
        const decimals = asset.symbol === "AVAX" ? 4 : 2;
        return (
          <button
            key={asset.symbol}
            onClick={() => onPick(asset.symbol as PayableAsset)}
            className="w-full flex items-center gap-3 rounded-2xl border border-border bg-card hover:bg-muted/50 p-4 text-left transition"
          >
            <div
              className="h-11 w-11 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
              style={{ backgroundColor: meta.color }}
            >
              {meta.letter}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{asset.symbol}</p>
              <p className="text-[11px] text-muted-foreground">
                {parseFloat(asset.balance).toFixed(decimals)} available
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </button>
        );
      })}
      {assets.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No balance available — add money to your wallet first.
        </p>
      )}
    </div>
  );
}
