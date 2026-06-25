import { comboBotFragment } from '@/lib/api/GraphQLQueries-fragments';
import { useMemo, useEffect } from 'react';
import { botQueries } from '../lib/api/GraphQLQueries-bot-queries';
import { logger } from '../lib/loggerInstance';
import type { BotStatus } from '../types';
import type { ComboBot as StoreBotType } from '@/types';
import { type ComboBotListResponse } from '../types/comboBot';
import {
  computeBotListStats,
  emptyBotListStats,
  usageCurrentUsd,
  usageMaxUsd,
  type BotForStats,
  type BotListStats,
} from './useBotListStats';
import { useGraphQL } from './useGraphQL';
import { useComboBotsStore } from '@/stores/live';
import { useShareContext } from './useShareContext';
import { useUIStore } from '@/stores/uiStore';

/** Map a Combo bot into the unified BotForStats shape. Combo shares the
 * DCA quote-array shape on `assets.used/required.quote`. */
function comboBotToBotForStats(bot: StoreBotType): BotForStats {
  return {
    status: bot.status,
    totalProfitUsd: bot.profit?.totalUsd || 0,
    todayProfitUsd: bot.profitToday?.totalTodayUsd || 0,
    usedQuote: usageCurrentUsd(bot.usage),
    requiredQuote: usageMaxUsd(bot.usage),
    activeDeals: bot.dealsInBot?.active || 0,
  };
}

export interface ComboBotsFilter {
  terminal?: boolean;
  paperContext?: boolean;
  status?: BotStatus[];
  all?: boolean;
}

export function useComboBots(filter?: ComboBotsFilter, enabled?: boolean) {
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);
  const currentPaperContext = useMemo(
    () =>
      typeof filter?.paperContext === 'boolean'
        ? filter.paperContext
        : !isLiveTrading,
    [filter?.paperContext, isLiveTrading]
  );

  // 1. Read from Zustand store (instant, no loading state)
  // Select the Record directly to avoid creating new array reference on every render
  const botsRecord = useComboBotsStore((state) => state.bots);
  const hasHydrated = useComboBotsStore((state) => state._hasHydrated);
  // Convert Record to array once (memoized by botsRecord reference)
  const botsFromStore = useMemo(() => Object.values(botsRecord), [botsRecord]);

  // Build GraphQL input based on filter
  const input: {
    status?: BotStatus[];
  } = useMemo(() => {
    const input: {
      status?: BotStatus[];
    } = {};
    if (filter?.status?.length) {
      input.status = filter.status;
    } else {
      // Default status filter for active bots (archived fetched separately)
      input.status = ['open', 'range', 'monitoring', 'error', 'closed'];
    }
    return input;
  }, [filter?.status]);

  // Share-mode visitors must not fetch the visitor's combo bot list — the
  // share URL renders ONLY the shared bot.
  const { isDemo } = useShareContext();

  // 2. Keep React Query for background sync
  const queryResult = useGraphQL<ComboBotListResponse>(
    'comboBotList',
    botQueries.comboBotList(input, comboBotFragment),
    {
      paperContext: filter?.paperContext,
      enabled: isDemo ? false : enabled,
    }
  );

  // Update store when query succeeds (React Query v5 pattern)
  useEffect(() => {
    if (queryResult.data?.status === 'OK' && queryResult.data.data) {
      const bots = Array.isArray(queryResult.data.data)
        ? queryResult.data.data
        : [];
      const normalizedBots = bots.map((bot) => ({
        ...bot,
        paperContext:
          typeof bot.paperContext === 'boolean'
            ? bot.paperContext
            : currentPaperContext,
      }));
      useComboBotsStore.getState().updateBots(normalizedBots);
    }
  }, [currentPaperContext, queryResult.data]);

  // Additional debug logging
  if (import.meta.env.DEV) {
    logger.debug('[useComboBots] Bots array length:', botsFromStore.length);

    // Debug first bot's unrealized profit
    if (botsFromStore.length > 0) {
      logger.debug('[useComboBots] First bot unrealized profit check:', {
        botId: botsFromStore[0]._id,
        rawBotData: botsFromStore[0],
      });
    }
  }

  // Apply client-side filtering to exclude terminal bots if needed
  const filteredBots = useMemo(
    () =>
      botsFromStore.filter((bot: StoreBotType) => {
        if (bot.paperContext !== currentPaperContext) {
          return false;
        }

        // Exclude terminal bots if filter.terminal is false
        if (filter?.terminal === false && bot.settings?.type === 'terminal') {
          if (import.meta.env.DEV) {
            logger.debug('[useComboBots] Filtering out terminal bot:', {
              botId: bot._id,
              type: bot.settings?.type,
            });
          }
          return false;
        }

        return true;
      }),
    [botsFromStore, currentPaperContext, filter?.terminal]
  );

  // 3. Only show loading on initial load (when store is empty) OR while IDB
  // is still rehydrating — otherwise the table flashes empty on hard refresh
  // / HMR before cached bots arrive from IndexedDB.
  const isInitialLoad =
    !hasHydrated || (!botsFromStore.length && queryResult.isLoading);

  // 4. Return store data (real-time via WebSocket). In share mode, return
  //    an empty result regardless of cached store contents so a
  //    previously-logged-in visitor never sees their own bots.
  const result = useMemo(
    () => ({
      ...queryResult,
      data: isDemo ? null : queryResult.data?.data || null,
      bots: isDemo ? [] : filteredBots, // Always from store (real-time)
      total: isDemo ? 0 : queryResult.data?.total || filteredBots.length,
      isLoading: isDemo ? false : isInitialLoad,
      isError: isDemo ? false : queryResult.isError,
      error: isDemo ? null : queryResult.error,
    }),
    [isDemo, queryResult, filteredBots, isInitialLoad]
  );

  return result;
}

export interface ComboBotStatsResult {
  /** Total deals across bots (`dealsInBot.all`) — historical metric. */
  totalDeals: number;
  statusCounts: Record<string, number>;
  /** Unified shape consumed by BotListStatsBoxes. */
  botListStats: BotListStats;
  isLoading: boolean;
  isError: boolean;
}

export function useComboBotStats(filter?: ComboBotsFilter): ComboBotStatsResult {
  const { bots, isLoading, isError } = useComboBots(filter);

  if (isLoading || isError || !bots.length) {
    return {
      totalDeals: 0,
      statusCounts: {},
      botListStats: { ...emptyBotListStats },
      isLoading,
      isError,
    };
  }

  const statusCounts = bots.reduce(
    (acc: Record<string, number>, bot: StoreBotType) => {
      acc[bot.status] = (acc[bot.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const totalDeals = bots.reduce(
    (sum: number, bot: StoreBotType) => sum + (bot.dealsInBot?.all || 0),
    0
  );

  const botListStats = computeBotListStats(bots.map(comboBotToBotForStats));

  if (import.meta.env.DEV) {
    logger.debug('[useComboBotStats] Statistics calculated:', {
      totalBots: bots.length,
      totalDeals,
      statusCounts,
      ...botListStats,
    });
  }

  return {
    totalDeals,
    statusCounts,
    botListStats,
    isLoading,
    isError,
  };
}
