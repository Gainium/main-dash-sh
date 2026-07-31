import { createIndexedDBStorage } from '@/lib/zustand-indexeddb-storage';
import logger from '@/lib/loggerInstance';
import type { ExchangeInUser } from '@/types/exchange.types';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ExchangesState {
  exchanges: Record<string, ExchangeInUser>; // keyed by uuid
  timestamp: number;
  isLoading: boolean;
  error: string | null;
  initialLoaded: boolean;
  /** True once IndexedDB rehydration has completed (or failed). Consumers should
   *  treat !_hasHydrated as loading — without it the initial in-memory state
   *  (empty exchanges, isLoading=false) is indistinguishable from "fetched and
   *  there really are no exchanges". */
  _hasHydrated: boolean;

  // Actions
  setExchanges: (exchanges: ExchangeInUser[]) => void;
  addOrUpdateExchange: (exchange: ExchangeInUser) => void;
  removeExchange: (uuid: string) => void;
  getExchange: (uuid: string) => ExchangeInUser | null;
  getAllExchanges: () => ExchangeInUser[];
  getExchangesByProvider: (provider: string) => ExchangeInUser[];
  isExpired: () => boolean;
  clearExpiredData: () => void;
  markStale: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setHasHydrated: (state: boolean) => void;
  clearAll: () => void;
  hasData: () => boolean;
}

// Cache expires after 1 hour
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

let timer: NodeJS.Timeout;

export const useExchangesStore = create<ExchangesState>()(
  persist(
    (set, get) => ({
      exchanges: {},
      timestamp: 0,
      isLoading: false,
      error: null,
      initialLoaded: false,
      _hasHydrated: false,

      setExchanges: (newExchanges: ExchangeInUser[]) => {
        logger.info(
          `[ExchangesStore] Setting ${newExchanges.length} exchanges`
        );
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          set(() => {
            const exchanges: Record<string, ExchangeInUser> = {};
            for (const exchange of newExchanges) {
              exchanges[exchange.uuid] = { ...exchange };
            }
            return {
              exchanges,
              error: null,
              timestamp: Date.now(),
              isLoading: false,
              initialLoaded: true,
            };
          });
        }, 300);
      },

      addOrUpdateExchange: (exchange: ExchangeInUser) => {
        logger.info(
          `[ExchangesStore] Adding/updating exchange: ${exchange.uuid}`
        );
        set((state) => ({
          exchanges: {
            ...state.exchanges,
            [exchange.uuid]: { ...exchange },
          },
          error: null,
          timestamp: Date.now(), // Update timestamp for cache management
        }));
      },

      removeExchange: (uuid: string) => {
        logger.info(`[ExchangesStore] Removing exchange: ${uuid}`);
        set((state) => {
          const { [uuid]: _removed, ...remaining } = state.exchanges;
          return {
            exchanges: remaining,
            error: null,
            timestamp: Date.now(), // Update timestamp for cache management
          };
        });
      },

      getExchange: (uuid: string) => {
        const exchange = get().exchanges[uuid];
        if (!exchange) {
          logger.debug(`[ExchangesStore] Exchange not found: ${uuid}`);
          return null;
        }
        return exchange;
      },

      getAllExchanges: () => {
        const exchanges = Object.values(get().exchanges);
        logger.debug(
          `[ExchangesStore] Returning ${exchanges.length} exchanges`
        );
        return exchanges;
      },

      getExchangesByProvider: (provider: string) => {
        const exchanges = Object.values(get().exchanges).filter(
          (exchange) => exchange.provider === provider
        );
        logger.debug(
          `[ExchangesStore] Returning ${exchanges.length} exchanges for provider: ${provider}`
        );
        return exchanges;
      },

      isExpired: () => {
        const state = get();
        if (!state.timestamp) {
          logger.debug('[ExchangesStore] No timestamp, data is expired');
          return true; // No data = needs fetch
        }

        const now = Date.now();
        const isExpired = now - state.timestamp > CACHE_DURATION_MS;

        if (isExpired) {
          logger.debug('[ExchangesStore] Data is expired (older than 1 hour)');
        } else {
          const remainingTime = Math.round(
            (CACHE_DURATION_MS - (now - state.timestamp)) / 1000 / 60
          );
          logger.debug(
            `[ExchangesStore] Data is fresh (expires in ${remainingTime} minutes)`
          );
        }

        return isExpired;
      },

      clearExpiredData: () => {
        // Keep exchange data so UI components (e.g. ExchangeChip) can still
        // resolve UUIDs to display names while a background re-fetch runs.
        logger.info(
          '[ExchangesStore] Marking expired data as stale (keeping exchanges for display)'
        );
        set({
          timestamp: 0,
          error: null,
          initialLoaded: false,
        });
      },

      markStale: () => {
        logger.info(
          '[ExchangesStore] Marking exchanges as stale (keeping data for display)'
        );
        set({
          timestamp: 0,
          initialLoaded: false,
        });
      },

      // Bail out when nothing actually changes. Every `set` hands subscribers a
      // brand-new state object, and this store is consumed without a selector
      // (`useExchangesStore()`), so a redundant write re-renders every consumer
      // for nothing — and lets an effect that re-writes the same value sustain
      // a render loop. Same guard as authStore.setLoading.
      setLoading: (loading: boolean) => {
        if (get().isLoading === loading) return;
        logger.debug(`[ExchangesStore] Setting loading: ${loading}`);
        set({ isLoading: loading });
      },

      setError: (error: string | null) => {
        const { error: prevError, isLoading } = get();
        if (prevError === error && !isLoading) return;
        logger.error(`[ExchangesStore] Setting error: ${error}`);
        set({ error, isLoading: false });
      },

      setHasHydrated: (state: boolean) => set({ _hasHydrated: state }),

      clearAll: () => {
        logger.info('[ExchangesStore] Clearing all data');
        set({
          exchanges: {},
          error: null,
          isLoading: false,
          timestamp: 0,
        });
      },

      hasData: () => {
        const exchanges = get().exchanges;
        const hasData = Object.keys(exchanges).length > 0;
        logger.debug(`[ExchangesStore] Has data: ${hasData}`);
        return hasData;
      },
    }),
    {
      name: 'exchanges-storage',
      storage: createIndexedDBStorage('exchanges-storage'),
      partialize: (state) => ({
        exchanges: state.exchanges,
        timestamp: state.timestamp,
      }),
      merge: (persistedState, currentState) => {
        return {
          ...currentState,
          ...(persistedState as Partial<ExchangesState>),
          isLoading: false,
          error: null,
          initialLoaded: false,
        };
      },
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          logger.error('[ExchangesStore] Rehydration error:', error);
        }
        // Flip hasHydrated regardless of error — consumers should stop waiting
        // and let the network fetch take over even if IDB read failed.
        useExchangesStore.getState().setHasHydrated(true);
      },
    }
  )
);

// Auto-cleanup timer: Clear expired cache (runs every hour in browser)
if (typeof window !== 'undefined') {
  // Check for expired data every hour
  const checkExpiration = () => {
    try {
      const state = useExchangesStore.getState();
      if (state.isExpired() && state.hasData()) {
        // Mark stale instead of clearing so chips keep showing the last known
        // exchange names while the background re-fetch is in progress.
        logger.info(
          '[ExchangesStore] Auto-marking expired exchanges as stale (re-fetch will happen in background)'
        );
        state.markStale();
      }
    } catch (error) {
      logger.error(
        '[ExchangesStore] Error during automatic expiration check:',
        error
      );
    }
  };

  // Run initial check after 5 minutes (allow app to fully initialize)
  setTimeout(checkExpiration, 5 * 60 * 1000);

  // Then check every hour
  setInterval(checkExpiration, CACHE_DURATION_MS);
}
