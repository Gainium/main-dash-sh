import type { AssetClass } from '@/hooks/useTradingPairs';
import logger from '@/lib/loggerInstance';
import { createIndexedDBStorage } from '@/lib/zustand-indexeddb-storage';
import type { ExchangeEnum } from '@/types';
import type { OKXSource } from '@/types/exchange.types';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface TradingPair {
  pair: string;
  exchange: ExchangeEnum;
  baseAsset: {
    name: string;
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
  // Normalized asset class from the backend (default 'crypto'). Preserved
  // through the store so consumers (pair-picker, icons) can read it.
  assetCategory?: AssetClass;
  // Canonical/curated-listing flag (HL spot only; absent elsewhere => canonical).
  // Preserved through the store for the pair-picker "Canonical only" toggle.
  isCanonical?: boolean;
  // OKX account-origin owning this pair. `my` = OKX Europe (eea.okx.com) USDC/EUR
  // spot universe; unset for the global feed + all other exchanges. The bot form
  // serves an account its pairs by matching this to the account's okxSource.
  source?: OKXSource;
}

export interface TradingPairsByExchange {
  [exchangeName: string]: TradingPair[];
}

export interface TradingPairsDataState {
  // Nested structure: {[provider]: {[pair]: TradingPair}}
  pairsByProvider: Record<string, Record<string, TradingPair>>;
  timestamp: number;
  isLoading: boolean;
  error: string | null;
  /** Whether pairs have been loaded at least once this session / since last stale-mark. */
  initialLoaded: boolean;
  /** True once IndexedDB rehydration has completed (or failed). Consumers should
   *  treat this as loading — without it the initial in-memory state (empty
   *  pairsByProvider, isLoading=false) is indistinguishable from "fetched and
   *  there really are no pairs". */
  _hasHydrated: boolean;

  // Actions
  setPairs: (pairs: TradingPair[]) => void;
  getPairsByExchange: (exchange?: ExchangeEnum) => TradingPair[];
  getAllPairs: () => TradingPair[];
  getPairsByExchangeFlat: () => TradingPairsByExchange; // For backward compatibility
  isExpired: () => boolean;
  clearExpiredPairs: () => void;
  /** Mark data as stale (e.g. on trading-context switch) while keeping
   *  existing pairs in memory so the UI doesn't flash empty. */
  markStale: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setHasHydrated: (state: boolean) => void;
  clearAll: () => void;
  hasData: () => boolean;
}

// Backend updates pairs every hour at :20 (00:20, 01:20, 02:20, etc.)
// Clear cache at :25 of each hour (5 minutes after backend updates)
const CLEANUP_TARGET_MINUTE = 25; // Clear at :25 of each hour

// Helper function to organize pairs by provider in nested structure
const organizePairsByProvider = (
  pairs: TradingPair[]
): Record<string, Record<string, TradingPair>> => {
  const nested: Record<string, Record<string, TradingPair>> = {};

  pairs.forEach((pair) => {
    if (!nested[pair.exchange]) {
      nested[pair.exchange] = {};
    }
    nested[pair.exchange][pair.pair] = pair;
  });

  return nested;
};

// Helper function to convert nested structure to flat pairsByExchange for backward compatibility
export const convertToFlatPairsByExchange = (
  pairsByProvider: Record<string, Record<string, TradingPair>>
): TradingPairsByExchange => {
  const flat: TradingPairsByExchange = {};

  Object.keys(pairsByProvider).forEach((exchange) => {
    const pairs = Object.values(pairsByProvider[exchange]);
    // Sort pairs alphabetically
    flat[exchange] = pairs.sort((a, b) => a.pair.localeCompare(b.pair));
  });

  return flat;
};

export const useTradingPairsDataStore = create<TradingPairsDataState>()(
  persist(
    (set, get) => ({
      pairsByProvider: {},
      timestamp: 0,
      isLoading: false,
      error: null,
      initialLoaded: false,
      _hasHydrated: false,

      setPairs: (newPairs: TradingPair[]) => {
        set(() => {
          const pairsByProvider = organizePairsByProvider(newPairs);
          return {
            pairsByProvider,
            error: null,
            timestamp: Date.now(),
            initialLoaded: true,
          };
        });
      },

      getPairsByExchange: (exchange?: ExchangeEnum) => {
        const state = get();
        if (!exchange) {
          // Return all pairs as flat array
          return Object.values(state.pairsByProvider).flatMap((providerPairs) =>
            Object.values(providerPairs)
          );
        }
        return Object.values(state.pairsByProvider[exchange] || {});
      },

      getAllPairs: () => {
        const state = get();
        return Object.values(state.pairsByProvider).flatMap((providerPairs) =>
          Object.values(providerPairs)
        );
      },

      getPairsByExchangeFlat: () => {
        const state = get();
        return convertToFlatPairsByExchange(state.pairsByProvider);
      },

      isExpired: () => {
        const state = get();
        if (!state.timestamp) return true; // No data = needs fetch

        const now = new Date();
        const lastUpdate = new Date(state.timestamp);

        // Get the most recent :25 boundary
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        // Calculate the most recent :25 time
        let most25Recent;
        if (currentMinute >= CLEANUP_TARGET_MINUTE) {
          // Current hour's :25 has passed, so the most recent :25 is this hour
          most25Recent = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            currentHour,
            CLEANUP_TARGET_MINUTE,
            0,
            0
          );
        } else {
          // Current hour's :25 hasn't come yet, so the most recent :25 is previous hour
          most25Recent = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            currentHour - 1,
            CLEANUP_TARGET_MINUTE,
            0,
            0
          );
        }

        // If last update was before the most recent :25 and now is after it, then expired
        const wasBeforeLast25 = lastUpdate.getTime() < most25Recent.getTime();
        const nowIsAfterLast25 = now.getTime() >= most25Recent.getTime();

        return wasBeforeLast25 && nowIsAfterLast25;
      },

      clearExpiredPairs: () => {
        set(() => ({
          pairsByProvider: {},
          timestamp: 0,
          initialLoaded: false,
        }));
      },

      markStale: () => {
        logger.info(
          '[TradingPairsDataStore] Marking pairs as stale (keeping data for display)'
        );
        set({
          timestamp: 0,
          initialLoaded: false,
        });
      },

      // Bail out when the value is unchanged. Every `set` hands subscribers a
      // brand-new state object, and this store is consumed without a selector
      // (`useTradingPairsDataStore()`), so a redundant write re-renders every
      // consumer for nothing — and lets an effect that re-writes the same
      // value sustain a render loop. Same guard as authStore.setLoading.
      setLoading: (loading: boolean) => {
        if (get().isLoading === loading) return;
        set({ isLoading: loading });
      },

      setError: (error: string | null) => {
        if (get().error === error) return;
        set({ error });
      },

      setHasHydrated: (state: boolean) => set({ _hasHydrated: state }),

      clearAll: () =>
        set({
          pairsByProvider: {},
          error: null,
          isLoading: false,
          timestamp: 0,
          initialLoaded: false,
        }),

      hasData: () => {
        const state = get();
        return Object.keys(state.pairsByProvider).length > 0;
      },
    }),
    {
      name: 'trading-pairs-data-storage',
      storage: createIndexedDBStorage('trading-pairs-data-storage'),
      partialize: (state) => ({
        pairsByProvider: state.pairsByProvider,
        timestamp: state.timestamp,
      }),
      merge: (persistedState, currentState) => {
        return {
          ...currentState,
          ...(persistedState as Partial<TradingPairsDataState>),
          isLoading: false,
          error: null,
          // Always force a re-fetch after rehydation so the correct
          // trading-context pairs are loaded (matching the exchanges store
          // pattern).  Existing data is kept for display in the meantime.
          initialLoaded: false,
        };
      },
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          logger.error('[TradingPairsDataStore] Rehydration error:', error);
        }
        // Flip hasHydrated regardless of error — consumers should stop waiting
        // and let the network fetch take over even if IDB read failed.
        useTradingPairsDataStore.getState().setHasHydrated(true);
      },
    }
  )
);

// Auto-cleanup timer: Clear cache at :25 of each hour (after backend updates at :20)
if (typeof window !== 'undefined') {
  // Calculate time until next :25 minute mark
  const now = new Date();
  const currentMinute = now.getMinutes();
  const currentSecond = now.getSeconds();

  // Calculate milliseconds until next :25
  let msUntilNextCleanup;
  if (currentMinute < CLEANUP_TARGET_MINUTE) {
    // Same hour, wait until :25
    msUntilNextCleanup =
      (CLEANUP_TARGET_MINUTE - currentMinute) * 60 * 1000 -
      currentSecond * 1000;
  } else {
    // Next hour, wait until next :25
    msUntilNextCleanup =
      (60 - currentMinute + CLEANUP_TARGET_MINUTE) * 60 * 1000 -
      currentSecond * 1000;
  }

  // Set initial timeout to align with :25 minute mark
  setTimeout(() => {
    // Run cleanup immediately when we hit :25
    try {
      const state = useTradingPairsDataStore.getState();
      if (state.isExpired()) {
        state.clearExpiredPairs();
        logger.debug(
          '[TradingPairsDataStore] Automatically cleared expired trading pairs cache at :25'
        );
      }
    } catch (error) {
      logger.error(
        '[TradingPairsDataStore] Error during automatic cleanup:',
        error
      );
    }

    // Then set up hourly interval to run at :25 of each hour
    setInterval(
      () => {
        try {
          const state = useTradingPairsDataStore.getState();
          if (state.isExpired()) {
            state.clearExpiredPairs();
            logger.debug(
              '[TradingPairsDataStore] Automatically cleared expired trading pairs cache at :25'
            );
          }
        } catch (error) {
          logger.error(
            '[TradingPairsDataStore] Error during automatic cleanup:',
            error
          );
        }
      },
      60 * 60 * 1000
    ); // Run every hour
  }, msUntilNextCleanup);
}
