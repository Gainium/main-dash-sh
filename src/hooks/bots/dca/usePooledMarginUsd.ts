import { useGraphQL } from '@/hooks/useGraphQL';
import { botQueries } from '@/lib/api/GraphQLQueries-bot-queries';

/**
 * USD a futures connection can still commit when its collateral is pooled
 * across coins — a Bitget Unified account in `multi_assets` mode margins an
 * inverse (COIN-M) contract from USDT (exchange-connector spec 028). `null`
 * when the connection does not pool, has not answered, or the request failed:
 * callers then keep the per-coin figure.
 */
export const usePooledMarginUsd = (
  exchangeUUID: string | null | undefined,
  enabled: boolean
): { pooledUsd: number | null; pending: boolean } => {
  const active = enabled && !!exchangeUUID;
  const query = useGraphQL<number | null>(
    'getPooledMarginAvailable',
    botQueries.getPooledMarginAvailable({ uuid: exchangeUUID ?? '' }),
    { enabled: active, staleTime: 15 * 1000 }
  );
  const pooledUsd =
    active &&
    query.data?.status === 'OK' &&
    typeof query.data.data === 'number'
      ? query.data.data
      : null;
  return {
    pooledUsd,
    pending: active && query.isPending && !query.error,
  };
};
