import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { midRates } from "@/lib/tuma-data";

// Live mid-market USD→local rate from the backend, for whichever currency
// the caller asks for — not hardcoded to KES, since Autopayke operates in
// several countries. Falls back to the static rate in tuma-data.ts if the
// FX endpoint hasn't loaded yet or fails.
export function useLocalRate(currency: string): number {
  const { accessToken } = useAuthStore();

  const { data } = useQuery({
    queryKey: ["fx-rates"],
    queryFn: () => api.fx.rates(accessToken!),
    enabled: !!accessToken,
    staleTime: 60_000,
  });

  const fallback =
    Object.values(midRates).find((m) => m.ccy === currency)?.rate ?? 1;
  return data?.find((r) => r.currency === currency)?.mid ?? fallback;
}
