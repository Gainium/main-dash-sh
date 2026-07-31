import { exchangeQueries } from '@/lib/api/GraphQLQueries-exchange-queries';
import type { ExchangeInUser } from '../types/exchange.types';
import { useGraphQL } from './useGraphQL';
import { useExchangesStore } from '@/stores/exchangesStore';
import { useUIStore } from '@/stores/uiStore';
import { useEffect, useCallback, useMemo } from 'react';
import logger from '@/lib/loggerInstance';

// Real exchange response type based on GraphQL schema
export interface GetAllExchangesResponse {
  exchanges: ExchangeInUser[];
}

export function useExchanges() {
  const {
    setLoading,
    isLoading,
    setExchanges,
    error,
    setError,
    addOrUpdateExchange: _addOrUpdateExchange,
    removeExchange: _removeExchange,
    getExchange: _getExchange,
    getExchangesByProvider: _getExchangesByProvider,
    markStale,
    clearAll,
    exchanges,
    initialLoaded,
    _hasHydrated,
  } = useExchangesStore();
  const tradingMode = useUIStore((state) => state.tradingMode);
  const { query } = exchangeQueries.getAllExchanges();
  // Determine if we need to fetch from API. Wait for IDB rehydration before
  // firing — otherwise we'd fire a network request even when cached exchanges
  // are about to arrive from IndexedDB.
  // MUST NOT depend on the store's own `isLoading` — see the same note in
  // useTradingPairs. Here the feedback deadlocks instead of looping: once the
  // mirror effect below sets loading=true, `shouldFetch` flips false and the
  // old `if (shouldFetch)` guard could never run again to clear it.
  const shouldFetch = useMemo(
    () => _hasHydrated && !initialLoaded,
    [_hasHydrated, initialLoaded]
  );
  // Use GraphQL hook with conditional fetching
  const apiResult = useGraphQL<GetAllExchangesResponse>(
    'user',
    {
      query,
      variables: { queryType: 'exchanges' },
    },
    { enabled: shouldFetch }
  );

  // Trading mode switch (live/paper/demo) must reload exchanges for that context.
  useEffect(() => {
    logger.info(
      `[useExchanges] Trading mode changed to ${tradingMode}, marking exchanges stale`
    );
    markStale();
  }, [tradingMode, markStale]);

  // Update store when API data arrives.
  // Also include `initialLoaded` in deps so that when the store is marked stale
  // (initialLoaded: false) while TanStack Query still holds the same cached data
  // reference, we immediately repopulate the store from that cached data instead
  // of waiting for the background re-fetch to complete.
  useEffect(() => {
    if (
      apiResult.data?.data?.exchanges &&
      !apiResult.isLoading &&
      !apiResult.error
    ) {
      logger.info(
        `[useExchanges] API returned ${apiResult.data.data?.exchanges.length} exchanges, updating store`
      );
      setExchanges(apiResult.data.data?.exchanges);
    }
  }, [
    apiResult.data,
    apiResult.isLoading,
    apiResult.error,
    setExchanges,
    initialLoaded,
  ]);

  // Mirror the query's loading state into the store — strictly one-way and
  // unconditional, so the flag can never be left stuck true.
  useEffect(() => {
    setLoading(shouldFetch && apiResult.isLoading);
  }, [apiResult.isLoading, shouldFetch, setLoading]);

  // Update store error state
  useEffect(() => {
    if (apiResult.error) {
      logger.error('[useExchanges] API error:', apiResult.error);
      setError(apiResult.error.message || 'Failed to fetch exchanges');
    } else if (error) {
      // Clear error if API call succeeds
      setError(null);
    }
  }, [apiResult.error, error, setError]);

  // Refresh function for manual refresh
  const refresh = useCallback(async () => {
    logger.info('[useExchanges] Manual refresh requested');
    setLoading(true);
    setError(null);

    try {
      // Force refetch by clearing expired data and triggering a new fetch
      if (apiResult.refetch) {
        await apiResult.refetch();
      }
    } catch (error) {
      logger.error('[useExchanges] Manual refresh failed:', error);
      setError(error instanceof Error ? error.message : 'Refresh failed');
    }
  }, [apiResult, setError, setLoading]);

  // Store operations
  const addOrUpdateExchange = useCallback(
    (exchange: ExchangeInUser) => {
      logger.info(`[useExchanges] Adding/updating exchange: ${exchange.uuid}`);
      _addOrUpdateExchange(exchange);
    },
    [_addOrUpdateExchange]
  );

  const removeExchange = useCallback(
    (uuid: string) => {
      logger.info(`[useExchanges] Removing exchange: ${uuid}`);
      _removeExchange(uuid);
    },
    [_removeExchange]
  );

  const getExchange = useCallback(
    (uuid: string) => {
      return _getExchange(uuid);
    },
    [_getExchange]
  );

  const getExchangesByProvider = useCallback(
    (provider: string) => {
      return _getExchangesByProvider(provider);
    },
    [_getExchangesByProvider]
  );
  const data = useMemo(
    () => ({ data: { exchanges: Object.values(exchanges) } }),
    [exchanges]
  );
  const e = useMemo(() => (error ? new Error(error) : null), [error]);
  // Report pre-hydration as loading so consumers (ExchangeChip, dropdowns,
  // etc.) don't render an "unknown exchange" / empty state during the IDB
  // read window on hard refresh / HMR.
  const effectiveLoading = isLoading || !_hasHydrated;
  const result = useMemo(
    () => ({
      data,
      loading: effectiveLoading,
      isLoading: effectiveLoading,
      error: e,

      // Operations
      refresh,
      addOrUpdateExchange,
      removeExchange,
      getExchange,
      getExchangesByProvider,
      clearAll,
    }),
    [
      data,
      effectiveLoading,
      e,
      refresh,
      addOrUpdateExchange,
      removeExchange,
      getExchange,
      getExchangesByProvider,
      clearAll,
    ]
  );
  return result;
}
