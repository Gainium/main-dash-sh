import { dcaBotFragment } from '@/lib/api/GraphQLQueries-fragments';
import { useDcaBotsStore } from '@/stores/live';
import { useUIStore } from '@/stores/uiStore';
import { isBotActive } from '@/utils/botStatusUtils';
import { useEffect, useMemo } from 'react';
import { botQueries } from '../lib/api/GraphQLQueries-bot-queries';
import { logger } from '../lib/loggerInstance';
import type { BotStatus, DCABot } from '../types';
import { type DcaBotListResponse } from '../types/dcaBot';
import {
  computeBotListStats,
  emptyBotListStats,
  usageCurrentUsd,
  usageMaxUsd,
  type BotForStats,
  type BotListStats,
} from './useBotListStats';
import { useGraphQL } from './useGraphQL';
import { useShareContext } from './useShareContext';

export interface DcaBotsFilter {
  paperContext?: boolean;
  status?: BotStatus[];
  all?: boolean;
  terminal?: boolean;
}

export interface UseDcaBotsResult {
  data: DcaBotListResponse | null;
  bots: DCABot[];
  total: number;
  hasValidResponse: boolean;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

export interface DcaBotStatsSummary {
  closedTrades: number;
  profit: number;
  accumulatedProfit: { value: number };
  profitByDay: { value: number };
  statusCounts: Record<string, number>;
  activeBots: number;
  totalBots: number;
  activeDeals: number;
  profitableBots: number;
  successRate: number;
  bestBot: {
    name: string;
    symbol: string;
    profit: number;
  } | null;
  capitalMetrics: {
    deployed: number;
    available: number;
    total: number;
    utilization: number;
    avgPerBot: number;
  };
  exchangeDistribution: Record<string, { count: number; capital: number }>;
  exchangeCount: number;
  /** Unified shape consumed by BotListStatsBoxes. Single source of truth
   * for the 3-box KPI strip across all bot list pages. */
  botListStats: BotListStats;
}

export const emptyDcaBotStatsSummary: DcaBotStatsSummary = {
  closedTrades: 0,
  profit: 0,
  accumulatedProfit: { value: 0 },
  profitByDay: { value: 0 },
  statusCounts: {},
  activeBots: 0,
  totalBots: 0,
  activeDeals: 0,
  profitableBots: 0,
  successRate: 0,
  bestBot: null,
  capitalMetrics: {
    deployed: 0,
    available: 0,
    total: 0,
    utilization: 0,
    avgPerBot: 0,
  },
  exchangeDistribution: {},
  exchangeCount: 0,
  botListStats: { ...emptyBotListStats },
};

/** Map a DCA bot into the unified BotForStats shape. */
function dcaBotToBotForStats(bot: DCABot): BotForStats {
  return {
    status: bot.status,
    totalProfitUsd: bot.profit?.totalUsd || 0,
    todayProfitUsd: bot.profitToday?.totalTodayUsd || 0,
    usedQuote: usageCurrentUsd(bot.usage),
    requiredQuote: usageMaxUsd(bot.usage),
    activeDeals: bot.dealsInBot?.active || 0,
  };
}

export function useDcaBots(
  filter?: DcaBotsFilter,
  enabled?: boolean
): UseDcaBotsResult {
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
  const botsRecord = useDcaBotsStore((state) => state.bots);
  const hasHydrated = useDcaBotsStore((state) => state._hasHydrated);

  // Convert Record to array once (memoized by botsRecord reference)
  const botsFromStore = useMemo(() => Object.values(botsRecord), [botsRecord]);

  // Prepare input for GraphQL query based on filter
  const input: { status: BotStatus[] } = useMemo(
    () => ({
      status: filter?.status?.length
        ? filter.status
        : ['open', 'range', 'monitoring', 'error', 'closed'],
      // Include all active statuses by default (archived fetched separately)
      // Note: terminal bots are excluded client-side, paperContext filtering handled by useGraphQL
    }),
    [filter]
  );

  // Share-mode visitors must never trigger the visitor's bot list query —
  // the share URL renders ONLY the shared bot. AND it into `enabled` so
  // the gating composes with whatever the caller already passed.
  const { isDemo } = useShareContext();
  const options = useMemo(
    () => ({
      paperContext:
        typeof filter?.paperContext === 'boolean'
          ? filter.paperContext
          : undefined,
      enabled: isDemo ? false : enabled,
    }),
    [filter?.paperContext, enabled, isDemo]
  );

  // 2. Keep React Query for background sync
  const queryResult = useGraphQL<DcaBotListResponse>(
    'dcaBotList',
    botQueries.dcaBotList(input, dcaBotFragment),
    options
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
      useDcaBotsStore.getState().updateBots(normalizedBots);
    }
  }, [currentPaperContext, queryResult.data]);

  // If there's an error, log it
  if (queryResult.error) {
    const errorMessage = queryResult.error.message;
    console.error('[useDcaBots] Query error:', errorMessage);
    logger.error('[useDcaBots] Query error:', errorMessage);
  }

  // Apply client-side filtering to exclude terminal bots
  const filteredBots = useMemo(
    () =>
      botsFromStore.filter((bot: DCABot) => {
        if (bot.paperContext !== currentPaperContext) {
          return false;
        }

        // When terminal === true, only include terminal/smart-trade bots
        if (filter?.terminal === true && bot.settings?.type !== 'terminal') {
          return false;
        }
        // When terminal === false, exclude terminal/smart-trade bots
        if (filter?.terminal === false && bot.settings?.type === 'terminal') {
          return false;
        }

        return true;
      }),
    [botsFromStore, currentPaperContext, filter]
  );

  // 3. Only show loading on initial load (when store is empty) OR while IDB
  // is still rehydrating — otherwise the table flashes empty on hard refresh
  // / HMR before cached bots arrive from IndexedDB.
  const isInitialLoad =
    !hasHydrated || (!botsFromStore.length && queryResult.isLoading);

  // Minimal logging - only summary info
  logger.debug('[useDcaBots] Summary:', {
    storeCount: botsFromStore.length,
    filteredCount: filteredBots.length,
  });

  // 4. Return store data (real-time via WebSocket). In share mode, force
  //    an empty result regardless of cached store contents — the visitor's
  //    persisted bot list from a prior logged-in session must not leak
  //    into share-URL renders.
  const result = useMemo(
    () => ({
      data: isDemo ? null : queryResult.data?.data || null,
      bots: isDemo ? [] : filteredBots, // Always from store (real-time)
      total: isDemo ? 0 : queryResult.data?.total || filteredBots.length,
      hasValidResponse: isDemo
        ? true
        : queryResult.data?.status === 'OK' || botsFromStore.length > 0,
      isLoading: isDemo ? false : isInitialLoad,
      isError: isDemo ? false : queryResult.isError,
      error: isDemo ? null : queryResult.error,
      refetch: queryResult.refetch,
    }),
    [
      isDemo,
      queryResult.data,
      filteredBots,
      botsFromStore.length,
      isInitialLoad,
      queryResult.isError,
      queryResult.error,
      queryResult.refetch,
    ]
  );
  return result;
}

export function computeDcaBotStatsSummary(bots: DCABot[]): DcaBotStatsSummary {
  if (!bots.length) {
    logger.debug(
      '[useDcaBotStats] Valid response but no bots found (empty state)'
    );
    return { ...emptyDcaBotStatsSummary };
  }

  const statusCounts = bots.reduce(
    (acc: Record<string, number>, bot: DCABot) => {
      acc[bot.status] = (acc[bot.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const totalProfit = bots.reduce(
    (sum: number, bot: DCABot) => sum + (bot.profit?.totalUsd || 0),
    0
  );
  const totalDeals = bots.reduce(
    (sum: number, bot: DCABot) => sum + (bot.dealsInBot?.all || 0),
    0
  );
  const activeDeals = bots.reduce(
    (sum: number, bot: DCABot) => sum + (bot.dealsInBot?.active || 0),
    0
  );

  const accumulatedProfit = bots
    .filter((bot: DCABot) => (bot.profit?.totalUsd || 0) > 0)
    .reduce((sum: number, bot: DCABot) => sum + (bot.profit?.totalUsd || 0), 0);

  const validBots = bots.filter((bot) => bot.created);
  const profitByDay = (() => {
    if (!validBots.length) return 0;

    const oldestBotDate = Math.min(
      ...validBots.map((bot) => new Date(bot.created).getTime())
    );

    const now = Date.now();
    const daysSinceOldest = Math.max(
      1,
      (now - oldestBotDate) / (1000 * 60 * 60 * 24)
    );

    return totalProfit / daysSinceOldest;
  })();

  /* const botStatuses = bots.map((bot) => ({
    id: bot._id,
    status: bot.status,
    name: bot.settings?.name,
  })); */
  /* logger.info('[useDcaBotStats] Bot statuses:', botStatuses);
   */
  const activeBots = bots.filter((bot) => isBotActive(bot.status)).length;
  const profitableBots = bots.filter(
    (bot) => (bot.profit?.totalUsd || 0) > 0
  ).length;

  const successRate =
    bots.length > 0 ? (profitableBots / bots.length) * 100 : 0;

  logger.info('[useDcaBotStats] Calculated metrics:', {
    totalBots: bots.length,
    activeBots,
    profitableBots,
    successRate,
    totalProfit,
    totalDeals,
    activeDeals,
  });

  const bestBot = bots.reduce((best, current) => {
    const currentProfit = current.profit?.totalUsd || 0;
    const bestProfit = best?.profit?.totalUsd || 0;
    return currentProfit > bestProfit ? current : best;
  }, bots[0]);

  let totalUsed = 0;
  let totalRequired = 0;

  bots.forEach((bot) => {
    if (bot.assets?.used?.quote) {
      totalUsed += bot.assets.used.quote.reduce(
        (sum, asset) => sum + (asset.value || 0),
        0
      );
    }

    if (bot.assets?.required?.quote) {
      totalRequired += bot.assets.required.quote.reduce(
        (sum, asset) => sum + (asset.value || 0),
        0
      );
    }
  });

  const utilization = totalRequired > 0 ? (totalUsed / totalRequired) * 100 : 0;
  const available = Math.max(0, totalRequired - totalUsed);

  const capitalMetrics = {
    deployed: totalUsed,
    available,
    total: totalRequired,
    utilization,
    avgPerBot: bots.length > 0 ? totalUsed / bots.length : 0,
  };

  const exchangeDistribution = bots.reduce(
    (acc: Record<string, { count: number; capital: number }>, bot) => {
      const exchange = bot.exchange || 'Unknown';
      if (!acc[exchange]) {
        acc[exchange] = { count: 0, capital: 0 };
      }
      acc[exchange].count += 1;

      if (bot.assets?.used?.quote) {
        acc[exchange].capital += bot.assets.used.quote.reduce(
          (sum, asset) => sum + (asset.value || 0),
          0
        );
      }

      return acc;
    },
    {}
  );

  const exchangeCount = Object.keys(exchangeDistribution).length;

  const botListStats = computeBotListStats(bots.map(dcaBotToBotForStats));

  return {
    closedTrades: totalDeals,
    profit: totalProfit,
    accumulatedProfit: { value: accumulatedProfit },
    profitByDay: { value: profitByDay },
    statusCounts,
    activeBots,
    totalBots: bots.length,
    activeDeals,
    profitableBots,
    successRate,
    bestBot: bestBot
      ? {
          name: bestBot.settings?.name || 'Unknown',
          symbol: bestBot.symbol?.[0]?.value?.symbol || 'Unknown',
          profit: bestBot.profit?.totalUsd || 0,
        }
      : null,
    capitalMetrics,
    exchangeDistribution,
    exchangeCount,
    botListStats,
  };
}

export function useDcaBotStats(filter?: DcaBotsFilter) {
  const { bots, isLoading, isError, hasValidResponse } = useDcaBots(filter);

  if (isLoading || isError || !hasValidResponse) {
    return {
      ...emptyDcaBotStatsSummary,
      isLoading,
      isError,
      hasValidResponse,
    };
  }

  const summary = computeDcaBotStatsSummary(bots);

  return {
    ...summary,
    isLoading: false,
    isError: false,
    hasValidResponse: true,
  };
}
