import { create } from 'zustand';
import { shallow } from 'zustand/shallow';

/**
 * Cache status for a specific component and its GraphQL queries
 */
export interface CacheStatus {
  componentId: string;
  queryKeys: string[]; // Array of GraphQL query names
  lastUpdated: number; // Timestamp of oldest cached query
  isRevalidating: boolean; // Whether any query is currently revalidating
}

interface CacheStatusState {
  cacheStatuses: Map<string, CacheStatus>;

  // Actions
  updateCacheStatus: (
    componentId: string,
    queryKeys: string[],
    lastUpdated: number,
    isRevalidating: boolean
  ) => void;
  getCacheStatus: (componentId: string) => CacheStatus | undefined;
  setRevalidating: (componentId: string, isRevalidating: boolean) => void;
  removeCacheStatus: (componentId: string) => void;
}

/**
 * Store for tracking cache status across components
 * Used by StaleIndicator to show cache age and revalidation state
 */
export const useCacheStatusStore = create<CacheStatusState>((set, get) => ({
  cacheStatuses: new Map(),

  updateCacheStatus: (componentId, queryKeys, lastUpdated, isRevalidating) => {
    set((state) => {
      const current = state.cacheStatuses.get(componentId);
      // Belt-and-braces: bail out (no set) when nothing actually changed, so
      // that every subscriber (StaleIndicator) is spared a needless re-render
      // even if a caller forgets to guard on its side.
      if (
        current &&
        current.lastUpdated === lastUpdated &&
        current.isRevalidating === isRevalidating &&
        shallow(current.queryKeys, queryKeys)
      ) {
        return state;
      }

      const newStatuses = new Map(state.cacheStatuses);
      newStatuses.set(componentId, {
        componentId,
        queryKeys,
        lastUpdated,
        isRevalidating,
      });
      return { cacheStatuses: newStatuses };
    });
  },

  getCacheStatus: (componentId) => {
    return get().cacheStatuses.get(componentId);
  },

  setRevalidating: (componentId, isRevalidating) => {
    set((state) => {
      const current = state.cacheStatuses.get(componentId);
      if (!current) return state;
      // No-op when the flag already matches — avoids waking subscribers.
      if (current.isRevalidating === isRevalidating) return state;

      const newStatuses = new Map(state.cacheStatuses);
      newStatuses.set(componentId, {
        ...current,
        isRevalidating,
      });
      return { cacheStatuses: newStatuses };
    });
  },

  removeCacheStatus: (componentId) => {
    set((state) => {
      const newStatuses = new Map(state.cacheStatuses);
      newStatuses.delete(componentId);
      return { cacheStatuses: newStatuses };
    });
  },
}));
