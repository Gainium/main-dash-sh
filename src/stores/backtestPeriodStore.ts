import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { GraphQLClient, GraphQlQuery, type ReturnResult } from '@/lib/api';
import { logger } from '@/lib/loggerInstance';
import type { Period } from '@/types';
import { useAuthStore } from './authStore';

// Simple UUID v4 generator
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const STORAGE_KEY = 'backtest-periods-storage';
const MIGRATION_KEY = 'backtest-periods-migrated';

/**
 * Saved periods used to live entirely in this localStorage key (the redesign
 * never called the server, unlike the legacy dashboard). They're now stored
 * on the user's account, so anything left in localStorage is read ONCE here —
 * at module load, before zustand's `persist` rehydrates and rewrites the key —
 * and pushed up on the next successful load. Without the module-level capture
 * the `partialize` below would drop `periods` from storage first and the
 * user's local-only periods would be lost.
 */
const legacyLocalPeriods: Period[] = (() => {
  if (typeof localStorage === 'undefined') return [];
  try {
    if (localStorage.getItem(MIGRATION_KEY) === 'done') return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { state?: { periods?: Period[] } };
    return (parsed?.state?.periods ?? []).filter(
      (p) => p && typeof p.uuid === 'string' && typeof p.name === 'string'
    );
  } catch (error) {
    logger.warn('[backtestPeriods] Failed to read legacy local periods', {
      error,
    });
    return [];
  }
})();

const markMigrated = () => {
  try {
    localStorage.setItem(MIGRATION_KEY, 'done');
  } catch {
    /* storage unavailable — retry on the next load, harmless */
  }
};

const getClient = () => {
  const token = useAuthStore.getState().tokens?.accessToken;
  if (!token) {
    throw new Error('Authentication required');
  }
  const endpoint =
    import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
  return new GraphQLClient(endpoint, token);
};

type PeriodOperation =
  | 'getUserPeriods'
  | 'saveUserPeriod'
  | 'updateUserPeriod'
  | 'deleteUserPeriod';

/**
 * Every period operation returns the user's full list, so callers replace
 * local state with the server's answer rather than patching it — same
 * contract the legacy dashboard relied on.
 */
const requestPeriods = async (
  operation: PeriodOperation,
  query: string,
  variables?: Record<string, unknown>
): Promise<Period[]> => {
  const client = getClient();
  const response = await client.request<
    Record<PeriodOperation, ReturnResult<Period[]>>
  >(query, variables);
  const result = response[operation];
  if (result?.status !== 'OK') {
    throw new Error(result?.reason || `Failed to ${operation}`);
  }
  return result.data ?? [];
};

interface BacktestPeriodState {
  periods: Period[];
  lastSelectedPeriodId: string | null;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  loadPeriods: (options?: { force?: boolean }) => Promise<void>;
  addPeriod: (period: Omit<Period, '_id' | 'uuid'>) => Promise<Period | null>;
  updatePeriod: (
    uuid: string,
    updates: Partial<Omit<Period, '_id' | 'uuid'>>
  ) => Promise<void>;
  deletePeriod: (uuid: string) => Promise<void>;
  getPeriod: (uuid: string) => Period | undefined;
  setLastSelectedPeriodId: (id: string) => void;
}

// Dedupes concurrent loads — the dialog is mounted once per bot form, so
// several instances can ask for the list in the same tick.
let inFlightLoad: Promise<void> | null = null;

export const useBacktestPeriodStore = create<BacktestPeriodState>()(
  persist(
    (set, get) => ({
      periods: [],
      lastSelectedPeriodId: null,
      loading: false,
      loaded: false,
      error: null,

      loadPeriods: async (options) => {
        if (!options?.force && (get().loaded || get().loading)) {
          return inFlightLoad ?? Promise.resolve();
        }
        set({ loading: true, error: null });
        inFlightLoad = (async () => {
          try {
            const { query } = GraphQlQuery.getUserPeriods();
            let periods = await requestPeriods('getUserPeriods', query);

            // One-time lift of periods that only ever existed in this
            // browser. Keyed by uuid so a re-run can't duplicate them.
            const known = new Set(periods.map((p) => p.uuid));
            const orphans = legacyLocalPeriods.filter(
              (p) => !known.has(p.uuid)
            );
            let allMigrated = true;
            if (orphans.length) {
              logger.info('[backtestPeriods] Migrating local periods', {
                count: orphans.length,
              });
              for (const orphan of orphans) {
                try {
                  const { query: saveQuery, variables } =
                    GraphQlQuery.saveUserPeriod({
                      name: orphan.name,
                      from: orphan.from,
                      to: orphan.to,
                      uuid: orphan.uuid,
                    });
                  periods = await requestPeriods(
                    'saveUserPeriod',
                    saveQuery,
                    variables
                  );
                } catch (error) {
                  // A single bad row must not strand the rest.
                  allMigrated = false;
                  logger.warn('[backtestPeriods] Failed to migrate period', {
                    uuid: orphan.uuid,
                    error,
                  });
                }
              }
            }
            // Only close the door once everything landed — otherwise the
            // next load retries the stragglers.
            if (allMigrated) markMigrated();

            set({ periods, loaded: true, loading: false, error: null });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            logger.error('[backtestPeriods] Failed to load periods', {
              error: message,
            });
            set({ loading: false, error: message });
          } finally {
            inFlightLoad = null;
          }
        })();
        return inFlightLoad;
      },

      addPeriod: async (period) => {
        // The uuid is minted client-side (legacy parity) so the saved row can
        // be picked back out of the list the server returns.
        const uuid = generateUUID();
        try {
          const { query, variables } = GraphQlQuery.saveUserPeriod({
            ...period,
            uuid,
          });
          const periods = await requestPeriods(
            'saveUserPeriod',
            query,
            variables
          );
          set({ periods, loaded: true, error: null });
          return periods.find((p) => p.uuid === uuid) ?? null;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          logger.error('[backtestPeriods] Failed to save period', {
            error: message,
          });
          set({ error: message });
          throw error instanceof Error ? error : new Error(message);
        }
      },

      updatePeriod: async (uuid, updates) => {
        const existing = get().periods.find((p) => p.uuid === uuid);
        if (!existing) return;
        try {
          const { query, variables } = GraphQlQuery.updateUserPeriod({
            ...existing,
            ...updates,
            uuid,
          });
          const periods = await requestPeriods(
            'updateUserPeriod',
            query,
            variables
          );
          set({ periods, loaded: true, error: null });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          logger.error('[backtestPeriods] Failed to update period', {
            error: message,
          });
          set({ error: message });
          throw error instanceof Error ? error : new Error(message);
        }
      },

      deletePeriod: async (uuid) => {
        try {
          const { query, variables } = GraphQlQuery.deleteUserPeriod({ uuid });
          const periods = await requestPeriods(
            'deleteUserPeriod',
            query,
            variables
          );
          set((state) => ({
            periods,
            loaded: true,
            error: null,
            lastSelectedPeriodId:
              state.lastSelectedPeriodId === uuid
                ? null
                : state.lastSelectedPeriodId,
          }));
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          logger.error('[backtestPeriods] Failed to delete period', {
            error: message,
          });
          set({ error: message });
          throw error instanceof Error ? error : new Error(message);
        }
      },

      getPeriod: (uuid) => {
        return get().periods.find((p) => p.uuid === uuid);
      },

      setLastSelectedPeriodId: (id) => {
        set({ lastSelectedPeriodId: id });
      },
    }),
    {
      name: STORAGE_KEY,
      // The period list lives on the account now; only the "which one did I
      // pick last" preference stays device-local (legacy kept exactly this
      // under `lastBacktestPeriod`).
      partialize: (state) => ({
        lastSelectedPeriodId: state.lastSelectedPeriodId,
      }),
    }
  )
);
