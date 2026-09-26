/**
 * Utilities for handling Zustand stores with IndexedDB persistence
 * Provides methods to wait for store hydration before accessing data
 */

import type { ExchangesState } from '@/stores/exchangesStore';
import type { TradingPairsDataState } from '@/stores/tradingPairsDataStore';
import type { UsdRateState } from '@/stores/usdRateStore';
import type { UserFeesState } from '@/stores/userFeesStore';
import logger from './loggerInstance';

// Track hydration status for stores
const hydrationStatus = new Map<string, boolean>();
const hydrationPromises = new Map<string, Promise<void>>();

/**
 * Wait for a Zustand store to hydrate from IndexedDB
 * This ensures that persisted data is loaded before accessing store values
 */
export const waitForStoreHydration = async <T>(
  store: {
    getState: () => T;
    subscribe: (callback: (state: T) => void) => () => void;
  },
  storeName: string,
  isHydratedCheck: (state: T) => boolean,
  timeout = 3000
): Promise<T> => {
  // If we already know this store is hydrated, return immediately
  if (hydrationStatus.get(storeName)) {
    return store.getState();
  }

  // If there's already a hydration promise for this store, wait for it
  if (hydrationPromises.has(storeName)) {
    await hydrationPromises.get(storeName);
    return store.getState();
  }

  // Check if already hydrated
  const currentState = store.getState();
  if (isHydratedCheck(currentState)) {
    hydrationStatus.set(storeName, true);
    return currentState;
  }

  // Create a promise to wait for hydration
  const hydrationPromise = new Promise<void>((resolve) => {
    const timeoutId = setTimeout(() => {
      logger.warn(`[StoreUtils] Timeout waiting for ${storeName} hydration`);
      hydrationStatus.set(storeName, true); // Assume hydrated to prevent future waits
      resolve();
    }, timeout);

    // Subscribe to store changes
    const unsubscribe = store.subscribe((state) => {
      if (isHydratedCheck(state)) {
        clearTimeout(timeoutId);
        hydrationStatus.set(storeName, true);
        unsubscribe();
        logger.debug(`[StoreUtils] ${storeName} hydrated successfully`);
        resolve();
      }
    });

    // Also check immediately in case hydration happened between checks
    const state = store.getState();
    if (isHydratedCheck(state)) {
      clearTimeout(timeoutId);
      hydrationStatus.set(storeName, true);
      unsubscribe();
      logger.debug(`[StoreUtils] ${storeName} was already hydrated`);
      resolve();
    }
  });

  hydrationPromises.set(storeName, hydrationPromise);

  try {
    await hydrationPromise;
    return store.getState();
  } finally {
    hydrationPromises.delete(storeName);
  }
};

/**
 * Wait for USD rate store to hydrate and get the rate
 * Returns 0 if no rate is available after hydration
 */
export const waitForUsdRateStoreHydration = async (
  usdRateStore: {
    getState: () => UsdRateState;
    subscribe: (callback: (state: UsdRateState) => void) => () => void;
  },
  timeout = 3000
): Promise<number> => {
  try {
    const state = await waitForStoreHydration(
      usdRateStore,
      'usd-rate-storage',
      // Check if the store has been hydrated - either has a rate > 0 or has been explicitly set to 0
      (state: UsdRateState) => {
        // If we have a timestamp, it means the store has been hydrated from IndexedDB
        // Even if rate is 0, it's a valid hydrated state if timestamp exists
        return state.timestamp > 0 || state.rate > 0;
      },
      timeout
    );

    return state.rate;
  } catch (error) {
    logger.warn(
      '[StoreUtils] Failed to wait for USD rate store hydration:',
      error
    );
    return 0; // Fallback to default rate
  }
};

/**
 * Wait for User Fees store to hydrate and get the fees
 * Returns the full hydrated state
 */
export const waitForUserFeesStoreHydration = async (
  userFeesStore: {
    getState: () => UserFeesState;
    subscribe: (callback: (state: UserFeesState) => void) => () => void;
  },
  timeout = 3000
): Promise<UserFeesState> => {
  try {
    const state = await waitForStoreHydration(
      userFeesStore,
      'user-fees-storage',
      // Check if the store has been hydrated - has timestamp or has fees data
      (state: UserFeesState) => {
        // If we have a timestamp, it means the store has been hydrated from IndexedDB
        // Even if fees is empty, it's a valid hydrated state if timestamp exists
        return state.timestamp > 0 || Object.keys(state.fees).length > 0;
      },
      timeout
    );

    return state;
  } catch (error) {
    logger.warn(
      '[StoreUtils] Failed to wait for User Fees store hydration:',
      error
    );
    // Return empty state as fallback
    return {
      fees: {},
      timestamp: 0,
      isLoading: false,
      error: null,
      _hasHydrated: false,
      setFees: () => {},
      getFee: () => null,
      isExpired: () => true,
      clearExpiredFees: () => {},
      setLoading: () => {},
      setError: () => {},
      setHasHydrated: () => {},
      clearAll: () => {},
    };
  }
};

/**
 * Wait for Exchanges store to hydrate and get the exchanges
 * Returns the full hydrated state
 */
export const waitForExchangesStoreHydration = async (
  exchangesStore: {
    getState: () => ExchangesState;
    subscribe: (callback: (state: ExchangesState) => void) => () => void;
  },
  timeout = 3000
): Promise<ExchangesState> => {
  try {
    const state = await waitForStoreHydration(
      exchangesStore,
      'exchanges-storage',
      // Check if the store has been hydrated - has timestamp or has exchanges data
      (state: ExchangesState) => {
        // If we have a timestamp, it means the store has been hydrated from IndexedDB
        // Even if exchanges is empty, it's a valid hydrated state if timestamp exists
        return state.timestamp > 0 || Object.keys(state.exchanges).length > 0;
      },
      timeout
    );

    return state;
  } catch (error) {
    logger.warn(
      '[StoreUtils] Failed to wait for Exchanges store hydration:',
      error
    );
    // Return empty state as fallback
    return {
      exchanges: {},
      timestamp: 0,
      isLoading: false,
      initialLoaded: false,
      error: null,
      _hasHydrated: false,
      setExchanges: () => {},
      addOrUpdateExchange: () => {},
      removeExchange: () => {},
      getExchange: () => null,
      getAllExchanges: () => [],
      getExchangesByProvider: () => [],
      isExpired: () => true,
      clearExpiredData: () => {},
      markStale: () => {},
      setLoading: () => {},
      setError: () => {},
      setHasHydrated: () => {},
      clearAll: () => {},
      hasData: () => false,
    };
  }
};

/**
 * Wait for Trading Pairs Data store to hydrate and get the trading pairs
 * Returns the full hydrated state
 */
export const waitForTradingPairsDataStoreHydration = async (
  tradingPairsDataStore: {
    getState: () => TradingPairsDataState;
    subscribe: (callback: (state: TradingPairsDataState) => void) => () => void;
  },
  timeout = 3000
): Promise<TradingPairsDataState> => {
  try {
    const state = await waitForStoreHydration(
      tradingPairsDataStore,
      'trading-pairs-data-storage',
      // Check if the store has been hydrated - has timestamp or has pairs data
      (state: TradingPairsDataState) => {
        // If we have a timestamp, it means the store has been hydrated from IndexedDB
        // Even if pairs is empty, it's a valid hydrated state if timestamp exists
        return (
          state.timestamp > 0 || Object.keys(state.pairsByProvider).length > 0
        );
      },
      timeout
    );

    return state;
  } catch (error) {
    logger.warn(
      '[StoreUtils] Failed to wait for Trading Pairs Data store hydration:',
      error
    );
    // Return empty state as fallback
    return {
      pairsByProvider: {},
      context: null,
      timestamp: 0,
      isLoading: false,
      error: null,
      initialLoaded: false,
      _hasHydrated: false,
      setPairs: () => {},
      getPairsByExchange: () => [],
      getAllPairs: () => [],
      getPairsByExchangeFlat: () => ({}),
      isExpired: () => true,
      clearExpiredPairs: () => {},
      markStale: () => {},
      setLoading: () => {},
      setError: () => {},
      setHasHydrated: () => {},
      clearAll: () => {},
      hasData: () => false,
    };
  }
};

/**
 * Reset hydration status for a store (useful for testing or manual cache clearing)
 */
export const resetStoreHydration = (storeName: string) => {
  hydrationStatus.delete(storeName);
  hydrationPromises.delete(storeName);
};

/**
 * Reset all hydration status (useful for testing or manual cache clearing)
 */
export const resetAllStoreHydration = () => {
  hydrationStatus.clear();
  hydrationPromises.clear();
};
