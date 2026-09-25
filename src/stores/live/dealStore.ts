import logger from '@/lib/loggerInstance';
import { createQueuedIndexedDBStorage } from '@/lib/zustand-indexeddb-storage';
import type { DCADeals } from '@/types';
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { DealUpdate } from '../../services/websocket/BotWebSocketManager';
import { consultDealTombstone, isIncomingDealStale } from './staleWriteGuard';
import { WebSocketDebouncer } from './webSocketDebouncer';

export type DealType = 'dca' | 'combo' | 'terminal';

export interface DealWithType extends DCADeals {
  dealType: DealType;
}

interface DealStoreState {
  // Deals by bot ID (includes type for filtering) - each bot has deals keyed by deal ID
  deals: Record<string, Record<string, DealWithType>>;

  // Loading states
  loading: Record<string, boolean>;

  // Error states
  errors: Record<string, string | null>;

  /** True once IndexedDB rehydration has completed. Lets consumers
   *  distinguish "deals not loaded yet" from "fetched and there really are no
   *  deals" so the table doesn't flash empty during the IDB read window. */
  _hasHydrated: boolean;

  // Actions
  updateDeals: (
    botId: string,
    deals: DCADeals[],
    dealType: DealType,
    replace?: boolean
  ) => void;
  updateDeal: (botId: string, deal: DCADeals, dealType: DealType) => void;
  /** Authoritative snapshot reconciliation: every in-scope existing deal
   *  absent from the snapshot is removed; snapshot deals are merged with the
   *  same per-deal arbitration (stale-updateTime + tombstone) as updateDeals.
   *  Out-of-scope deals (other dealType / context / status) are untouched.
   *  `complete` (default true) gates the absence-delete: pass false when the
   *  snapshot is known-partial (page-capped / truncated) so genuine deals
   *  beyond the fetched page are NOT pruned — the merge still applies.
   *  `snapshotAt` (epoch ms the response left the network) is REQUIRED for
   *  the absence-delete: a deal whose updateTime is newer than the snapshot
   *  (minus a clock-skew margin) is kept even when absent — it was created or
   *  updated after the snapshot was taken (e.g. via websocket), so the
   *  snapshot cannot vouch for its absence. Cache-replayed responses carry
   *  their original fetch stamp, which makes stale replays unable to delete
   *  anything newer than themselves. */
  reconcileDeals: (
    scope: {
      dealType: DealType;
      paperContext?: boolean;
      statuses?: string[];
      botId?: string;
      complete?: boolean;
      snapshotAt?: number;
    },
    dealsByBot: Record<string, DCADeals[]>
  ) => void;
  updateDealFromWebSocket: (update: DealUpdate, dealType: DealType) => void;
  applyBatchedDealUpdates: (
    updates: Array<DealUpdate & { dealType?: DealType }>
  ) => void;
  removeDeal: (botId: string, dealId: string) => void;
  setDealLoading: (botId: string, loading: boolean) => void;
  setDealError: (botId: string, error: string | null) => void;
  setHasHydrated: (state: boolean) => void;
  clearDeals: (botId: string) => void;
  clearAllDeals: () => void;

  // Selectors
  getDeals: (botId: string, dealType?: DealType) => DealWithType[];
  getAllDeals: (dealType?: DealType) => Record<string, DealWithType[]>;
  getDeal: (botId: string, dealId: string) => DealWithType | null;
  getActiveDeals: (botId: string, dealType?: DealType) => DealWithType[];
  getClosedDeals: (botId: string, dealType?: DealType) => DealWithType[];
  isDealLoading: (botId: string) => boolean;
  getDealError: (botId: string) => string | null;
}

// Migration function to convert array-based deals to object-based
const migrateDealData = (
  data:
    | Record<string, DealWithType[]>
    | Record<string, Record<string, DealWithType>>
): Record<string, Record<string, DealWithType>> => {
  if (!data || typeof data !== 'object') return {};

  const migrated: Record<string, Record<string, DealWithType>> = {};

  Object.entries(data).forEach(([botId, deals]) => {
    if (Array.isArray(deals)) {
      // Old format: array of deals - convert to object keyed by deal ID
      migrated[botId] = {};
      deals.forEach((deal: DealWithType) => {
        if (deal && deal._id) {
          migrated[botId][deal._id] = deal;
        }
      });
    } else if (deals && typeof deals === 'object') {
      // New format: already object keyed by deal ID
      migrated[botId] = deals as Record<string, DealWithType>;
    } else {
      // Initialize empty object for invalid data
      migrated[botId] = {};
    }
  });

  return migrated;
};

// Fold the saved (IndexedDB) deal cache into the live store at hydration.
// Hydration is queued behind the other heavy stores and the read itself can
// take seconds, so deals fetched or socket-updated in the meantime are already
// in `current`: they win unless the saved copy is strictly newer (another tab
// wrote it). Saved-only deals are restored under the same tombstone check a
// fetch gets, so a just-closed deal is not revived from the cache.
const mergeRestoredDeals = (
  saved: Record<string, Record<string, DealWithType>>,
  current: Record<string, Record<string, DealWithType>>
): Record<string, Record<string, DealWithType>> => {
  const merged: Record<string, Record<string, DealWithType>> = {};

  Object.entries(saved).forEach(([botId, savedBotDeals]) => {
    const bucket: Record<string, DealWithType> = {};
    Object.values(savedBotDeals).forEach((deal) => {
      if (!deal?._id || current[botId]?.[deal._id]) return;
      const verdict = consultDealTombstone(botId, deal._id, {
        updateTime: deal.updateTime,
        status: deal.status,
      });
      if (verdict !== 'reject') bucket[deal._id] = deal;
    });
    merged[botId] = bucket;
  });

  Object.entries(current).forEach(([botId, currentBotDeals]) => {
    const bucket = (merged[botId] ??= {});
    Object.values(currentBotDeals).forEach((deal) => {
      const savedDeal = saved[botId]?.[deal._id];
      bucket[deal._id] =
        savedDeal && isIncomingDealStale(savedDeal, deal) ? savedDeal : deal;
    });
  });

  return merged;
};

// Tolerance for client/server clock skew when comparing a deal's server-side
// updateTime against the client-side snapshotAt fetch stamp in reconcileDeals.
// A deal within this window of the snapshot is never absence-deleted; it heals
// on the next refetch instead.
const SNAPSHOT_SKEW_MARGIN_MS = 60 * 1000;

// Create debouncer instance
type DealUpdateWithType = DealUpdate & { dealType?: DealType };
let wsDebouncer: WebSocketDebouncer<DealUpdateWithType> | null = null;

export const useDealStore = create<DealStoreState>()(
  devtools(
    persist(
      (set, get) => ({
        deals: {},
        loading: {},
        errors: {},
        _hasHydrated: false,
        updateDeals: (botId, deals, dealType, replace) => {
          set((state) => {
            const existingBotDeals = state.deals[botId] || {};
            // replace rebuilds the record from scratch (but a stale/rejected
            // incoming re-adds the existing copy); merge keeps prior deals.
            const newDeals: Record<string, DealWithType> = replace
              ? {}
              : { ...existingBotDeals };

            deals.forEach((deal) => {
              const existing = existingBotDeals[deal._id];

              if (isIncomingDealStale(existing, deal)) {
                if (existing) newDeals[deal._id] = existing;
                return;
              }

              const verdict = consultDealTombstone(botId, deal._id, {
                updateTime: deal.updateTime,
                status: deal.status,
              });
              if (verdict === 'reject') {
                // Keep the existing store copy; never re-add a tombstoned deal.
                if (existing) newDeals[deal._id] = existing;
                return;
              }

              newDeals[deal._id] = { ...deal, dealType };
            });

            return {
              deals: {
                ...state.deals,
                [botId]: newDeals,
              },
              loading: {
                ...state.loading,
                [botId]: false,
              },
              errors: {
                ...state.errors,
                [botId]: null,
              },
            };
          });
        },
        updateDeal: (botId: string, deal: DCADeals, dealType: DealType) => {
          set((state) => {
            const currentDeals = state.deals[botId] || {};
            const existing = currentDeals[deal._id];

            // Strict-less stale guard: equal updateTime passes so an optimistic
            // close (which reuses updateTime) is not rejected here.
            if (isIncomingDealStale(existing, deal)) return state;

            // The status-equality accept branch lets the optimistic close pass
            // regardless of call order relative to recordDealTombstone.
            const verdict = consultDealTombstone(botId, deal._id, {
              updateTime: deal.updateTime,
              status: deal.status,
            });
            if (verdict === 'reject') return state;

            const dealWithType: DealWithType = { ...deal, dealType };

            return {
              deals: {
                ...state.deals,
                [botId]: {
                  ...currentDeals,
                  [deal._id]: dealWithType,
                },
              },
              loading: {
                ...state.loading,
                [botId]: false,
              },
              errors: {
                ...state.errors,
                [botId]: null,
              },
            };
          });
        },

        reconcileDeals: (scope, dealsByBot) => {
          set((state) => {
            const next: Record<string, Record<string, DealWithType>> = {
              ...state.deals,
            };

            // Whether an existing stored deal falls inside the reconcile scope.
            const inScope = (d: DealWithType, bucketId: string): boolean => {
              if (d.dealType !== scope.dealType) return false;
              if (typeof scope.paperContext === 'boolean') {
                // Missing existing paperContext is treated as matching.
                if (
                  typeof d.paperContext === 'boolean' &&
                  d.paperContext !== scope.paperContext
                ) {
                  return false;
                }
              }
              if (scope.statuses && !scope.statuses.includes(d.status)) {
                return false;
              }
              if (scope.botId != null && bucketId !== scope.botId) return false;
              return true;
            };

            // Apply the snapshot with the same per-deal arbitration as
            // updateDeals, tracking which deal ids the snapshot supplied per
            // bucket (so absent in-scope deals can be pruned below).
            const snapshotIds: Record<string, Set<string>> = {};

            Object.entries(dealsByBot).forEach(([bucketId, deals]) => {
              if (scope.botId != null && bucketId !== scope.botId) return;

              const existingBucket = next[bucketId] || {};
              const merged: Record<string, DealWithType> = { ...existingBucket };
              const ids = (snapshotIds[bucketId] ??= new Set<string>());

              deals.forEach((deal) => {
                ids.add(deal._id);
                const existing = existingBucket[deal._id];

                if (isIncomingDealStale(existing, deal)) {
                  if (existing) merged[deal._id] = existing;
                  return;
                }

                const verdict = consultDealTombstone(bucketId, deal._id, {
                  updateTime: deal.updateTime,
                  status: deal.status,
                });
                if (verdict === 'reject') {
                  if (existing) merged[deal._id] = existing;
                  return;
                }

                merged[deal._id] = { ...deal, dealType: scope.dealType };
              });

              next[bucketId] = merged;
            });

            // Absence-delete: any in-scope existing deal not present in the
            // snapshot is removed. Restrict to scope.botId when provided.
            // Skipped entirely when the snapshot is known-partial — pruning
            // against a page-capped response would drop genuine deals that
            // simply fell beyond the fetched page — or when it carries no
            // fetch stamp (we can't prove it isn't a stale cache replay).
            if (scope.complete === false || typeof scope.snapshotAt !== 'number') {
              return { deals: next };
            }
            // A deal updated after the snapshot was taken cannot be pruned by
            // it (the snapshot predates the deal — e.g. created via websocket
            // while the response was cached). The margin absorbs client/server
            // clock skew: updateTime is server time, snapshotAt client time.
            const pruneBefore = scope.snapshotAt - SNAPSHOT_SKEW_MARGIN_MS;
            Object.keys(next).forEach((bucketId) => {
              if (scope.botId != null && bucketId !== scope.botId) return;

              const bucket = next[bucketId];
              const ids = snapshotIds[bucketId];
              let changed = false;
              const pruned: Record<string, DealWithType> = {};

              Object.entries(bucket).forEach(([dealId, deal]) => {
                if (
                  inScope(deal, bucketId) &&
                  !(ids && ids.has(dealId)) &&
                  !(
                    typeof deal.updateTime === 'number' &&
                    deal.updateTime > pruneBefore
                  )
                ) {
                  // In scope, absent from the snapshot, and older than the
                  // snapshot -> drop it.
                  changed = true;
                  return;
                }
                pruned[dealId] = deal;
              });

              if (changed) next[bucketId] = pruned;
            });

            return { deals: next };
          });
        },

        updateDealFromWebSocket: (update: DealUpdate, dealType?: DealType) => {
          // Initialize debouncer on first use
          if (!wsDebouncer) {
            wsDebouncer = new WebSocketDebouncer<DealUpdateWithType>(
              (updates) => get().applyBatchedDealUpdates(updates),
              (update) => update.botId,
              50
            );
          }

          const updateWithType: DealUpdateWithType = { ...update, dealType };
          wsDebouncer.enqueue(updateWithType);
        },

        applyBatchedDealUpdates: (updates) => {
          const state = get();
          const updatedDeals = { ...state.deals };
          let hasChanges = false;
          updates.forEach(({ botId, data, dealType }) => {
            const deal = data as unknown as DCADeals;
            const existingBotDeals = updatedDeals[botId] || {};
            const existingDeal = existingBotDeals[deal._id];
            const wsPaperContext =
              typeof (data as { paperContext?: unknown }).paperContext ===
              'boolean'
                ? ((data as { paperContext?: boolean }).paperContext as boolean)
                : undefined;

            // Conflict resolution
            if (existingDeal && deal.updateTime) {
              if (deal.updateTime < existingDeal.updateTime) {
                logger.debug(
                  `[DealStore] Skipping stale WebSocket update for deal ${deal._id}`,
                  {
                    wsTime: deal.updateTime,
                    existingTime: existingDeal.updateTime,
                  }
                );
                return;
              }
            }

            if (
              existingDeal &&
              typeof wsPaperContext === 'boolean' &&
              typeof existingDeal.paperContext === 'boolean' &&
              wsPaperContext !== existingDeal.paperContext
            ) {
              logger.debug(
                `[DealStore] Skipping cross-context WebSocket update for deal ${deal._id}`,
                {
                  wsPaperContext,
                  existingPaperContext: existingDeal.paperContext,
                }
              );
              return;
            }

            // Tombstone consult: reject a stale replay of an entity we just
            // closed (covers both the socketIntegration and LiveUpdateContext
            // feeds since both flow through this batched path).
            const verdict = consultDealTombstone(botId, deal._id, {
              updateTime: deal.updateTime,
              status: deal.status,
            });
            if (verdict === 'reject') return;

            // Create deal with type
            const dealWithType: DealWithType = {
              ...deal,
              paperContext:
                typeof deal.paperContext === 'boolean'
                  ? deal.paperContext
                  : wsPaperContext,
              dealType: dealType || existingDeal?.dealType || 'dca',
            };

            // Update the bot's deals object
            updatedDeals[botId] = {
              ...existingBotDeals,
              [deal._id]: dealWithType,
            };

            hasChanges = true;
          });

          if (hasChanges) {
            set({ deals: updatedDeals });
          }
        },

        removeDeal: (botId: string, dealId: string) => {
          set((state) => {
            const currentDeals = state.deals[botId] || {};
            const { [dealId]: _removedDeal, ...remainingDeals } = currentDeals;

            return {
              deals: {
                ...state.deals,
                [botId]: remainingDeals,
              },
            };
          });
        },

        setDealLoading: (botId: string, loading: boolean) => {
          set((state) => ({
            loading: {
              ...state.loading,
              [botId]: loading,
            },
          }));
        },

        setDealError: (botId: string, error: string | null) => {
          set((state) => ({
            errors: {
              ...state.errors,
              [botId]: error,
            },
            loading: {
              ...state.loading,
              [botId]: false,
            },
          }));
        },

        clearDeals: (botId: string) => {
          set((state) => {
            const { [botId]: _, ...remainingDeals } = state.deals;
            const { [botId]: __, ...remainingLoading } = state.loading;
            const { [botId]: ___, ...remainingErrors } = state.errors;

            return {
              deals: remainingDeals,
              loading: remainingLoading,
              errors: remainingErrors,
            };
          });
        },

        clearAllDeals: () => {
          set({
            deals: {},
            loading: {},
            errors: {},
          });
        },

        getDeals: (botId: string, dealType?: DealType) => {
          const dealsObj = get().deals[botId] || {};
          const deals = Object.values(dealsObj);
          if (dealType) {
            return deals.filter((d) => d.dealType === dealType);
          }
          return deals;
        },

        getAllDeals: (dealType?: DealType) => {
          const allDeals = get().deals;
          const result: Record<string, DealWithType[]> = {};

          Object.entries(allDeals).forEach(([botId, dealsObj]) => {
            const deals = Object.values(dealsObj);
            const filteredDeals = dealType
              ? deals.filter((d) => d.dealType === dealType)
              : deals;

            if (filteredDeals.length > 0) {
              result[botId] = filteredDeals;
            }
          });
          return result;
        },

        getDeal: (botId: string, dealId: string) => {
          const botDeals = get().deals[botId] || {};
          return botDeals[dealId] || null;
        },

        getActiveDeals: (botId: string, dealType?: DealType) => {
          const botDealsObj = get().deals[botId] || {};
          const botDeals = Object.values(botDealsObj);
          let filtered = botDeals.filter(
            (d) => d.status === 'open' || d.status === 'start'
          );
          if (dealType) {
            filtered = filtered.filter((d) => d.dealType === dealType);
          }
          return filtered;
        },

        getClosedDeals: (botId: string, dealType?: DealType) => {
          const botDealsObj = get().deals[botId] || {};
          const botDeals = Object.values(botDealsObj);
          let filtered = botDeals.filter((d) => d.status === 'closed');
          if (dealType) {
            filtered = filtered.filter((d) => d.dealType === dealType);
          }
          return filtered;
        },

        isDealLoading: (botId: string) => {
          return get().loading[botId] || false;
        },

        getDealError: (botId: string) => {
          return get().errors[botId] || null;
        },

        setHasHydrated: (state: boolean) => set({ _hasHydrated: state }),
      }),
      {
        name: 'deals-store',
        storage: createQueuedIndexedDBStorage('deals-store'),
        // One-time cache bust: drop pre-paperContext-fix persisted deals
        // (mis-stamped contexts / stale closed deals) so clients refetch
        // cleanly. Bump this version again to force another wipe.
        // v2: wipe deals resurrected before the stale-write guards shipped —
        // those have no tombstone and would otherwise linger indefinitely.
        version: 2,
        migrate: () => ({ deals: {} }),
        // Only persist bot data, not loading/error states
        partialize: (state) => ({
          deals: state.deals,
        }),
        // Merge persisted data with initial state and migrate if necessary
        merge: (persistedState, currentState) => {
          // Null on a fresh profile (nothing saved yet).
          const state = (persistedState ?? {}) as Partial<DealStoreState>;
          let migratedDeals = {};

          if (state.deals) {
            try {
              migratedDeals = migrateDealData(state.deals);
              logger.info(
                '[DealStore] Successfully migrated deal data structure'
              );
            } catch (error) {
              logger.error('[DealStore] Failed to migrate deal data:', error);
              migratedDeals = {};
            }
          }

          return {
            ...currentState,
            ...state,
            deals: mergeRestoredDeals(migratedDeals, currentState.deals),
            // Reset loading/error states on hydration
            loading: {},
            errors: {},
          };
        },
        onRehydrateStorage: () => (_state, error) => {
          if (error) {
            logger.error('[DealStore] Rehydration error:', error);
          }
          useDealStore.getState().setHasHydrated(true);
        },
      }
    ),
    {
      name: 'deal-store',
    }
  )
);
