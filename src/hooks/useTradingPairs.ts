import GraphQlQuery from '@/lib/api/GraphQLQueries';
import logger from '@/lib/loggerInstance';
import {
  convertToFlatPairsByExchange,
  useTradingPairsDataStore,
} from '@/stores/tradingPairsDataStore';
import { useUIStore } from '@/stores/uiStore';
import type { ExchangeEnum } from '@/types';
import type { OKXSource } from '@/types/exchange.types';
import { useCallback, useEffect, useMemo } from 'react';
import { useGraphQL } from './useGraphQL';

/**
 * Normalized asset class for a trading pair. The backend returns this on every
 * pair via `getAllPairs` (default `'crypto'`). Drives icon resolution and the
 * pair-picker asset-class filter. Frozen contract — keep these exact strings in
 * sync with the backend.
 */
export type AssetClass =
  | 'crypto'
  | 'stock'
  | 'etf'
  | 'commodity'
  | 'metal'
  | 'forex'
  | 'index';

export interface TradingPair {
  pair: string;
  exchange: ExchangeEnum;
  baseAsset: {
    name: string;
    // Human-readable asset name (e.g. "Apple Inc.", "Bitcoin"), resolved
    // backend-side by the `saveAssetNames` cron. Optional: absent until
    // resolved; the UI falls back to the ticker (`name`).
    displayName?: string;
    minAmount: number;
    maxAmount: number;
    step: number;
  };
  quoteAsset: {
    name: string;
    minAmount: number;
  };
  priceAssetPrecision: number;
  crossAvailable: boolean;
  // Exchange-native symbol identifiers used by WebSocket streamers
  // (Kraken spot uses `wsCode` like "BTC/USDT", Hyperliquid / Kraken
  // futures use `code` like "PI_XBTUSD"). Optional because most
  // exchanges derive their WS symbol from `pair` directly.
  code?: string;
  wsCode?: string;
  // Normalized asset class from the backend (default 'crypto'). Used for icon
  // resolution and the pair-picker asset-class filter.
  assetCategory?: AssetClass;
  // Whether the market is a canonical / officially-curated listing (HL spot
  // only: HL-canonical or Unit-bridged = true; permissionless HIP-1 = false).
  // Absent for every other exchange => treated as canonical. Drives the
  // pair-picker "Canonical only" toggle.
  isCanonical?: boolean;
  // OKX account-origin owning this pair. `my` = OKX Europe (eea.okx.com) USDC/EUR
  // spot universe; unset for the global feed + all other exchanges. The bot form
  // scopes an account's pairs by matching this to the account's okxSource.
  source?: OKXSource;
}

export interface GetAllPairsResponse {
  result: TradingPair[];
}

export interface TradingPairsByExchange {
  [exchangeName: string]: TradingPair[];
}

// Maximum time (ms) the store can stay in isLoading before we force-reset it.
// Acts as a safety-net against the loading-state deadlock.
const LOADING_TIMEOUT_MS = 30_000;

export function useTradingPairs() {
  const {
    pairsByProvider,
    setPairs,
    setLoading,
    isLoading,
    setError,
    error,
    initialLoaded,
    markStale,
    _hasHydrated,
  } = useTradingPairsDataStore();
  const tradingMode = useUIStore((s) => s.tradingMode);
  const { query } = GraphQlQuery.getAllPairs();

  // When the trading context changes (live/paper/demo), mark pairs as stale so
  // that we re-fetch with the correct `paper-context` header.  This mirrors
  // what useExchanges does with its own `markStale()` call.
  useEffect(() => {
    logger.info(
      `[useTradingPairs] Trading mode changed to ${tradingMode}, marking pairs stale`
    );
    markStale();
  }, [tradingMode, markStale]);

  // Only fetch if we haven't loaded yet (timer will clear expired data automatically).
  // Wait for IDB rehydration to finish first — otherwise we'd fire a network
  // request even when cached pairs are about to arrive from IndexedDB, and the
  // brief pre-hydration empty state would leak into UI consumers.
  // MUST NOT depend on the store's own `isLoading`: this gates the query's
  // `enabled`, and the query's `isLoading` is mirrored back into the store
  // below. Feeding that flag back in here closes the circle into a
  // self-sustaining enable/disable cycle — a `getAllPairs` re-fetch storm
  // whenever the request fails, and a render loop (React #185 in
  // ExchangeDataProvider) when it settles fast enough. Readiness only.
  const shouldFetch = useMemo(() => {
    return _hasHydrated && !initialLoaded;
  }, [_hasHydrated, initialLoaded]);

  // Use GraphQL hook with conditional fetching
  const apiResult = useGraphQL<GetAllPairsResponse>(
    'getAllPairs',
    {
      query,
    },
    {
      enabled: shouldFetch,
    }
  );

  // Update store when API data arrives.
  // Also include `initialLoaded` in deps so that when the store is emptied or
  // marked stale (initialLoaded: false) — e.g. by the hourly `clearExpiredPairs`
  // cleanup or a trading-context switch — while TanStack Query still holds the
  // same cached `getAllPairs` data reference, we immediately repopulate the
  // store from that cached data instead of leaving it stuck empty until a hard
  // refresh. This mirrors the identical guard in useExchanges; without it the
  // pairs store and the query cache desync and the bot form shows "No trading
  // pairs available" / a 0 balance until reload.
  useEffect(() => {
    if (
      apiResult.data?.data?.result &&
      !apiResult.isLoading &&
      !apiResult.error
    ) {
      logger.info(
        `[useTradingPairs] API returned ${apiResult.data.data.result.length} trading pairs, updating store`
      );
      setPairs(apiResult.data.data.result);
      // Explicitly clear loading — avoids relying on a separate effect that
      // could be skipped when shouldFetch flips before the next render.
      setLoading(false);
    }
  }, [
    apiResult.data,
    apiResult.isLoading,
    apiResult.error,
    setPairs,
    setLoading,
    initialLoaded,
  ]);

  // Mirror the query's loading state into the store — strictly one-way.
  // Unconditional (no early return, no branch that can be skipped) so the flag
  // can never get stuck in the "Loading pairs…" state the old two-branch
  // version was written to rescue: whatever the query reports IS the store's
  // loading state. `shouldFetch` only participates as a value here, never as a
  // gate, so it cannot be starved of the write that clears it.
  useEffect(() => {
    setLoading(shouldFetch && apiResult.isLoading);
  }, [apiResult.isLoading, shouldFetch, setLoading]);

  // Update store error state — also make sure isLoading is cleared on error
  useEffect(() => {
    if (apiResult.error) {
      logger.error('[useTradingPairs] API error:', apiResult.error);
      setError(apiResult.error.message || 'Failed to fetch trading pairs');
      // Always clear loading on error so the UI can show an error/retry state
      // instead of spinning forever.
      if (isLoading) {
        setLoading(false);
      }
    } else if (error && !apiResult.isLoading) {
      // Clear previous error when a subsequent request succeeds
      setError(null);
    }
  }, [
    apiResult.error,
    apiResult.isLoading,
    setError,
    error,
    isLoading,
    setLoading,
  ]);

  // Safety-net: force-reset a stuck loading state after LOADING_TIMEOUT_MS.
  // This covers edge-cases where effects don't fire in the expected order
  // (e.g. HMR, suspended renders, React StrictMode double-mounts).
  useEffect(() => {
    if (!isLoading) return;

    const timer = setTimeout(() => {
      const state = useTradingPairsDataStore.getState();
      if (state.isLoading) {
        logger.warn(
          `[useTradingPairs] Loading state stuck for >${LOADING_TIMEOUT_MS / 1000}s – force-resetting`
        );
        state.setLoading(false);
        if (!state.error) {
          state.setError('Trading pairs request timed out. Please try again.');
        }
      }
    }, LOADING_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [isLoading]);

  // Transform pairs into exchange-organized structure for backward compatibility
  const pairsByExchange = useMemo(() => {
    return convertToFlatPairsByExchange(pairsByProvider);
  }, [pairsByProvider]);

  // Refresh function for manual refresh
  const refresh = useCallback(async () => {
    logger.info('[useTradingPairs] Manual refresh requested');
    // Clear data first so that shouldFetch becomes true on the next render,
    // re-enabling the query.
    useTradingPairsDataStore.getState().clearAll();
    setLoading(true);
    setError(null);

    try {
      if (apiResult.refetch) {
        await apiResult.refetch();
      }
    } catch (err) {
      logger.error('[useTradingPairs] Manual refresh failed:', err);
      setError(err instanceof Error ? err.message : 'Refresh failed');
      setLoading(false);
    }
  }, [apiResult, setError, setLoading]);

  // Return backward compatible structure.
  // Report pre-hydration as loading so consumers don't render an empty state
  // (e.g. PairSelector's "No available pairs to add") during the IDB read
  // window on hard refresh / HMR.
  const result = useMemo(
    () => ({
      isLoading: isLoading || !_hasHydrated,
      error: error ? new Error(error) : null,

      // Existing pairsByExchange for backward compatibility
      pairsByExchange,

      // New methods
      refresh,
    }),
    [isLoading, _hasHydrated, error, pairsByExchange, refresh]
  );
  return result;
}
