import logger from '@/lib/loggerInstance';
import { createQueuedIndexedDBStorage } from '@/lib/zustand-indexeddb-storage';
import type { Bot } from '@/types';
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { consultBotTombstone, isIncomingBotStale } from './staleWriteGuard';
import { mergeBotListSnapshot, type BotListScope } from './botListMerge';
import { WebSocketDebouncer } from './webSocketDebouncer';

interface GridBotsStoreState {
  // Bots by bot ID
  bots: Record<string, Bot>;

  // Loading states
  loading: boolean;
  loadingById: Record<string, boolean>;

  // Error states
  error: string | null;
  errorById: Record<string, string | null>;

  /** True once IndexedDB rehydration has completed. Lets consumers
   *  distinguish "bots not loaded yet" from "fetched and there really are no
   *  bots" so the table doesn't flash empty during the IDB read window. */
  _hasHydrated: boolean;

  // Actions
  addBot: (bot: Bot) => void;
  /** Merge a list response (see botListMerge). `scope` says what the
   *  response covers; without it nothing is removed. */
  updateBots: (bots: Bot[], scope?: BotListScope) => void;
  updateBot: (bot: Bot) => void;
  updateBotFromWebSocket: (update: {
    botId: string;
    data: Partial<Bot>;
    paperContext?: boolean;
  }) => void;
  applyBatchedWebSocketUpdates: (
    updates: Array<{
      botId: string;
      data: Partial<Bot>;
      paperContext?: boolean;
    }>
  ) => void;
  removeBot: (botId: string) => void;
  setLoading: (loading: boolean) => void;
  setBotLoading: (botId: string, loading: boolean) => void;
  setError: (error: string | null) => void;
  setBotError: (botId: string, error: string | null) => void;
  setHasHydrated: (state: boolean) => void;
  clear: () => void;

  // Selectors
  getBot: (botId: string) => Bot | null;
  getAllBots: () => Bot[];
  getBotsByStatus: (statuses: string[]) => Bot[];
  isLoading: () => boolean;
  isBotLoading: (botId: string) => boolean;
  getError: () => string | null;
  getBotError: (botId: string) => string | null;
}

// Create debouncer instance
let wsDebouncer: WebSocketDebouncer<{
  botId: string;
  data: Partial<Bot>;
  paperContext?: boolean;
}> | null = null;

export const useGridBotsStore = create<GridBotsStoreState>()(
  devtools(
    persist(
      (set, get) => ({
        bots: {},
        loading: false,
        loadingById: {},
        error: null,
        errorById: {},
        _hasHydrated: false,
        addBot(bot) {
          set((state) => ({
            bots: {
              ...state.bots,
              [bot._id]: bot,
            },
            loadingById: {
              ...state.loadingById,
              [bot._id]: false,
            },
            errorById: {
              ...state.errorById,
              [bot._id]: null,
            },
          }));
        },
        updateBots: (bots: Bot[], scope?: BotListScope) => {
          // MERGE, never replace: several queries write this store (different
          // status sets, server-capped or paged responses). A bot is removed
          // only when a COMPLETE response for a scope covering it omits it.
          // Stale-replay and tombstone guards live in mergeBotListSnapshot.
          const existing = get().bots;
          const merged = mergeBotListSnapshot(existing, bots, scope);
          if (merged === existing && !get().loading && !get().error) return;
          set({
            bots: merged,
            loading: false,
            error: null,
          });
        },

        updateBot: (bot: Bot) => {
          const existingBot = get().bots[bot._id];

          // Only update if bot already exists in store
          if (!existingBot) {
            logger.debug(
              `[GridBotsStore] Skipping update for non-existent bot ${bot._id}`
            );
            return;
          }

          if (isIncomingBotStale(existingBot, bot)) return;
          const incomingMs = bot.updated
            ? new Date(bot.updated).getTime()
            : undefined;
          const ms = Number.isNaN(incomingMs as number) ? undefined : incomingMs;
          if (consultBotTombstone(bot._id, ms) === 'reject') return;

          // Replace with full bot data from API
          set((state) => ({
            bots: {
              ...state.bots,
              [bot._id]: bot,
            },
            loadingById: {
              ...state.loadingById,
              [bot._id]: false,
            },
            errorById: {
              ...state.errorById,
              [bot._id]: null,
            },
          }));
        },

        updateBotFromWebSocket: (update: {
          botId: string;
          data: Partial<Bot>;
          paperContext?: boolean;
        }) => {
          // Initialize debouncer on first use
          if (!wsDebouncer) {
            wsDebouncer = new WebSocketDebouncer(
              (updates) => get().applyBatchedWebSocketUpdates(updates),
              (update) => update.botId,
              50 // 50ms debounce delay
            );
          }

          // Enqueue update for batching
          wsDebouncer.enqueue(update);
        },

        applyBatchedWebSocketUpdates: (updates) => {
          const state = get();
          const updatedBots = { ...state.bots };
          let hasChanges = false;

          updates.forEach(({ botId, data, paperContext }) => {
            const existingBot = updatedBots[botId];

            if (!existingBot) {
              // Bot doesn't exist in store yet, skip update
              return;
            }

            // Conflict resolution: Only apply update if WebSocket data is newer
            if (data.updated && existingBot.updated) {
              const wsTime = new Date(data.updated).getTime();
              const existingTime = new Date(existingBot.updated).getTime();

              if (wsTime < existingTime) {
                // WebSocket data is older, skip update
                logger.debug(
                  `[GridBotsStore] Skipping stale WebSocket update for bot ${botId}`,
                  { wsTime, existingTime }
                );
                return;
              }
            }

            if (
              typeof paperContext === 'boolean' &&
              typeof existingBot.paperContext === 'boolean' &&
              paperContext !== existingBot.paperContext
            ) {
              logger.debug(
                `[GridBotsStore] Skipping cross-context WebSocket update for bot ${botId}`,
                {
                  paperContext,
                  existingPaperContext: existingBot.paperContext,
                }
              );
              return;
            }

            const incomingMs =
              typeof data.updated !== 'undefined' && data.updated
                ? new Date(data.updated as string).getTime()
                : undefined;
            const ms = Number.isNaN(incomingMs as number)
              ? undefined
              : incomingMs;
            if (consultBotTombstone(botId, ms) === 'reject') return;

            // Merge WebSocket data with existing bot
            updatedBots[botId] = {
              ...existingBot,
              ...data,
              ...(typeof paperContext === 'boolean' && { paperContext }),
              _id: botId,
            };
            hasChanges = true;
          });

          // Only update state if there were actual changes
          if (hasChanges) {
            set({ bots: updatedBots });
          }
        },

        removeBot: (botId: string) => {
          set((state) => {
            const { [botId]: _, ...remainingBots } = state.bots;
            const { [botId]: __, ...remainingLoading } = state.loadingById;
            const { [botId]: ___, ...remainingErrors } = state.errorById;

            return {
              bots: remainingBots,
              loadingById: remainingLoading,
              errorById: remainingErrors,
            };
          });
        },

        setLoading: (loading: boolean) => {
          set({ loading });
        },

        setBotLoading: (botId: string, loading: boolean) => {
          set((state) => ({
            loadingById: {
              ...state.loadingById,
              [botId]: loading,
            },
          }));
        },

        setError: (error: string | null) => {
          set({ error, loading: false });
        },

        setBotError: (botId: string, error: string | null) => {
          set((state) => ({
            errorById: {
              ...state.errorById,
              [botId]: error,
            },
            loadingById: {
              ...state.loadingById,
              [botId]: false,
            },
          }));
        },

        clear: () => {
          set({
            bots: {},
            loading: false,
            loadingById: {},
            error: null,
            errorById: {},
          });
        },

        getBot: (botId: string) => {
          return get().bots[botId] || null;
        },

        getAllBots: () => {
          return Object.values(get().bots);
        },

        getBotsByStatus: (statuses: string[]) => {
          return Object.values(get().bots).filter((bot) =>
            statuses.includes(bot.status)
          );
        },

        isLoading: () => {
          return get().loading;
        },

        isBotLoading: (botId: string) => {
          return get().loadingById[botId] || false;
        },

        getError: () => {
          return get().error;
        },

        getBotError: (botId: string) => {
          return get().errorById[botId] || null;
        },

        setHasHydrated: (state: boolean) => set({ _hasHydrated: state }),
      }),
      {
        name: 'grid-bots-store',
        storage: createQueuedIndexedDBStorage('grid-bots-store'),
        // One-time cache bust: drop stale persisted bots on upgrade.
        version: 2,
        migrate: () => ({ bots: {} }),
        // Only persist bot data, not loading/error states
        partialize: (state) => ({
          bots: state.bots,
        }),
        // Merge persisted data with initial state
        merge: (persistedState, currentState) => ({
          ...currentState,
          ...(persistedState as Partial<GridBotsStoreState>),
          // Reset loading/error states on hydration
          loading: false,
          loadingById: {},
          error: null,
          errorById: {},
        }),
        onRehydrateStorage: () => (_state, error) => {
          if (error) {
            logger.error('[GridBotsStore] Rehydration error:', error);
          }
          useGridBotsStore.getState().setHasHydrated(true);
        },
      }
    ),
    {
      name: 'grid-bots-store',
    }
  )
);
