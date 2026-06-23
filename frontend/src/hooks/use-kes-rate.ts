import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { midRates } from "@/lib/tuma-data";

// Live mid-market USD→KES rate from the backend, falling back to the static
// rate in tuma-data.ts if the FX endpoint hasn't loaded yet or fails.
export function useKesRate(): number {
  const { accessToken } = useAuthStore();

  const { data } = useQuery({
    queryKey: ["fx-rates"],
    queryFn: () => api.fx.rates(accessToken!),
    enabled: !!accessToken,
    staleTime: 60_000,
  });

  return data?.find((r) => r.currency === "KES")?.mid ?? midRates.KE.rate;
}
