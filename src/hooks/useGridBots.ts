import { botFragment } from '@/lib/api/GraphQLQueries-fragments';
import { useMemo, useEffect } from 'react';
import { botQueries } from '../lib/api/GraphQLQueries-bot-queries';
import { logger } from '../lib/loggerInstance';
import type { BotStatus } from '../types';
import { type GridBot, type GridBotListResponse } from '../types/gridBot';
import {
  computeBotListStats,
  emptyBotListStats,
  type BotForStats,
  type BotListStats,
} from './useBotListStats';
import { useGraphQL } from './useGraphQL';
import { useShareContext } from './useShareContext';
import { useGridBotsStore } from '@/stores/live';
import { useUIStore } from '@/stores/uiStore';

/** Map a Grid bot into the unified BotForStats shape. Grid uses scalar
 * `assets.used.quote` (not the {key,value}[] shape DCA uses) and has no
 * `dealsInBot` — active "deals" are surfaced on the page as "active bots"
 * instead. Unlike DCA/Combo, grid's `assets.used.quote` already reflects the
 * live used capital (grid has no separate `usage` block), so it stays the
 * basis for capital deployed. */
function gridBotToBotForStats(bot: GridBot): BotForStats {
  return {
    status: bot.status,
    totalProfitUsd: bot.profit?.totalUsd || 0,
    todayProfitUsd: bot.profitToday?.totalTodayUsd || 0,
    usedQuote: bot.assets?.used?.quote || 0,
    requiredQuote: bot.assets?.required?.quote || 0,
    activeDeals: 0,
  };
}

export interface GridBotsFilter {
  status?: BotStatus[];
  paperContext?: boolean;
}

export function useGridBots(filter?: GridBotsFilter, enabled?: boolean) {
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
  const botsRecord = useGridBotsStore((state) => state.bots);
  const hasHydrated = useGridBotsStore((state) => state._hasHydrated);

  // Convert Record to array once (memoized by botsRecord reference)
  const botsFromStore = useMemo(() => Object.values(botsRecord), [botsRecord]);

  // Prepare input for GraphQL query based on filter, similar to DCA bots
  const input: { status: BotStatus[] } = useMemo(
    () => ({
      status: filter?.status?.length
        ? filter.status
        : ['error', 'open', 'range', 'monitoring', 'closed'],
    }),
    [filter?.status]
  );

  // Share-mode visitors must not fetch the visitor's grid bot list.
  const { isDemo } = useShareContext();

  // 2. Keep React Query for background sync
  const queryResult = useGraphQL<GridBotListResponse>(
    'botList',
    botQueries.botList(input, botFragment),
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
      useGridBotsStore.getState().updateBots(normalizedBots);
    }
  }, [currentPaperContext, queryResult.data]);

  // Apply client-side filtering if needed
  const filteredBots = useMemo(
    () =>
      botsFromStore.filter((_bot: GridBot) => {
        return _bot.paperContext === currentPaperContext;
      }),
    [botsFromStore, currentPaperContext]
  );

  // 3. Only show loading on initial load (when store is empty) OR while IDB
  // is still rehydrating — otherwise the table flashes empty on hard refresh
  // / HMR before cached bots arrive from IndexedDB.
  const isInitialLoad =
    !hasHydrated || (!botsFromStore.length && queryResult.isLoading);

  // 4. Return store data (real-time via WebSocket). In share mode, force
  //    an empty result so cached bots from a prior logged-in session
  //    never leak into share-URL renders.
  const result = useMemo(
    () => ({
      ...queryResult,
      data: isDemo ? null : queryResult.data?.data || null,
      bots: isDemo ? [] : filteredBots,
      total: isDemo ? 0 : queryResult.data?.total || filteredBots.length,
      isLoading: isDemo ? false : isInitialLoad,
      isError: isDemo ? false : queryResult.isError,
      error: isDemo ? null : queryResult.error,
    }),
    [isDemo, queryResult, filteredBots, isInitialLoad]
  );
  return result;
}

export interface GridBotStatsResult {
  statusCounts: Record<string, number>;
  /** Unified shape consumed by BotListStatsBoxes. */
  botListStats: BotListStats;
  isLoading: boolean;
  isError: boolean;
}

export function useGridBotStats(filter?: GridBotsFilter): GridBotStatsResult {
  const { bots, isLoading, isError } = useGridBots(filter);

  if (isLoading || isError || !bots.length) {
    return {
      statusCounts: {},
      botListStats: { ...emptyBotListStats },
      isLoading,
      isError,
    };
  }

  const statusCounts = bots.reduce(
    (acc: Record<string, number>, bot: GridBot) => {
      acc[bot.status] = (acc[bot.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const botListStats = computeBotListStats(bots.map(gridBotToBotForStats));

  if (import.meta.env.DEV) {
    logger.debug('[useGridBotStats] Statistics calculated:', {
      statusCounts,
      totalBots: bots.length,
      ...botListStats,
    });
  }

  return {
    statusCounts,
    botListStats,
    isLoading,
    isError,
  };
}
