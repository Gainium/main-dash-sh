import { useCallback } from 'react';
import { useTradingPairsFromContext } from '@/contexts/ExchangeDataContext';
import type { AssetClass, TradingPair } from '@/hooks/useTradingPairs';

export interface ResolvedPairAsset {
  /**
   * The pair's normalized asset class, if found among the loaded trading pairs.
   * Undefined → the caller (CoinIcon) falls back to crypto behavior.
   */
  assetClass?: AssetClass;
  /**
   * The pair's authoritative `exchange` (ExchangeEnum value), used by CoinIcon
   * to venue-gate tokenized-stock ticker normalization.
   */
  exchange?: string;
}

/**
 * Resolve a pair's asset class + venue from the globally-loaded trading pairs
 * (ExchangeDataContext wraps the whole authed app). Read-only surfaces — bot
 * cards, list rows, detail headers — don't carry a per-pair asset class, so
 * without this they render tokenized stocks as a first-letter tile instead of
 * the real logo. Returns `{}` until the pairs load or when the pair isn't found
 * (→ crypto default). Cheap: a single scan of the bot's exchange pair list,
 * with a cross-exchange fallback for venue-name mismatches.
 *
 * The result keys (`assetClass`, `exchange`) match the CoinPair/CoinIcon prop
 * names, so callers can spread it straight onto the component.
 */
export function useResolvePairAsset(): (
  exchange: string | undefined | null,
  baseAsset: string | undefined | null,
  quoteAsset?: string | undefined | null,
) => ResolvedPairAsset {
  const { pairsByExchange } = useTradingPairsFromContext();
  return useCallback(
    (exchange, baseAsset, quoteAsset) => {
      if (!baseAsset || !pairsByExchange) return {};
      const base = String(baseAsset).toUpperCase();
      const quote = quoteAsset ? String(quoteAsset).toUpperCase() : undefined;

      const matches = (p: TradingPair): boolean =>
        p.baseAsset?.name?.toUpperCase() === base &&
        (!quote || p.quoteAsset?.name?.toUpperCase() === quote);

      const pick = (list?: TradingPair[]): ResolvedPairAsset | undefined => {
        const hit = list?.find(matches);
        return hit
          ? { assetClass: hit.assetCategory, exchange: hit.exchange }
          : undefined;
      };

      // Prefer the bot's own exchange list (case-insensitive key match).
      if (exchange) {
        const wanted = String(exchange).toUpperCase();
        const key = Object.keys(pairsByExchange).find(
          (k) => k.toUpperCase() === wanted
        );
        const hit = key ? pick(pairsByExchange[key]) : undefined;
        if (hit) return hit;
      }
      // Fallback: scan every exchange (handles venue-name mismatches).
      for (const list of Object.values(pairsByExchange)) {
        const hit = pick(list);
        if (hit) return hit;
      }
      return {};
    },
    [pairsByExchange]
  );
}
