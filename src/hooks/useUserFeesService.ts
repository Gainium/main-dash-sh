import {
  GraphQLClient,
  GraphQlQuery,
  DEFAULT_READ_TIMEOUT_MS,
  type ReturnResult,
} from '@/lib/api';
import { logger } from '@/lib/loggerInstance';
import { waitForUserFeesStoreHydration } from '@/lib/storeUtils';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useUserFeesStore, type UserFeeEntry } from '@/stores/userFeesStore';
import { useCallback } from 'react';
// Queue to track in-progress requests by exchangeUUID
const requestQueue = new Map<string, Promise<UserFeeEntry[]>>();

export interface FetchFeesOptions {
  /** Force refetch even if data exists and hasn't expired */
  force?: boolean;
  /** Show console logs for debugging */
  debug?: boolean;
}

export interface FetchMultipleFeesParams {
  exchangeSymbolMap: Map<string, Set<string>>;
  options?: FetchFeesOptions;
}

/**
 * Hook for fetching and managing user fees with caching and queue management
 */
export function useUserFees() {
  const { tokens } = useAuthStore();
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);
  const {
    fees,
    isLoading,
    error,
    setFees,
    getFee,
    isExpired,
    clearExpiredFees,
    setLoading,
    setError,
  } = useUserFeesStore();

  /**
   * Fetch fees for a specific exchangeUUID-symbols combination
   */
  const fetchFeesForExchange = useCallback(
    async (
      exchangeUUID: string,
      symbols: string[],
      debug = false
    ): Promise<UserFeeEntry[]> => {
      if (!tokens?.accessToken) {
        throw new Error('Not authenticated');
      }

      if (symbols.length === 0) {
        return [];
      }

      try {
        const { query, variables } = GraphQlQuery.multipleUserFees({
          symbol: symbols,
          uuid: exchangeUUID,
        });

        const endpoint =
          import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
        const client = new GraphQLClient(
          endpoint,
          tokens.accessToken,
          !isLiveTrading
        );

        const resp = await client.request<{
          multipleUserFees: ReturnResult<
            Array<{ symbol: string; maker: number; taker: number }>
          >;
        }>(query, variables, { timeoutMs: DEFAULT_READ_TIMEOUT_MS });

        if (
          resp?.multipleUserFees?.status === 'OK' &&
          Array.isArray(resp.multipleUserFees.data)
        ) {
          const fetchedFees: UserFeeEntry[] = [];

          for (const feeData of resp.multipleUserFees.data) {
            const fee: UserFeeEntry = {
              exchangeUUID,
              symbol: feeData.symbol,
              maker: typeof feeData.maker === 'number' ? feeData.maker : 0.001,
              taker:
                typeof feeData.taker === 'number'
                  ? feeData.taker
                  : feeData.maker || 0.001,
            };
            fetchedFees.push(fee);
          }

          if (debug) {
            logger.debug(
              `[UserFeesService] Fetched ${fetchedFees.length} fees for ${exchangeUUID}:`,
              {
                fees: fetchedFees.map((f) => ({
                  symbol: f.symbol,
                  maker: f.maker,
                  taker: f.taker,
                })),
              }
            );
          }

          return fetchedFees;
        } else {
          const reason = resp?.multipleUserFees?.reason || 'Unknown error';
          throw new Error(
            `Failed to fetch fees for ${exchangeUUID}: ${reason}`
          );
        }
      } catch (error) {
        logger.error(
          `[UserFeesService] Error fetching fees for exchangeUUID ${exchangeUUID}:`,
          error
        );
        throw error;
      }
    },
    [tokens?.accessToken, isLiveTrading]
  );

  /**
   * Fetch fees for multiple exchangeUUID-symbol combinations with queue management
   */
  const fetchMultipleFees = useCallback(
    async ({
      exchangeSymbolMap,
      options = {},
    }: FetchMultipleFeesParams): Promise<UserFeeEntry[]> => {
      const { force = false, debug = false } = options;

      if (!tokens?.accessToken) {
        const error = 'Not authenticated';
        setError(error);
        return [];
      }
      await waitForUserFeesStoreHydration(useUserFeesStore);

      // Determine what needs to be fetched (not in queue and not cached)
      const toFetch = new Map<string, Set<string>>();
      const queuedRequests: Promise<UserFeeEntry[]>[] = [];

      for (const [exchangeUUID, symbolsSet] of exchangeSymbolMap.entries()) {
        // Check if we already have a request in progress for this exchangeUUID
        const existingRequest = requestQueue.get(exchangeUUID);

        if (existingRequest) {
          // Add to existing request queue
          queuedRequests.push(existingRequest);
          if (debug) {
            logger.debug(
              `[UserFeesService] Request for ${exchangeUUID} already in progress, joining queue`
            );
          }
          continue;
        }

        // Check which symbols need fetching
        const symbolsToFetch = new Set<string>();
        for (const symbol of symbolsSet) {
          // Check if fee exists and if global cache is expired
          const fee = getFee(exchangeUUID, symbol);
          const shouldFetch = force || !fee || isExpired();
          if (shouldFetch) {
            symbolsToFetch.add(symbol);
          }
        }

        if (symbolsToFetch.size > 0) {
          toFetch.set(exchangeUUID, symbolsToFetch);
        }
      }
      // If everything is either cached or queued, wait for results
      if (toFetch.size === 0) {
        if (debug) {
          logger.debug('[UserFeesService] All fees are cached or queued');
        }

        // Wait for any queued requests and combine with cached results
        const queuedResults = await Promise.allSettled(queuedRequests);
        const allFees: UserFeeEntry[] = [];
        // Add results from queued requests
        const rejections: unknown[] = [];
        for (const result of queuedResults) {
          if (result.status === 'fulfilled') {
            allFees.push(...result.value); // exchangeUUID placeholder
          } else {
            rejections.push(result.reason);
          }
        }

        // A rejected request is NOT the same as "this pair has no fee", and
        // swallowing it here made the two indistinguishable to callers: a
        // timed-out lookup came back as an absent entry, and `useUserFee` then
        // told the user "User fee not found for BTCUSDT" — a definitive claim
        // about their account that was simply false. Seen 2026-08-06 while the
        // bot service was restarting; it never appeared before or after.
        //
        // If every request failed and nothing was served from cache, surface it
        // as the failure it is so the caller can say "couldn't check" instead of
        // "not found". Partial success still returns what we have.
        if (
          rejections.length > 0 &&
          rejections.length === queuedResults.length &&
          allFees.length === 0
        ) {
          const first = rejections[0];
          throw first instanceof Error
            ? first
            : new Error(String(first ?? 'user fee lookup failed'));
        }

        // Add cached fees for remaining symbols
        for (const [exchangeUUID, symbolsSet] of exchangeSymbolMap.entries()) {
          for (const symbol of symbolsSet) {
            const fee = getFee(exchangeUUID, symbol);
            if (
              fee &&
              !allFees.some(
                (f) => f.exchangeUUID === exchangeUUID && f.symbol === symbol
              )
            ) {
              allFees.push({ ...fee, exchangeUUID });
            }
          }
        }

        return allFees;
      }

      setLoading(true);
      setError(null);

      if (debug) {
        logger.debug('[UserFeesService] Fetching fees for:', {
          exchangeCount: toFetch.size,
          totalSymbols: Array.from(toFetch.values()).reduce(
            (sum, set) => sum + set.size,
            0
          ),
          details: Array.from(toFetch.entries()).map(
            ([exchangeUUID, symbols]) => ({
              exchangeUUID,
              symbols: Array.from(symbols),
            })
          ),
        });
      }

      // Create promises for each exchangeUUID and add them to the queue
      const fetchPromises: Promise<UserFeeEntry[]>[] = [];

      for (const [exchangeUUID, symbolsSet] of toFetch.entries()) {
        const symbols = Array.from(symbolsSet);

        // Create the fetch promise and add to queue
        const fetchPromise = fetchFeesForExchange(
          exchangeUUID,
          symbols,
          debug
        ).finally(() => {
          // Remove from queue when done
          requestQueue.delete(exchangeUUID);
        });

        requestQueue.set(exchangeUUID, fetchPromise);
        fetchPromises.push(fetchPromise);
      }

      // Add any existing queued requests
      fetchPromises.push(...queuedRequests);

      try {
        // Wait for all requests to complete
        const results = await Promise.allSettled(fetchPromises);
        const allFetchedFees: UserFeeEntry[] = [];
        const errors: string[] = [];

        // Process results
        for (const result of results) {
          if (result.status === 'fulfilled') {
            allFetchedFees.push(...result.value);
          } else {
            errors.push(result.reason?.message || 'Unknown error');
          }
        }

        // Store successfully fetched fees
        if (allFetchedFees.length > 0) {
          setFees(allFetchedFees);
          if (debug) {
            logger.debug(
              '[UserFeesService] Successfully fetched and stored fees:',
              {
                count: allFetchedFees.length,
                fees: allFetchedFees.map((f) => ({
                  exchangeUUID: f.exchangeUUID,
                  symbol: f.symbol,
                  maker: f.maker,
                  taker: f.taker,
                })),
              }
            );
          }
        }

        // Handle errors
        if (errors.length > 0) {
          const errorMessage = `Some requests failed: ${errors.join('; ')}`;
          setError(errorMessage);
          if (debug) {
            logger.warn('[UserFeesService] Some fee requests failed:', errors);
          }
        }

        // Include cached fees for symbols that weren't fetched
        const finalResults: UserFeeEntry[] = [...allFetchedFees];
        for (const [exchangeUUID, symbolsSet] of exchangeSymbolMap.entries()) {
          for (const symbol of symbolsSet) {
            // Only add cached fee if we don't already have it from fetch
            const alreadyHave = finalResults.some(
              (f) => f.exchangeUUID === exchangeUUID && f.symbol === symbol
            );
            if (!alreadyHave) {
              const cachedFee = getFee(exchangeUUID, symbol);
              if (cachedFee) {
                finalResults.push(cachedFee);
              }
            }
          }
        }

        return finalResults;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        setError(errorMessage);
        logger.error('[UserFeesService] Error fetching multiple fees:', error);
        return [];
      } finally {
        setLoading(false);
      }
    },
    [
      tokens?.accessToken,
      getFee,
      isExpired,
      setFees,
      setLoading,
      setError,
      fetchFeesForExchange,
    ]
  );

  /**
   * Get a single fee from cache (returns null if not available or expired)
   * @param exchangeUUID - The unique identifier for the exchange (not provider name)
   * @param symbol - The trading symbol (e.g., 'BTCUSDT')
   */
  const getCachedFee = useCallback(
    (exchangeUUID: string, symbol: string): UserFeeEntry | null => {
      return getFee(exchangeUUID, symbol);
    },
    [getFee]
  );

  /**
   * Check if a fee needs to be fetched
   * @param exchangeUUID - The unique identifier for the exchange (not provider name)
   * @param symbol - The trading symbol (e.g., 'BTCUSDT')
   */
  const needsFetch = useCallback(
    (exchangeUUID: string, symbol: string): boolean => {
      const fee = getFee(exchangeUUID, symbol);
      return !fee || isExpired();
    },
    [getFee, isExpired]
  );

  return {
    // State
    fees,
    isLoading,
    error,

    // Actions
    fetchMultipleFees,
    getCachedFee,
    needsFetch,
    clearExpiredFees,
  };
}

/**
 * Helper function to convert array of fees to the format expected by bot calculations
 * Note: Uses exchangeUUID as the exchange key, not provider name
 */
export function formatFeesForBotCalculations(fees: UserFeeEntry[]): Array<{
  exchangeUUID: string; // This is actually exchangeUUID
  symbol: string;
  fee: number;
}> {
  return fees.map((fee) => ({
    exchangeUUID: fee.exchangeUUID, // exchangeUUID
    symbol: fee.symbol,
    fee: fee.taker, // Use taker fee for calculations
  }));
}
