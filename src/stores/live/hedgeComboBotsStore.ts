import logger from '@/lib/loggerInstance';
import { createQueuedIndexedDBStorage } from '@/lib/zustand-indexeddb-storage';
import type { HedgeBot } from '@/types';
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { consultBotTombstone, isIncomingBotStale } from './staleWriteGuard';
import { mergeBotListSnapshot, type BotListScope } from './botListMerge';
import { WebSocketDebouncer } from './webSocketDebouncer';

interface HedgeComboBotsStoreState {
  // HedgeBot instances whose `bot.type === BotTypesEnum.hedgeCombo`. The type
  // is shared with hedge-dca; the storage split mirrors the dca/combo split
  // already used elsewhere so consumers can subscribe to one without
  // re-filtering the other.
  bots: Record<string, HedgeBot>;

  loading: boolean;
  loadingById: Record<string, boolean>;
  error: string | null;
  errorById: Record<string, string | null>;
  _hasHydrated: boolean;

  addBot: (bot: HedgeBot) => void;
  /** Merge a list response (see botListMerge). `scope` says what the
   *  response covers; without it nothing is removed. */
  updateBots: (bots: HedgeBot[], scope?: BotListScope) => void;
  updateBot: (bot: HedgeBot) => void;
  updateBotFromWebSocket: (update: {
    botId: string;
    data: Partial<HedgeBot>;
    paperContext?: boolean;
  }) => void;
  applyBatchedWebSocketUpdates: (
    updates: Array<{
      botId: string;
      data: Partial<HedgeBot>;
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

  getBot: (botId: string) => HedgeBot | null;
  getAllBots: () => HedgeBot[];
  getBotsByStatus: (statuses: string[]) => HedgeBot[];
  isLoading: () => boolean;
  isBotLoading: (botId: string) => boolean;
  getError: () => string | null;
  getBotError: (botId: string) => string | null;
}

let wsDebouncer: WebSocketDebouncer<{
  botId: string;
  data: Partial<HedgeBot>;
  paperContext?: boolean;
}> | null = null;

export const useHedgeComboBotsStore = create<HedgeComboBotsStoreState>()(
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
            bots: { ...state.bots, [bot._id]: bot },
            loadingById: { ...state.loadingById, [bot._id]: false },
            errorById: { ...state.errorById, [bot._id]: null },
          }));
        },
        updateBots: (bots: HedgeBot[], scope?: BotListScope) => {
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

        updateBot: (bot: HedgeBot) => {
          const existingBot = get().bots[bot._id];
          if (!existingBot) {
            logger.debug(
              `[HedgeComboBotsStore] Skipping update for non-existent bot ${bot._id}`
            );
            return;
          }
          if (isIncomingBotStale(existingBot, bot)) return;
          const incomingMs = bot.updated
            ? new Date(bot.updated).getTime()
            : undefined;
          const ms = Number.isNaN(incomingMs as number) ? undefined : incomingMs;
          if (consultBotTombstone(bot._id, ms) === 'reject') return;
          set((state) => ({
            bots: { ...state.bots, [bot._id]: bot },
            loadingById: { ...state.loadingById, [bot._id]: false },
            errorById: { ...state.errorById, [bot._id]: null },
          }));
        },

        updateBotFromWebSocket: (update) => {
          if (!wsDebouncer) {
            wsDebouncer = new WebSocketDebouncer(
              (updates) => get().applyBatchedWebSocketUpdates(updates),
              (update) => update.botId,
              50
            );
          }
          wsDebouncer.enqueue(update);
        },

        applyBatchedWebSocketUpdates: (updates) => {
          const state = get();
          const updatedBots = { ...state.bots };
          let hasChanges = false;

          updates.forEach(({ botId, data, paperContext }) => {
            const existingBot = updatedBots[botId];
            if (!existingBot) return;

            if (data.updated && existingBot.updated) {
              const wsTime = new Date(data.updated).getTime();
              const existingTime = new Date(existingBot.updated).getTime();
              if (wsTime < existingTime) {
                logger.debug(
                  `[HedgeComboBotsStore] Skipping stale WebSocket update for bot ${botId}`,
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
                `[HedgeComboBotsStore] Skipping cross-context WebSocket update for bot ${botId}`,
                { paperContext, existingPaperContext: existingBot.paperContext }
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

            updatedBots[botId] = {
              ...existingBot,
              ...data,
              ...(typeof paperContext === 'boolean' && { paperContext }),
              _id: botId,
            };
            hasChanges = true;
          });

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

        setLoading: (loading: boolean) => set({ loading }),

        setBotLoading: (botId: string, loading: boolean) => {
          set((state) => ({
            loadingById: { ...state.loadingById, [botId]: loading },
          }));
        },

        setError: (error: string | null) => set({ error, loading: false }),

        setBotError: (botId: string, error: string | null) => {
          set((state) => ({
            errorById: { ...state.errorById, [botId]: error },
            loadingById: { ...state.loadingById, [botId]: false },
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

        getBot: (botId: string) => get().bots[botId] || null,
        getAllBots: () => Object.values(get().bots),
        getBotsByStatus: (statuses: string[]) =>
          Object.values(get().bots).filter((bot) =>
            statuses.includes(bot.status)
          ),
        isLoading: () => get().loading,
        isBotLoading: (botId: string) => get().loadingById[botId] || false,
        getError: () => get().error,
        getBotError: (botId: string) => get().errorById[botId] || null,
        setHasHydrated: (state: boolean) => set({ _hasHydrated: state }),
      }),
      {
        name: 'hedge-combo-bots-store',
        storage: createQueuedIndexedDBStorage('hedge-combo-bots-store'),
        // One-time cache bust: drop stale persisted bots on upgrade.
        version: 2,
        migrate: () => ({ bots: {} }),
        partialize: (state) => ({ bots: state.bots }),
        merge: (persistedState, currentState) => ({
          ...currentState,
          ...(persistedState as Partial<HedgeComboBotsStoreState>),
          loading: false,
          loadingById: {},
          error: null,
          errorById: {},
        }),
        onRehydrateStorage: () => (_state, error) => {
          if (error) {
            logger.error('[HedgeComboBotsStore] Rehydration error:', error);
          }
          useHedgeComboBotsStore.getState().setHasHydrated(true);
        },
      }
    ),
    { name: 'hedge-combo-bots-store' }
  )
);
