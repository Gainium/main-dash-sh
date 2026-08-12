import { useMemo } from 'react';
import { botQueries } from '../lib/api/GraphQLQueries-bot-queries';
import { LONG_READ_TIMEOUT_MS } from '../lib/api';
import type { ReturnResult } from '../lib/api/types';
import { logger } from '../lib/loggerInstance';
import type { DCABacktestingResultHistory } from '../types';
import { useGraphQL } from './useGraphQL';
import { useLocalBacktestsByType } from './useLocalBacktestsByType';
import { useShareContext } from './useShareContext';

export interface BacktestsFilter {
  paperContext?: boolean;
}

export interface UseBacktestsResult {
  data: ReturnResult<DCABacktestingResultHistory[]> | null;
  backtests: DCABacktestingResultHistory[];
  total: number;
  hasValidResponse: boolean;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

export function useDcaBacktests(_filter?: BacktestsFilter): UseBacktestsResult {
  const local = useLocalBacktestsByType('DCA');

  // Get the query and variables from botQueries with proper input parameters
  const { query, variables } = botQueries.getBacktests({
    page: 0,
    pageSize: 50,
    sortModel: [{ field: 'time', sort: 'desc' }],
  });

  // Share-mode visitors must NOT fetch the visitor's backtest list — the
  // share URL renders ONLY the shared backtest via `?backtestShare=…`.
  const { isDemo } = useShareContext();

  // Use the GraphQL hook with proper caching
  const queryResult = useGraphQL<DCABacktestingResultHistory[]>(
    'getBacktests',
    {
      query,
      variables,
    },
    // Large backtest-history payload → generous long-read cap.
    { enabled: !isDemo, requestTimeoutMs: LONG_READ_TIMEOUT_MS }
  );

  // If there's an error, log it
  if (queryResult.error) {
    logger.error('[useDcaBacktests] Query error:', queryResult.error.message);
  }

  // Handle the response structure properly
  let backtestResponse: DCABacktestingResultHistory[] | null = null;
  let responseTotal = 0;
  let hasValidResponse = false;

  if (queryResult.isError) {
    // Query failed completely
    backtestResponse = [];
    responseTotal = 0;
    hasValidResponse = false;
  } else if (queryResult.data) {
    // Check if the response has the expected structure
    if (queryResult.data.status === 'OK') {
      backtestResponse = Array.isArray(queryResult.data.data)
        ? queryResult.data.data
        : [];
      responseTotal = queryResult.data.total || backtestResponse.length;
      hasValidResponse = true;
    } else if (queryResult.data.status === 'NOTOK') {
      // Query succeeded but returned an error status
      backtestResponse = [];
      responseTotal = 0;
      hasValidResponse = true; // Still consider this a valid response (just empty)
    } else {
      // Unknown status - treat as error
      backtestResponse = [];
      responseTotal = 0;
      hasValidResponse = false;
    }
  } else if (!queryResult.isLoading) {
    // Not loading and no data - this might be an empty state
    backtestResponse = [];
    responseTotal = 0;
    hasValidResponse = true; // Consider empty as valid
  }

  // Handle the case where backtestResponse is an array
  const backtestsArray = useMemo(
    () => (Array.isArray(backtestResponse) ? backtestResponse : []),
    [backtestResponse]
  );

  const mergedBacktests = useMemo(() => {
    const byId = new Map<string, DCABacktestingResultHistory>();
    const withoutId: DCABacktestingResultHistory[] = [];

    for (const remoteBacktest of backtestsArray) {
      const id = remoteBacktest?._id;
      if (id) {
        byId.set(id, remoteBacktest);
      } else {
        withoutId.push(remoteBacktest);
      }
    }

    for (const localBacktest of local.backtests) {
      const id = localBacktest?._id;
      if (id) {
        byId.set(id, localBacktest);
      } else {
        withoutId.push(localBacktest);
      }
    }

    const merged = [...withoutId, ...Array.from(byId.values())];
    merged.sort((a, b) => (b.time || 0) - (a.time || 0));
    return merged;
  }, [backtestsArray, local.backtests]);

  // Create display names for backtests using the requested format: {start-date} to {end-date} - {coin}
  // Maps `mergedBacktests` directly, like the sibling useGridBacktests. There
  // used to be a `filteredBacktests = mergedBacktests.filter(() => true)` step
  // here: a no-op placeholder, but `.filter` allocates a NEW array every render
  // even when it keeps everything (and even when the list is empty). It was
  // this memo's only dependency, so the memo never hit and `backtests` got a
  // fresh identity on every render — which rebuilt BotBacktestPanel's
  // `insightsTabs` (and with it the backtest DataTable's `bulkActions`), so the
  // memoised ResponsiveButtonRow re-rendered on every tick
  // (RenderLoopTripwire on /bot/edit, /combo/edit). Re-add filtering INSIDE
  // this memo if it is ever needed.
  const transformedBacktests = useMemo(() => {
    return mergedBacktests.map((backtest: DCABacktestingResultHistory) => {
      const startDate = backtest.duration?.firstDataTime
        ? new Date(backtest.duration.firstDataTime).toLocaleDateString(
            'en-US',
            {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            }
          )
        : 'Unknown';

      const endDate = backtest.duration?.lastDataTime
        ? new Date(backtest.duration.lastDataTime).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })
        : 'Unknown';

      const coin =
        backtest.baseAsset || backtest.symbol?.split('USDT')[0] || 'Unknown';

      return {
        ...backtest,
        displayName: `${startDate} to ${endDate} - ${coin}`,
      };
    });
  }, [mergedBacktests]);

  // Enhanced logging for debugging
  logger.debug('[useDcaBacktests] Summary:', {
    totalFromServer: backtestsArray.length,
    filteredCount: transformedBacktests.length,
    hasValidResponse,
    isLoading: queryResult.isLoading,
    isError: queryResult.isError,
    dataStatus: queryResult.data?.status,
  });

  // Log the first few backtests for debugging
  if (transformedBacktests.length > 0) {
    logger.debug('[useDcaBacktests] First backtest:', transformedBacktests[0]);
  }

  if (isDemo) {
    return {
      data: null,
      backtests: [],
      total: 0,
      hasValidResponse: true,
      isLoading: false,
      isError: false,
      error: null,
      refetch: queryResult.refetch,
    };
  }

  return {
    data: queryResult.data || null,
    backtests: transformedBacktests,
    total: Math.max(responseTotal, transformedBacktests.length),
    hasValidResponse,
    isLoading: queryResult.isLoading,
    isError: queryResult.isError,
    error: queryResult.error,
    refetch: queryResult.refetch,
  };
}
