export type AssetMeta = {
  color: string;
  letter: string;
};

const ASSET_META: Record<string, AssetMeta> = {
  USDC: { color: "#2775CA", letter: "U" },
  USDT: { color: "#26A17B", letter: "U" },
  AVAX: { color: "#E84142", letter: "A" },
};

const FALLBACK_META: AssetMeta = { color: "#888888", letter: "?" };

export function getAssetMeta(symbol: string): AssetMeta {
  return ASSET_META[symbol] ?? { ...FALLBACK_META, letter: symbol[0] ?? "?" };
}
