import { useMemo } from 'react';
import { botQueries } from '../lib/api/GraphQLQueries-bot-queries';
import { LONG_READ_TIMEOUT_MS } from '../lib/api';
import type { ReturnResult } from '../lib/api/types';
import { logger } from '../lib/loggerInstance';
import { useGraphQL } from './useGraphQL';
import { useShareContext } from './useShareContext';
import { BotTypesEnum } from '../types';

export interface BotProfitDataPoint {
  value: number;
  time: number;
}

export type BotProfitChartData = BotProfitDataPoint[];

export interface UseBotProfitChartDataResult {
  data: ReturnResult<BotProfitChartData> | null;
  profitData: BotProfitDataPoint[];
  hasValidResponse: boolean;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

export function useBotProfitChartData(
  botId: string,
  botType: BotTypesEnum = BotTypesEnum.dca
): UseBotProfitChartDataResult {
  const { shareId } = useShareContext();
  const input = {
    id: botId,
    type: botType,
    ...(shareId ? { shareId } : {}),
  };

  // Get the query and variables from botQueries
  const { query, variables } = botQueries.getBotProfitChartData(input);

  // Use the GraphQL hook with proper caching
  const queryResult = useGraphQL<BotProfitChartData>(
    'getBotProfitChartData',
    {
      query,
      variables,
    },
    // Full-lifetime profit series; use the generous long-read cap (see
    // useBotChartData) rather than the interactive default.
    { shareId, requestTimeoutMs: LONG_READ_TIMEOUT_MS }
  );

  // Process the response data
  const processedData = useMemo(() => {
    const { data, isLoading, isError } = queryResult;

    if (isLoading || isError || !data) {
      return { profitData: [], hasValidResponse: false };
    }

    // Check if we have a valid response
    const hasValidResponse = data.status === 'OK';

    logger.info('[useBotProfitChartData] Raw response data:', {
      botId,
      botType,
      status: data.status,
      reason: data.reason,
      dataLength: Array.isArray(data.data) ? data.data.length : 'not array',
      dataType: typeof data.data,
      firstDataPoint:
        Array.isArray(data.data) && data.data.length > 0
          ? data.data[0]
          : 'none',
    });

    if (!hasValidResponse) {
      logger.warn(
        '[useBotProfitChartData] Invalid response or no profit data:',
        {
          botId,
          botType,
          status: data.status,
          reason: data.reason,
        }
      );

      return {
        profitData: [],
        hasValidResponse: false,
      };
    }

    // Extract profit data from the correct structure - it's directly an array
    const profitData = Array.isArray(data.data) ? data.data : [];

    logger.info(
      '[useBotProfitChartData] Successfully fetched bot profit data:',
      {
        botId,
        botType,
        dataPointsCount: profitData.length,
      }
    );

    return { profitData, hasValidResponse: true };
  }, [queryResult, botId, botType]);

  return {
    data: queryResult.data || null,
    profitData: processedData.profitData,
    hasValidResponse: processedData.hasValidResponse,
    isLoading: queryResult.isLoading,
    isError: queryResult.isError,
    error: queryResult.error,
    refetch: queryResult.refetch,
  };
}

// Helper functions for processing time-series data
export const groupProfitDataByPeriod = (
  data: BotProfitDataPoint[],
  period: 'daily' | 'weekly' | 'monthly'
): {
  [key: string]: { totalProfit: number; count: number; avgProfit: number };
} => {
  const grouped: {
    [key: string]: { totalProfit: number; count: number; avgProfit: number };
  } = {};

  data.forEach((point) => {
    const date = new Date(point.time);
    let key: string;

    switch (period) {
      case 'daily':
        key = date.toISOString().split('T')[0]; // YYYY-MM-DD
        break;
      case 'weekly': {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
        key = weekStart.toISOString().split('T')[0];
        break;
      }
      case 'monthly':
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
        break;
      default:
        key = date.toISOString().split('T')[0];
    }

    if (!grouped[key]) {
      grouped[key] = { totalProfit: 0, count: 0, avgProfit: 0 };
    }

    grouped[key].totalProfit += point.value;
    grouped[key].count += 1;
    grouped[key].avgProfit = grouped[key].totalProfit / grouped[key].count;
  });

  return grouped;
};

export const calculateProfitMetrics = (data: BotProfitDataPoint[]) => {
  if (data.length === 0) {
    return {
      totalProfit: 0,
      avgDailyProfit: 0,
      avgWeeklyProfit: 0,
      avgMonthlyProfit: 0,
      bestDay: 0,
      worstDay: 0,
      profitableDays: 0,
      totalDays: 0,
    };
  }

  const dailyData = groupProfitDataByPeriod(data, 'daily');
  const weeklyData = groupProfitDataByPeriod(data, 'weekly');
  const monthlyData = groupProfitDataByPeriod(data, 'monthly');

  const dailyProfits = Object.values(dailyData).map((d) => d.totalProfit);
  const weeklyProfits = Object.values(weeklyData).map((d) => d.totalProfit);
  const monthlyProfits = Object.values(monthlyData).map((d) => d.totalProfit);

  return {
    totalProfit: data.reduce((sum, point) => sum + point.value, 0),
    avgDailyProfit:
      dailyProfits.length > 0
        ? dailyProfits.reduce((sum, p) => sum + p, 0) / dailyProfits.length
        : 0,
    avgWeeklyProfit:
      weeklyProfits.length > 0
        ? weeklyProfits.reduce((sum, p) => sum + p, 0) / weeklyProfits.length
        : 0,
    avgMonthlyProfit:
      monthlyProfits.length > 0
        ? monthlyProfits.reduce((sum, p) => sum + p, 0) / monthlyProfits.length
        : 0,
    bestDay: dailyProfits.length > 0 ? Math.max(...dailyProfits) : 0,
    worstDay: dailyProfits.length > 0 ? Math.min(...dailyProfits) : 0,
    profitableDays: dailyProfits.filter((p) => p > 0).length,
    totalDays: dailyProfits.length,
  };
};
