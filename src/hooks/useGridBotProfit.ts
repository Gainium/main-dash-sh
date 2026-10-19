import { useMemo } from 'react';
import { botQueries } from '../lib/api/GraphQLQueries-bot-queries';
import type { ReturnResult } from '../lib/api/types';
import { useGraphQL } from './useGraphQL';
import { BotTypesEnum } from '../types';

/**
 * Profit data point from the getProfitByBot GraphQL query.
 * Matches the legacy main-dash Profit type from types/index.ts.
 */
export interface GridProfitEntry {
  profitUsd: number;
  quote: number;
  base: number;
  date: string;
}

export interface UseGridBotProfitOptions {
  botId: string;
  timezone?: string;
  /** Timeframe: 0 = Daily, 1 = Weekly, 2 = Monthly, 3 = Total */
  timeframe?: number;
  enabled?: boolean;
  /** Which deal/transaction source the backend aggregates. Defaults to grid. */
  botType?: BotTypesEnum;
}

export interface UseGridBotProfitResult {
  data: ReturnResult<{ result: GridProfitEntry[] }> | null;
  profitEntries: GridProfitEntry[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

/**
 * Hook to fetch per-period bot profit using the getProfitByBot GraphQL query.
 * This mirrors the legacy main-dash approach (components/gridbot/index.tsx for
 * grid, components/dcabot/components/botData.tsx for DCA/Combo/Hedge).
 *
 * The backend returns an array of { profitUsd, quote, base, date } entries,
 * one per period (day/week/month), which is then used to render the profit
 * bar chart — identical to the legacy TotalProfit component.
 */
export function useGridBotProfit(
  options: UseGridBotProfitOptions
): UseGridBotProfitResult {
  const {
    botId,
    timezone,
    timeframe = 0,
    enabled = true,
    botType = BotTypesEnum.grid,
  } = options;

  const input = useMemo(
    () => ({
      botId,
      timezone,
      timeframe,
      botType,
    }),
    [botId, timezone, timeframe, botType]
  );

  const { query, variables } = botQueries.getProfitByBot(input);

  const queryResult = useGraphQL<{ result: GridProfitEntry[] }>(
    'getProfitByBot',
    { query, variables },
    { enabled: enabled && !!botId }
  );

  // The app-wide placeholderData keeps the previous key's response on screen
  // while a new one loads — here that is another timeframe's (or another
  // bot's) series drawn under the new label, so treat it as still loading.
  const isPlaceholder = queryResult.isPlaceholderData;

  const profitEntries = useMemo(() => {
    if (
      isPlaceholder ||
      !queryResult.data ||
      queryResult.data.status !== 'OK' ||
      !queryResult.data.data?.result
    ) {
      return [];
    }
    return queryResult.data.data.result;
  }, [queryResult.data, isPlaceholder]);

  return {
    data: queryResult.data || null,
    profitEntries,
    isLoading: queryResult.isLoading || isPlaceholder,
    isError: queryResult.isError,
    error: queryResult.error,
    refetch: queryResult.refetch,
  };
}
