import { useGraphQL } from './useGraphQL';
import { useShareContext } from './useShareContext';
import { botQueries } from '@/lib/api/GraphQLQueries-bot-queries';
import { LONG_READ_TIMEOUT_MS } from '@/lib/api';
import type { GridFilterItem } from '../types';

export interface BacktestData {
  _id: string;
  maxLeverage?: number;
  noData?: boolean;
  serverSide?: boolean;
  symbol?: string;
  baseAsset?: string;
  quoteAsset?: string;
  time?: number;
  exchange?: string;
  exchangeUUID?: string;
  interval?: string;
  quoteRate?: number;
  savePermanent?: boolean;
  shareId?: string;
  userId?: string;
  value?: number;
  author?: string;
  sent?: boolean;
  note?: string;
  multi?: boolean;
  multiPairs?: string[];
  messages?: string[];
  financial?: {
    netProfitTotal?: number;
    netProfitTotalUsd?: number;
    grossProfit?: number;
    grossProfitUsd?: number;
    grossLoss?: number;
    grossLossUsd?: number;
    avgGrossProfit?: number;
    avgGrossProfitUsd?: number;
    avgGrossLoss?: number;
    avgGrossLossUsd?: number;
    avgNetProfit?: number;
    avgNetProfitUsd?: number;
    avgNetDaily?: number;
    avgNetDailyUsd?: number;
    unrealizedPnL?: number;
    unrealizedPnLUsd?: number;
    unrealizedPnLPerc?: number;
    maxDealProfit?: number;
    maxDealLoss?: number;
    maxDealProfitUsd?: number;
    maxDealLossUsd?: number;
    maxRunUp?: number;
    maxRunUpUsd?: number;
    maxDrawDown?: number;
    maxDrawDownUsd?: number;
    maxDrawDownEquityUsd?: number;
    maxDrawDownEquityPerc?: number;
    netProfitTotalPerc?: number;
    grossProfitPerc?: number;
    grossLossPerc?: number;
    avgGrossProfitPerc?: number;
    avgGrossLossPerc?: number;
    avgNetProfitPerc?: number;
    avgNetDailyPerc?: number;
    annualizedReturn?: number;
    maxDealProfitPerc?: number;
    maxDealLossPerc?: number;
    maxRunUpPerc?: number;
    maxDrawDownPerc?: number;
    initialBalanceUsd?: number;
    stDevWinningTrade?: number;
    stDevLosingTrade?: number;
    stDownDevLosingTrade?: number;
  };
  duration?: {
    avgDealDuration?: number;
    avgSplitDealDuration?: {
      d?: number;
      h?: number;
      min?: number;
      s?: number;
    };
    firstDataTime?: string;
    lastDataTime?: string;
    loadingDataTime?: number;
    processingDataTime?: number;
    botWorkingTime?: {
      d?: number;
      h?: number;
      min?: number;
      s?: number;
    };
    botWorkingTimeNumber?: number;
    maxDealDuration?: {
      d?: number;
      h?: number;
      min?: number;
      s?: number;
    };
    periodName?: string;
    avgWinningTrade?: number;
    maxWinningTrade?: number;
    avgLosingTrade?: number;
    maxLosingTrade?: number;
  };
  usage?: {
    maxTheoreticalUsage?: number;
    maxRealUsage?: number;
    avgRealUsage?: number;
  };
  numerical?: {
    all?: number;
    profit?: number;
    loss?: number;
    open?: number;
    closed?: number;
    maxConsecutiveWins?: number;
    maxConsecutiveLosses?: number;
    maxDCATriggered?: number;
    avgDCATriggered?: number;
    dealsPerDay?: number;
    coveredPriceDeviation?: number;
    actualPriceDeviation?: number;
    liquidationEvents?: number;
    confidenceGrade?: number;
    dealsForConfidenceGrade?: number;
    priceDeviation?: number;
  };
  ratios?: {
    profitFactor?: number;
    profitByPeriod?: number;
    buyAndHold?: {
      value?: number;
      valueUsd?: number;
      perc?: number;
    };
    periodRatio?: number;
    sharpe?: number;
    sortino?: number;
    cwr?: number;
  };
  settings?: {
    name?: string;
    pair?: string | string[];
    exchange?: string;
    strategy?: string;
    startCondition?: string;
    notes?: string;
    // DCA Bot settings from dcaBotSettingsFragment
    [key: string]: unknown;
  };
  config?: {
    userFee?: number;
    slippage?: number;
    firstDataTime?: string;
    lastDataTime?: string;
    RFR?: number;
    MAR?: number;
    usage?: number;
    pair?: string;
    multiIdependent?: boolean;
    multiCombined?: boolean;
  };
  symbolStats?: Array<{
    pair?: string;
    deals?: {
      profit?: number;
      loss?: number;
      open?: number;
    };
    netProfit?: {
      total?: number;
      totalUsd?: number;
    };
    dailyReturn?: {
      total?: number;
      totalUsd?: number;
    };
    profitAsset?: string;
    winRate?: number;
    profitFactor?: number;
    maxDealDuration?: {
      d?: number;
      h?: number;
      min?: number;
      s?: number;
    };
    avgDealDuration?: {
      d?: number;
      h?: number;
      min?: number;
      s?: number;
    };
  }>;
  periodicStats?: Array<{
    deals?: {
      profit?: number;
      loss?: number;
    };
    period?: string;
    startTime?: string;
    netResult?: number;
    drawdown?: number;
    runup?: number;
  }>;
  created?: string;
  updated?: string;
}

export interface BacktestResponse {
  status: string;
  reason: string;
  data: BacktestData[];
  total?: number;
}

export interface UserFileData {
  id: string;
  size: number;
  meta: {
    id: string;
    exchange: string;
    baseAsset: string;
    quoteAsset: string;
    symbol: string;
    type: string;
  };
}

export interface UserFilesResponse {
  status: string;
  reason: string;
  data: UserFileData[];
}

export interface UseBacktestsOptions {
  filters?: {
    page?: number;
    pageSize?: number;
    strategy?: string;
    exchange?: string;
    pair?: string;
    dateFrom?: string;
    dateTo?: string;
    minProfit?: number;
    maxProfit?: number;
    sort?: {
      field: string;
      order: 'asc' | 'desc';
    };
  };
  enabled?: boolean;
}

export function useBacktests(options: UseBacktestsOptions = {}) {
  const { filters, enabled = true } = options;
  // Share-mode visitors must NOT trigger the visitor's backtest list query.
  const { isDemo } = useShareContext();
  const effectiveEnabled = isDemo ? false : enabled;

  // Build filter items array
  const filterItems: GridFilterItem[] = [];
  if (filters?.strategy)
    filterItems.push({
      field: 'settings.strategy',
      operator: 'equals',
      value: filters.strategy,
    });
  if (filters?.exchange)
    filterItems.push({
      field: 'exchange',
      operator: 'equals',
      value: filters.exchange,
    });
  if (filters?.pair)
    filterItems.push({
      field: 'settings.pair',
      operator: 'equals',
      value: filters.pair,
    });
  if (filters?.dateFrom)
    filterItems.push({
      field: 'duration.firstDataTime',
      operator: 'gte',
      value: filters.dateFrom,
    });
  if (filters?.dateTo)
    filterItems.push({
      field: 'duration.lastDataTime',
      operator: 'lte',
      value: filters.dateTo,
    });
  if (filters?.minProfit !== undefined)
    filterItems.push({
      field: 'financial.netProfitTotal',
      operator: 'gte',
      value: filters.minProfit,
    });
  if (filters?.maxProfit !== undefined)
    filterItems.push({
      field: 'financial.netProfitTotal',
      operator: 'lte',
      value: filters.maxProfit,
    });

  // Build DataGridFilterInput structure
  const filterInput = {
    page: filters?.page || 0,
    pageSize: filters?.pageSize || 50,
    sortModel: filters?.sort
      ? [filters.sort]
      : [{ field: 'time', sort: 'desc' }],
    ...(filterItems.length > 0 && {
      filterModel: {
        items: filterItems,
        logicOperator: 'and' as const,
      },
    }),
  };

  const { query, variables } = botQueries.getBacktests(filterInput);

  const result = useGraphQL<{ getBacktests?: BacktestResponse }>(
    'user',
    {
      query,
      variables,
    },
    {
      enabled: effectiveEnabled,
      queryKey: ['backtests', filters],
      staleTime: 5 * 60 * 1000, // 5 minutes
      // Backtest-history list payloads are large; use the generous long-read
      // cap, not the interactive default.
      requestTimeoutMs: LONG_READ_TIMEOUT_MS,
    }
  );

  return {
    backtests: isDemo
      ? []
      : (result.data as { getBacktests?: BacktestResponse })?.getBacktests
          ?.data || [],
    total: isDemo
      ? 0
      : (result.data as { getBacktests?: BacktestResponse })?.getBacktests
          ?.total || 0,
    isLoading: isDemo ? false : result.isLoading,
    error: isDemo ? null : result.error,
    refetch: result.refetch,
  };
}

export function useComboBacktests(options: UseBacktestsOptions = {}) {
  const { filters, enabled = true } = options;
  // Share-mode visitors must NOT trigger the visitor's backtest list query.
  const { isDemo } = useShareContext();
  const effectiveEnabled = isDemo ? false : enabled;

  // Build filter items array
  const filterItems: GridFilterItem[] = [];
  if (filters?.strategy)
    filterItems.push({
      field: 'settings.strategy',
      operator: 'equals',
      value: filters.strategy,
    });
  if (filters?.exchange)
    filterItems.push({
      field: 'exchange',
      operator: 'equals',
      value: filters.exchange,
    });
  if (filters?.pair)
    filterItems.push({
      field: 'settings.pair',
      operator: 'equals',
      value: filters.pair,
    });
  if (filters?.dateFrom)
    filterItems.push({
      field: 'duration.firstDataTime',
      operator: 'gte',
      value: filters.dateFrom,
    });
  if (filters?.dateTo)
    filterItems.push({
      field: 'duration.lastDataTime',
      operator: 'lte',
      value: filters.dateTo,
    });
  if (filters?.minProfit !== undefined)
    filterItems.push({
      field: 'financial.netProfitTotal',
      operator: 'gte',
      value: filters.minProfit,
    });
  if (filters?.maxProfit !== undefined)
    filterItems.push({
      field: 'financial.netProfitTotal',
      operator: 'lte',
      value: filters.maxProfit,
    });

  // Build DataGridFilterInput structure
  const filterInput = {
    page: filters?.page || 0,
    pageSize: filters?.pageSize || 50,
    sortModel: filters?.sort
      ? [filters.sort]
      : [{ field: 'time', sort: 'desc' }],
    ...(filterItems.length > 0 && {
      filterModel: {
        items: filterItems,
        logicOperator: 'and' as const,
      },
    }),
  };

  const { query, variables } = botQueries.getComboBacktests(filterInput);

  const result = useGraphQL<{ getComboBacktests?: BacktestResponse }>(
    'user',
    {
      query,
      variables,
    },
    {
      enabled: effectiveEnabled,
      queryKey: ['comboBacktests', filters],
      staleTime: 5 * 60 * 1000, // 5 minutes
      // Backtest-history list payloads are large; use the generous long-read
      // cap, not the interactive default.
      requestTimeoutMs: LONG_READ_TIMEOUT_MS,
    }
  );

  return {
    backtests: isDemo
      ? []
      : (result.data as { getComboBacktests?: BacktestResponse })
          ?.getComboBacktests?.data || [],
    total: isDemo
      ? 0
      : (result.data as { getComboBacktests?: BacktestResponse })
          ?.getComboBacktests?.total || 0,
    isLoading: isDemo ? false : result.isLoading,
    error: isDemo ? null : result.error,
    refetch: result.refetch,
  };
}

export function useGridBacktests(options: UseBacktestsOptions = {}) {
  const { filters, enabled = true } = options;
  // Share-mode visitors must NOT trigger the visitor's backtest list query.
  const { isDemo } = useShareContext();
  const effectiveEnabled = isDemo ? false : enabled;

  // Build filter items array
  const filterItems: GridFilterItem[] = [];
  if (filters?.strategy)
    filterItems.push({
      field: 'settings.strategy',
      operator: 'equals',
      value: filters.strategy,
    });
  if (filters?.exchange)
    filterItems.push({
      field: 'exchange',
      operator: 'equals',
      value: filters.exchange,
    });
  if (filters?.pair)
    filterItems.push({
      field: 'settings.pair',
      operator: 'equals',
      value: filters.pair,
    });
  if (filters?.dateFrom)
    filterItems.push({
      field: 'duration.firstDataTime',
      operator: 'gte',
      value: filters.dateFrom,
    });
  if (filters?.dateTo)
    filterItems.push({
      field: 'duration.lastDataTime',
      operator: 'lte',
      value: filters.dateTo,
    });
  if (filters?.minProfit !== undefined)
    filterItems.push({
      field: 'financial.netProfitTotal',
      operator: 'gte',
      value: filters.minProfit,
    });
  if (filters?.maxProfit !== undefined)
    filterItems.push({
      field: 'financial.netProfitTotal',
      operator: 'lte',
      value: filters.maxProfit,
    });

  // Build DataGridFilterInput structure
  const filterInput = {
    page: filters?.page || 0,
    pageSize: filters?.pageSize || 50,
    sortModel: filters?.sort
      ? [filters.sort]
      : [{ field: 'time', sort: 'desc' }],
    ...(filterItems.length > 0 && {
      filterModel: {
        items: filterItems,
        logicOperator: 'and' as const,
      },
    }),
  };

  const { query, variables } = botQueries.getGridBacktests(filterInput);

  const result = useGraphQL<{ getGridBacktests?: BacktestResponse }>(
    'user',
    {
      query,
      variables,
    },
    {
      enabled: effectiveEnabled,
      queryKey: ['gridBacktests', filters],
      staleTime: 5 * 60 * 1000, // 5 minutes
      // Backtest-history list payloads are large; use the generous long-read
      // cap, not the interactive default.
      requestTimeoutMs: LONG_READ_TIMEOUT_MS,
    }
  );

  return {
    backtests: isDemo
      ? []
      : (result.data as { getGridBacktests?: BacktestResponse })
          ?.getGridBacktests?.data || [],
    total: isDemo
      ? 0
      : (result.data as { getGridBacktests?: BacktestResponse })
          ?.getGridBacktests?.total || 0,
    isLoading: isDemo ? false : result.isLoading,
    error: isDemo ? null : result.error,
    refetch: result.refetch,
  };
}
