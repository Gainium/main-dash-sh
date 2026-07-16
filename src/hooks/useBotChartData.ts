import { botQueries } from '../lib/api/GraphQLQueries-bot-queries';
import { LONG_READ_TIMEOUT_MS } from '../lib/api';
import { logger } from '../lib/loggerInstance';
import type { BotTypesEnum } from '../types';
import { useGraphQL } from './useGraphQL';
import { useShareContext } from './useShareContext';

export interface BotChartDataPoint {
  value: number;
  time: number;
}

export interface BotChartDataResponse {
  status: 'OK' | 'NOTOK';
  reason: string | null;
  data: BotChartDataPoint[];
}

export interface UseBotChartDataOptions {
  botId: string;
  botType: BotTypesEnum;
  enabled?: boolean; // Allow conditional fetching
}

/**
 * Hook to fetch real historical chart data for a single bot
 * This fetches actual trading data, not the mock data from the bot list
 *
 * Note: Due to React's Rules of Hooks, this cannot be called conditionally or in loops.
 * For fetching multiple bots' data, use the manual fetch approach in useEffect instead.
 */
export function useBotChartData({
  botId,
  botType,
  enabled = true,
}: UseBotChartDataOptions) {
  const { shareId } = useShareContext();
  const { query, variables } = botQueries.getBotProfitChartData({
    id: botId,
    type: botType,
    ...(shareId ? { shareId } : {}),
  });

  const queryResult = useGraphQL<BotChartDataResponse>(
    `getBotProfitChartData-${botId}`,
    {
      query,
      variables,
    },
    {
      enabled, // Only fetch when enabled
      staleTime: 5 * 60 * 1000, // Consider data stale after 5 minutes
      shareId,
      // Full-lifetime profit series (server-side aggregation keyed only by
      // {id,type}); an old bot's history can legitimately run long, so use the
      // generous long-read cap instead of the interactive default.
      requestTimeoutMs: LONG_READ_TIMEOUT_MS,
    }
  );

  const chartData: BotChartDataPoint[] =
    queryResult.data?.status === 'OK' && Array.isArray(queryResult.data.data)
      ? queryResult.data.data
      : [];

  if (queryResult.error && enabled) {
    logger.error(
      `[useBotChartData] Error fetching chart data for bot ${botId}:`,
      {
        error: queryResult.error.message,
        botType,
      }
    );
  }

  return {
    data: chartData,
    isLoading: queryResult.isLoading,
    isError: queryResult.isError,
    error: queryResult.error,
    refetch: queryResult.refetch,
  };
}
