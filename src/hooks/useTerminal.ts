import { useMemo } from 'react';
import { botQueries } from '../lib/api/GraphQLQueries-bot-queries';
import type { ReturnResult } from '../lib/api/types';
import { logger } from '../lib/loggerInstance';
import type { BotStatus, DataGridFilterInput } from '../types';
import { type DcaBot, type DcaBotListResponse } from '../types/dcaBot';
import { useGraphQL } from './useGraphQL';

export interface TerminalBotsFilter {
  paperContext?: boolean;
  status?: BotStatus[];
  all?: boolean;
}

export interface UseTerminalResult {
  data: ReturnResult<DcaBotListResponse> | null;
  bots: DcaBot[];
  total: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

export interface UseTerminalOptions {
  enabled?: boolean;
  /**
   * Server-paged read (page/sort/filter). Needs a backend that accepts
   * `getTradingTerminalBotsList(input)`; an older one rejects the argument and
   * the hook falls back to the unpaged list (then filtered client-side).
   */
  dataGridInput?: DataGridFilterInput;
}

export function useTerminal(
  filter?: TerminalBotsFilter,
  options?: UseTerminalOptions
): UseTerminalResult {
  const dataGridInput = options?.dataGridInput;
  const unpaged = botQueries.getTradingTerminalBotsList();
  const gql = useMemo(
    () =>
      dataGridInput
        ? botQueries.getTradingTerminalBotsListPaged({ dataGridInput })
        : unpaged,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(dataGridInput ?? null)]
  );

  // Paper context is automatically handled by useGraphQL through useUIStore
  const queryResult = useGraphQL<DcaBotListResponse>(
    dataGridInput ? 'dcaBotListTerminalPaged' : 'dcaBotListTerminal',
    gql,
    {
      enabled: options?.enabled ?? true,
      ...(dataGridInput ? { fallbackQuery: unpaged } : {}),
    }
  );

  // Memoize the status filter to prevent infinite renders
  const statusFilter = useMemo(
    () => filter?.status ?? ['open'],
    [filter?.status]
  );

  // Apply client-side filtering with proper memoization to prevent infinite renders
  let dcaBotResponse: DcaBot[] | null = null;

  if (queryResult.isError) {
    // Query failed completely
    dcaBotResponse = [];
  } else if (queryResult.data) {
    // Check if the response has the expected structure
    if (queryResult.data.status === 'OK') {
      dcaBotResponse = Array.isArray(queryResult.data.data)
        ? queryResult.data.data
        : [];
    } else if (queryResult.data.status === 'NOTOK') {
      // Query succeeded but returned an error status
      dcaBotResponse = [];
    } else {
      // Unknown status - treat as error
      dcaBotResponse = [];
    }
  } else if (!queryResult.isLoading) {
    // Not loading and no data - this might be an empty state
    dcaBotResponse = [];
  }

  // Apply client-side filtering with proper memoization
  const filteredBots = useMemo(() => {
    // Handle the case where dcaBotResponse is an array
    const botsArray = Array.isArray(dcaBotResponse) ? dcaBotResponse : [];

    // First filter by status to ensure we only get bots with the specified status
    const filteredByStatus = botsArray.filter((bot: DcaBot) => {
      // Make sure bot.status exists and is in our status filter
      return bot.status && statusFilter.includes(bot.status as BotStatus);
    });

    // Transform names for terminal bots and ensure proper data structure
    return filteredByStatus.map((bot: DcaBot) => {
      // Override the name to be "Terminal: {pair}"
      const pairName = Array.isArray(bot.settings?.pair)
        ? bot.settings.pair.join(',')
        : bot.settings?.pair || 'Unknown';

      return {
        ...bot,
        settings: {
          ...bot.settings,
          name: `Terminal: ${pairName}`,
          type: bot.settings?.type || 'terminal', // Ensure type is set
        },
      };
    });
  }, [dcaBotResponse, statusFilter]);

  // Minimal logging - only summary info
  logger.debug('[useTerminal] Summary:', {
    totalFromServer: Array.isArray(dcaBotResponse) ? dcaBotResponse.length : 0,
    filteredCount: filteredBots.length,
    statusFilter,
    paperContext: filter?.paperContext,
    queryStatus: queryResult.data?.status,
  });

  return {
    data: queryResult.data || null,
    bots: filteredBots,
    // Server total when the backend reports one (paged read), else the rows.
    total:
      typeof (queryResult.data as { total?: number } | undefined)?.total ===
      'number'
        ? ((queryResult.data as { total?: number }).total as number)
        : filteredBots.length,
    isLoading: queryResult.isLoading,
    isError: queryResult.isError,
    error: queryResult.error,
    refetch: queryResult.refetch,
  };
}

export function useTerminalStats(filter?: TerminalBotsFilter) {
  const { bots, isLoading, isError } = useTerminal(filter);

  if (isLoading || isError || !bots.length) {
    return {
      closedTrades: 0,
      profit: 0,
      accumulatedProfit: { value: 0 },
      profitByDay: { value: 0 },
      statusCounts: {},
      isLoading,
      isError,
    };
  }

  // Calculate statistics from real data
  const statusCounts = bots.reduce(
    (acc: Record<string, number>, bot: DcaBot) => {
      acc[bot.status] = (acc[bot.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const totalProfit = bots.reduce(
    (sum: number, bot: DcaBot) => sum + (bot.profit?.totalUsd || 0),
    0
  );
  const totalDeals = bots.reduce(
    (sum: number, bot: DcaBot) => sum + (bot.dealsInBot?.all || 0),
    0
  );

  // Calculate accumulated profit (sum of all positive profits)
  const accumulatedProfit = bots
    .filter((bot: DcaBot) => (bot.profit?.totalUsd || 0) > 0)
    .reduce((sum: number, bot: DcaBot) => sum + (bot.profit?.totalUsd || 0), 0);

  // Calculate average daily profit (simplified calculation)
  const totalDays = bots.length > 0 ? Math.max(1, bots.length / 10) : 1;
  const profitByDay = totalProfit / totalDays;

  return {
    closedTrades: totalDeals,
    profit: totalProfit,
    accumulatedProfit: {
      value: accumulatedProfit,
    },
    profitByDay: {
      value: profitByDay,
    },
    statusCounts,
    isLoading: false,
    isError: false,
  };
}
