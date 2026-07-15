import { useCallback, useMemo } from 'react';
import { useLiveUpdate } from '../contexts/LiveUpdateContext';
import { useBotStatsStore, useOrderStore, useDealStore } from '@/stores/live';
import type { CalculatedBotStats } from '../services/metrics/BotMetricsCalculator';
import type { DCADeals, OrderData } from '@/types';

interface UseLiveBotMetricsOptions {
  botId: string;
  enabled?: boolean;
  refetchInterval?: number;
}

interface UseLiveBotMetricsReturn {
  // Bot statistics
  stats: CalculatedBotStats | null;
  isLoading: boolean;
  error: string | null;

  // Orders
  orders: OrderData[];

  // Deals
  deals: DCADeals[];

  // Active deals only
  activeDeals: DCADeals[];

  // Closed deals only
  closedDeals: DCADeals[];

  // Actions
  clearStats: () => void;
  /* subscribeToBot: () => void;
  unsubscribeFromBot: () => void; */

  // Computed values
  totalProfit: number;
  totalProfitPercentage: number;
  activeOrderCount: number;
  totalDealCount: number;
  winRate: number;
}

/**
 * Hook for accessing live bot metrics and data
 * Provides real-time updates for bot statistics, orders, and deals
 */
export function useLiveBotMetrics(
  options: UseLiveBotMetricsOptions
): UseLiveBotMetricsReturn {
  const { botId /* enabled = true */ } = options;
  const {
    botStatsActions,
    /* webSocketManager, */
  } = useLiveUpdate();

  // Subscribe directly to the per-bot store slices so socket-driven writes
  // re-render this hook's consumers. The memoized LiveUpdateContext no longer
  // re-renders on store writes, so reading via its render-time getters would
  // leave these values frozen. Selecting the raw slice (whose identity changes
  // only when THIS bot's data changes) and deriving arrays with useMemo keeps
  // re-renders scoped to relevant writes instead of firing on every store
  // change (which a fresh-array selector would do).
  const stats = useBotStatsStore((s) => s.botStats[botId] ?? null);
  const isLoading = useBotStatsStore((s) => s.loading[botId] ?? false);
  const error = useBotStatsStore((s) => s.errors[botId] ?? null);

  const newOrdersObj = useOrderStore((s) => s.orders.new[botId]);
  const filledOrdersObj = useOrderStore((s) => s.orders.filled[botId]);
  const orders = useMemo<OrderData[]>(
    () => [
      ...Object.values(newOrdersObj ?? {}),
      ...Object.values(filledOrdersObj ?? {}),
    ],
    [newOrdersObj, filledOrdersObj]
  );

  const dealsObj = useDealStore((s) => s.deals[botId]);
  const deals = useMemo<DCADeals[]>(
    () => Object.values(dealsObj ?? {}),
    [dealsObj]
  );
  const activeDeals = useMemo<DCADeals[]>(
    () => deals.filter((d) => d.status === 'open' || d.status === 'start'),
    [deals]
  );
  const closedDeals = useMemo<DCADeals[]>(
    () => deals.filter((d) => d.status === 'closed'),
    [deals]
  );

  const clearStats = useCallback(() => {
    if (botId) {
      botStatsActions.clearBotStats(botId);
    }
  }, [botId, botStatsActions]);

  /* const subscribeToBot = useCallback(() => {
    if (enabled && botId) {
      webSocketManager.subscribeToBot(botId);
    }
  }, [enabled, botId, webSocketManager]);

  const unsubscribeFromBot = useCallback(() => {
    if (botId) {
      webSocketManager.unsubscribeFromBot(botId);
    }
  }, [botId, webSocketManager]); */

  // Computed values with memoization
  const computedValues = useMemo(() => {
    if (!stats) {
      return {
        totalProfit: 0,
        totalProfitPercentage: 0,
        activeOrderCount: 0,
        totalDealCount: 0,
        winRate: 0,
      };
    }

    const totalProfit = stats.numerical.profit.grossProfit.usd;
    const totalProfitPercentage = stats.numerical.profit.grossProfitPerc;
    const activeOrderCount = orders.filter(
      (order) => order.status === 'pending' || order.status === 'partial'
    ).length;
    const totalDealCount = deals.length;
    const winningDeals = closedDeals.filter(
      (deal) => deal.profit.total > 0
    ).length;
    const winRate =
      totalDealCount > 0 ? (winningDeals / totalDealCount) * 100 : 0;

    return {
      totalProfit,
      totalProfitPercentage,
      activeOrderCount,
      totalDealCount,
      winRate,
    };
  }, [stats, orders, deals, closedDeals]);

  return {
    // Data
    stats,
    isLoading,
    error,
    orders,
    deals,
    activeDeals,
    closedDeals,

    // Actions
    clearStats,
    /* subscribeToBot,
    unsubscribeFromBot, */

    // Computed values
    ...computedValues,
  };
}

/**
 * Hook for accessing live data for multiple bots
 * Note: This is a simplified version. For multiple bots, call useLiveBotMetrics
 * multiple times or create a custom hook that manages multiple bot IDs
 */
export function useLiveBotsMetrics(_botIds: string[]): {
  bots: Record<string, UseLiveBotMetricsReturn>;
  totalStats: {
    totalProfit: number;
    totalActiveOrders: number;
    totalDeals: number;
    averageWinRate: number;
  };
} {
  // For now, return empty - users should call useLiveBotMetrics individually
  // This can be enhanced later with a more complex implementation
  return {
    bots: {},
    totalStats: {
      totalProfit: 0,
      totalActiveOrders: 0,
      totalDeals: 0,
      averageWinRate: 0,
    },
  };
}
