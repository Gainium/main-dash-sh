import {
  GraphQLClient,
  GraphQlQuery,
  DEFAULT_READ_TIMEOUT_MS,
  type ReturnResult,
} from '@/lib/api';
import { logger } from '@/lib/loggerInstance';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useUsdRateStore } from '@/stores/usdRateStore';
import { useCallback, useEffect, useMemo } from 'react';

// Queue to track in-progress requests (singleton pattern for USD rate)
let requestPromise: Promise<number> | null = null;

export interface FetchUsdRateOptions {
  /** Force refetch even if data exists and hasn't expired */
  force?: boolean;
  /** Show console logs for debugging */
  debug?: boolean;
}

/**
 * Hook for fetching and managing USD rate with caching
 * USD rate changes every 12 hours on backend (00:00, 12:00), cache expires when crossing these boundaries
 */
export function useUsdRateService() {
  const { tokens } = useAuthStore();
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);
  const {
    rate,
    isLoading,
    error,
    setRate,
    isExpired,
    clearRate,
    setLoading,
    setError,
    _hasHydrated,
  } = useUsdRateStore();

  // Wait for IDB rehydration before deciding to fetch — otherwise the initial
  // rate=0 (pre-hydration) would always trigger a fetch even when a cached
  // rate is about to arrive from IndexedDB.
  const shouldFetch = useMemo(
    () => _hasHydrated && rate === 0 && !isLoading,
    [_hasHydrated, rate, isLoading]
  );

  /**
   * Fetch USD rate from GraphQL API
   */
  const fetchUsdRate = useCallback(
    async (options: FetchUsdRateOptions = {}): Promise<number> => {
      const { force = false, debug = false } = options;

      if (!tokens?.accessToken) {
        const error = 'Not authenticated';
        setError(error);
        return 0;
      }

      // Check if we have valid cached data
      if (!force && !isExpired() && rate > 0) {
        if (debug) {
          logger.debug('[UsdRateService] Returning cached USD rate:', { rate });
        }
        return rate;
      }

      // Check if request is already in progress
      if (requestPromise) {
        if (debug) {
          logger.debug(
            '[UsdRateService] Request already in progress, joining queue'
          );
        }
        return await requestPromise;
      }

      setLoading(true);
      setError(null);

      if (debug) {
        logger.debug('[UsdRateService] Fetching USD rate from API');
      }

      // Create the fetch promise and track it globally
      requestPromise = (async (): Promise<number> => {
        try {
          const { query } = GraphQlQuery.getUsdRate();

          const endpoint =
            import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
          const client = new GraphQLClient(
            endpoint,
            tokens.accessToken,
            !isLiveTrading
          );

          const resp = await client.request<{
            getUsdRate: ReturnResult<number>;
          }>(query, undefined, { timeoutMs: DEFAULT_READ_TIMEOUT_MS });

          if (
            resp?.getUsdRate?.status === 'OK' &&
            typeof resp.getUsdRate.data === 'number'
          ) {
            const fetchedRate = resp.getUsdRate.data;

            // Store the rate
            setRate(fetchedRate);

            if (debug) {
              logger.debug(
                '[UsdRateService] Successfully fetched and cached USD rate:',
                { rate: fetchedRate }
              );
            }

            return fetchedRate;
          } else {
            const reason = resp?.getUsdRate?.reason || 'Unknown error';
            throw new Error(`Failed to fetch USD rate: ${reason}`);
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          setError(errorMessage);
          logger.error('[UsdRateService] Error fetching USD rate:', error);
          return 0;
        }
      })();

      try {
        const result = await requestPromise;
        return result;
      } finally {
        setLoading(false);
        requestPromise = null; // Clear the global promise
      }
    },
    [
      tokens?.accessToken,
      isLiveTrading,
      rate,
      isExpired,
      setRate,
      setLoading,
      setError,
    ]
  );

  useEffect(() => {
    if (shouldFetch) {
      fetchUsdRate();
    }
  }, [shouldFetch, fetchUsdRate]);

  /**
   * Get cached USD rate (returns 0 if not available or expired)
   */
  const getCachedRate = useCallback((): number => {
    return rate || 0;
  }, [rate]);

  /**
   * Check if USD rate needs to be fetched
   */
  const needsFetch = useCallback((): boolean => {
    return rate === 0 || isExpired();
  }, [rate, isExpired]);

  // Report pre-hydration as loading so consumers don't render USD values as 0
  // during the IDB read window on hard refresh / HMR.
  const effectiveLoading = isLoading || !_hasHydrated;

  return {
    // State
    rate,
    isLoading: effectiveLoading,
    error,

    // Actions
    fetchUsdRate,
    getCachedRate,
    needsFetch,
    clearRate,
  };
}
