import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { opsApi, type AssetBalance } from "@/lib/api";
import { fmtUsd, timeAgo } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PageHeader, LoadingSpinner, ErrorDisplay } from "@/components/Layout";
import { Wallet, Fuel, Users } from "lucide-react";

export const Route = createFileRoute("/balances")({ component: BalancesPage });

function truncate(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function AssetRow({ asset }: { asset: AssetBalance }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm font-mono font-medium">{asset.symbol}</span>
      <div className="text-right">
        <p className="text-sm font-semibold tabular-nums">{parseFloat(asset.balance).toLocaleString(undefined, { maximumFractionDigits: 4 })}</p>
        <p className="text-xs text-muted-foreground tabular-nums">{fmtUsd(asset.balanceUsd)}</p>
      </div>
    </div>
  );
}

function AddressCard({
  icon: Icon,
  title,
  subtitle,
  address,
  assets,
}: {
  icon: typeof Wallet;
  title: string;
  subtitle: string;
  address: string | undefined;
  assets: AssetBalance[] | undefined;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
        {address && <p className="text-xs font-mono text-muted-foreground mt-1">{truncate(address)}</p>}
      </CardHeader>
      <CardContent>
        {!address ? (
          <p className="text-sm text-muted-foreground py-4">Not configured in this environment.</p>
        ) : !assets || assets.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No balance.</p>
        ) : (
          <div className="divide-y divide-border">
            {assets.map((a) => <AssetRow key={a.symbol} asset={a} />)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function BalancesPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["ops-balances"],
    queryFn: opsApi.balances,
  });

  return (
    <div>
      <PageHeader
        title="Balances"
        description="Treasury, relayer float, and aggregate user-held funds"
      />

      <div className="p-6">
        {isLoading ? (
          <LoadingSpinner />
        ) : error ? (
          <ErrorDisplay error={error as Error} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <AddressCard
              icon={Wallet}
              title="Treasury"
              subtitle="Merchant fees + cash-out withdrawals"
              address={data?.treasury?.address}
              assets={data?.treasury?.assets}
            />
            <AddressCard
              icon={Fuel}
              title="Relayer float"
              subtitle="Backs instant credit after funding"
              address={data?.relayerFloat?.address}
              assets={data?.relayerFloat?.assets}
            />
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">User wallets (total)</CardTitle>
                </div>
                <p className="text-xs text-muted-foreground">
                  Across {data?.userWalletsTotal.walletCount ?? 0} wallets · cached, as of{" "}
                  {data ? timeAgo(data.userWalletsTotal.asOf) : "—"}
                </p>
              </CardHeader>
              <CardContent>
                {!data || Object.keys(data.userWalletsTotal.totalsBySymbol).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">No balances found.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {Object.entries(data.userWalletsTotal.totalsBySymbol).map(([symbol, usd]) => (
                      <div key={symbol} className="flex items-center justify-between py-1.5">
                        <span className="text-sm font-mono font-medium">{symbol}</span>
                        <p className="text-sm font-semibold tabular-nums">{fmtUsd(usd)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
