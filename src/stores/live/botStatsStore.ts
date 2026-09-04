import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import logger from '../../lib/loggerInstance';
import type { CalculatedBotStats } from '../../services/metrics/BotMetricsCalculator';
import type { BotStatsUpdate } from '../../services/websocket/BotWebSocketManager';
import type { BotSymbolsStats } from '../../types';

interface BotStatsState {
  // Bot statistics by bot ID
  botStats: Record<string, CalculatedBotStats>;

  // Per-pair statistics by bot ID, from the same `bot stats update` frame.
  // Kept beside `botStats` because `CalculatedBotStats` has no slot for them.
  botSymbolStats: Record<string, BotSymbolsStats[]>;

  // Loading states
  loading: Record<string, boolean>;

  // Error states
  errors: Record<string, string | null>;

  // Actions
  updateBotStats: (botId: string, stats: CalculatedBotStats) => void;
  updateBotStatsFromWebSocket: (update: BotStatsUpdate) => void;
  setBotStatsLoading: (botId: string, loading: boolean) => void;
  setBotStatsError: (botId: string, error: string | null) => void;
  clearBotStats: (botId: string) => void;
  clearAllBotStats: () => void;

  // Selectors
  getBotStats: (botId: string) => CalculatedBotStats | null;
  getAllBotStats: () => Record<string, CalculatedBotStats>;
  isBotStatsLoading: (botId: string) => boolean;
  getBotStatsError: (botId: string) => string | null;
}

export const useBotStatsStore = create<BotStatsState>()(
  devtools(
    (set, get) => ({
      botStats: {},
      botSymbolStats: {},
      loading: {},
      errors: {},

      updateBotStats: (botId: string, stats: CalculatedBotStats) => {
        set((state) => ({
          botStats: {
            ...state.botStats,
            [botId]: stats,
          },
          loading: {
            ...state.loading,
            [botId]: false,
          },
          errors: {
            ...state.errors,
            [botId]: null,
          },
        }));
      },

      updateBotStatsFromWebSocket: (update: BotStatsUpdate) => {
        const { botId, data, symbolStats } = update;

        // Transform WebSocket data to CalculatedBotStats format
        const stats = data as unknown as CalculatedBotStats;

        logger.info(`💾 [BotStatsStore] Storing live stats for bot ${botId}:`, {
          hasProfit: !!stats.numerical?.profit,
          profitValue: stats.numerical?.profit?.grossProfit,
          hasUsage: !!stats.numerical?.usage,
          usageValue: stats.numerical?.usage?.maxActualUsage,
          hasChart: !!stats.chart,
          chartPoints: stats.chart?.length,
          timestamp: new Date().toISOString(),
        });

        set((state) => ({
          botStats: {
            ...state.botStats,
            [botId]: stats,
          },
          // main-app sends the WHOLE per-pair array on every tick, so a
          // non-empty one replaces what we hold. An absent/empty one means
          // "no per-pair sample in this frame" — not "forget the pairs".
          botSymbolStats:
            symbolStats && symbolStats.length > 0
              ? { ...state.botSymbolStats, [botId]: symbolStats }
              : state.botSymbolStats,
        }));
      },

      setBotStatsLoading: (botId: string, loading: boolean) => {
        set((state) => ({
          loading: {
            ...state.loading,
            [botId]: loading,
          },
        }));
      },

      setBotStatsError: (botId: string, error: string | null) => {
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

      clearBotStats: (botId: string) => {
        set((state) => {
          const { [botId]: _, ...remainingStats } = state.botStats;
          const { [botId]: ____, ...remainingSymbolStats } =
            state.botSymbolStats;
          const { [botId]: __, ...remainingLoading } = state.loading;
          const { [botId]: ___, ...remainingErrors } = state.errors;

          return {
            botStats: remainingStats,
            botSymbolStats: remainingSymbolStats,
            loading: remainingLoading,
            errors: remainingErrors,
          };
        });
      },

      clearAllBotStats: () => {
        set({
          botStats: {},
          botSymbolStats: {},
          loading: {},
          errors: {},
        });
      },

      getBotStats: (botId: string) => {
        return get().botStats[botId] || null;
      },

      getAllBotStats: () => {
        return get().botStats;
      },

      isBotStatsLoading: (botId: string) => {
        return get().loading[botId] || false;
      },

      getBotStatsError: (botId: string) => {
        return get().errors[botId] || null;
      },
    }),
    {
      name: 'bot-stats-store',
    }
  )
);
