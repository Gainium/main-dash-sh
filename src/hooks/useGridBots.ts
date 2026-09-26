import { botFragment } from '@/lib/api/GraphQLQueries-fragments';
import { useMemo, useEffect } from 'react';
import { botQueries } from '../lib/api/GraphQLQueries-bot-queries';
import { LONG_READ_TIMEOUT_MS } from '../lib/api';
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
import {
  BOT_LIST_WINDOW,
  CANONICAL_GRID_STATUSES,
  isPartialList,
} from '../lib/botList/botListWindow';
import { botListScope } from '../stores/live/botListMerge';
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

  // Status subset this caller wants; served client-side from the canonical
  // list (see useDcaBots for why every store-sharing caller asks the same).
  const requestedStatuses = useMemo(
    () =>
      filter?.status?.length && !filter.status.includes('archive')
        ? filter.status
        : null,
    [filter?.status]
  );

  // The archived list must NOT share the global active-bots store (see the
  // same note in useDcaBots): it reads its OWN React Query result.
  const isArchivedQuery =
    !!filter?.status?.length && filter.status.includes('archive');

  // A caller pinned to the NON-selected trading context reads its own result
  // too (see useDcaBots).
  const isForeignContextQuery =
    typeof filter?.paperContext === 'boolean' &&
    filter.paperContext !== !isLiveTrading;

  // Reads and writes its OWN React Query result instead of the shared store.
  const isIsolatedQuery = isArchivedQuery || isForeignContextQuery;

  // One canonical request per context (deduped by React Query), with an
  // explicit page so the server returns a real `total` and a capped response
  // is detectable instead of silently truncated at 500.
  const input = useMemo(
    () => ({
      status: isArchivedQuery
        ? (filter?.status as BotStatus[])
        : isForeignContextQuery && requestedStatuses
          ? requestedStatuses
          : CANONICAL_GRID_STATUSES,
      dataGridInput: { page: 0, pageSize: BOT_LIST_WINDOW },
    }),
    [isArchivedQuery, isForeignContextQuery, requestedStatuses, filter?.status]
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
      // Archived lists come from cold store (ClickHouse) → generous long-read
      // cap; the active variant keeps the interactive default.
      requestTimeoutMs: isArchivedQuery ? LONG_READ_TIMEOUT_MS : undefined,
    }
  );

  // Update store when query succeeds (React Query v5 pattern). Skip for the
  // isolated queries so they never clobber / are clobbered by the active store.
  useEffect(() => {
    if (isIsolatedQuery) return;
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
      useGridBotsStore
        .getState()
        .updateBots(
          normalizedBots,
          botListScope(
            currentPaperContext,
            input.status,
            bots.length,
            queryResult.data.total
          )
        );
    }
    // `isIsolatedQuery` MUST stay in the deps: it flips when the global trading
    // mode settles after cold start, and a pinned query that becomes native
    // would otherwise never write its bots to the store.
  }, [currentPaperContext, queryResult.data, isIsolatedQuery, input.status]);

  // Apply client-side filtering if needed
  const filteredBots = useMemo(
    () =>
      botsFromStore.filter((bot: GridBot) => {
        if (bot.paperContext !== currentPaperContext) return false;
        if (requestedStatuses && !requestedStatuses.includes(bot.status)) {
          return false;
        }
        return true;
      }),
    [botsFromStore, currentPaperContext, requestedStatuses]
  );

  // Isolated list (archived, or pinned to the non-selected trading context):
  // derive bots from THIS query's own result rather than the shared store.
  const isolatedBots = useMemo(() => {
    if (!isIsolatedQuery) return null;
    const data = queryResult.data?.data;
    const arr = Array.isArray(data) ? data : [];
    return arr
      .map((bot) => ({
        ...bot,
        paperContext:
          typeof bot.paperContext === 'boolean'
            ? bot.paperContext
            : currentPaperContext,
      }))
      .filter((bot: GridBot) => bot.paperContext === currentPaperContext);
  }, [isIsolatedQuery, queryResult.data, currentPaperContext]);

  // 3. Only show loading on initial load (when store is empty) OR while IDB
  // is still rehydrating — otherwise the table flashes empty on hard refresh
  // / HMR before cached bots arrive from IndexedDB.
  const isInitialLoad =
    !hasHydrated || (!botsFromStore.length && queryResult.isLoading);

  // 4. Return store data (real-time via WebSocket). In share mode, force
  //    an empty result so cached bots from a prior logged-in session
  //    never leak into share-URL renders.
  const responseRows = Array.isArray(queryResult.data?.data)
    ? queryResult.data.data.length
    : 0;
  const serverTotal = queryResult.data?.total;
  const partial = isPartialList(responseRows, serverTotal);

  const result = useMemo(() => {
    if (isIsolatedQuery && !isDemo) {
      const bots = isolatedBots ?? [];
      return {
        ...queryResult,
        data: queryResult.data?.data || null,
        bots,
        total: serverTotal || bots.length,
        isPartial: partial,
        loadedCount: responseRows,
        isLoading: queryResult.isLoading && !bots.length,
        isError: queryResult.isError,
        error: queryResult.error,
      };
    }
    return {
      ...queryResult,
      data: isDemo ? null : queryResult.data?.data || null,
      bots: isDemo ? [] : filteredBots,
      total: isDemo
        ? 0
        : partial
          ? (serverTotal as number)
          : filteredBots.length,
      isPartial: isDemo ? false : partial,
      loadedCount: isDemo ? 0 : responseRows,
      isLoading: isDemo ? false : isInitialLoad,
      isError: isDemo ? false : queryResult.isError,
      error: isDemo ? null : queryResult.error,
    };
  }, [isIsolatedQuery, isolatedBots, isDemo, queryResult, filteredBots, isInitialLoad, serverTotal, partial, responseRows]);
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
