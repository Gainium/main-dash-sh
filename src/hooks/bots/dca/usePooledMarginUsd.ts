import { useGraphQL } from '@/hooks/useGraphQL';
import { ExchangeEnum } from '@/types';
import { botQueries } from '@/lib/api/GraphQLQueries-bot-queries';

/**
 * Quote assets the USD pool can stand in for: USD itself (COIN-M and Kraken
 * flex) and USDC, which the venue counts at par — OKX Europe X-Perps are
 * USDC-quoted and a Multi-currency margin account funds them from EUR.
 *
 * USDT only on Binance USDⓈ-M, which reports a pool in Multi-Assets mode only:
 * every collateral coin margins every USDⓈ-M contract there, so an EEA
 * Credits-mode account trades USDT-quoted perpetuals from USDC. Other venues'
 * USDT-M behaviour in pooled mode is unverified. Mirrors main-app core.
 */
export const poolCoversQuote = (
  quoteAsset: string | null | undefined,
  provider?: string | null
) =>
  quoteAsset === 'USD' ||
  quoteAsset === 'USDC' ||
  (quoteAsset === 'USDT' && provider === ExchangeEnum.binanceUsdm);

/**
 * USD a futures connection can still commit when its collateral is pooled
 * across coins — a Bitget Unified account in `multi_assets` mode margins an
 * inverse (COIN-M) contract from USDT (exchange-connector spec 028), an OKX
 * account in Multi-currency margin funds a USDC-quoted contract from EUR. `null`
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
