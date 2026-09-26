import { useEffect, useMemo } from 'react';
import { dealQueries } from '../lib/api/GraphQLQueries-deal-queries';
import type { ReturnResult } from '../lib/api/types';
import { logger } from '../lib/loggerInstance';
import { useGraphQL, type FetchStamped } from './useGraphQL';
import type {
  ComboDeals,
  DataGridFilterInput,
  DCADealStatusEnum,
} from '@/types';
import { useDealStore, type DealWithType } from '@/stores/live';
import { useUIStore } from '@/stores/uiStore';
import {
  ACTIVE_ONLY_DEFAULT_STATUSES,
  dealStatusGroup,
  statusFilterItem,
} from '../lib/utils/dealStatusFilter';

export type ComboDeal = ComboDeals;

export interface ComboDealsData {
  page: number;
  totalPages: number;
  totalResults: number;
  result: ComboDeal[];
}

export interface ComboDealsFilter {
  paperContext?: boolean;
  botId?: string;
  status?: DCADealStatusEnum; // Add status filter support
}

export interface UseComboDealsResult {
  data: ReturnResult<ComboDealsData> | null;
  deals: ComboDeal[];
  total: number;
  /** The server returned fewer rows than it reports matching (500 cap). */
  isPartial: boolean;
  hasValidResponse: boolean;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

export function useComboDeals(filter?: ComboDealsFilter): UseComboDealsResult {
  // 1. Read from Zustand store (instant, filtered by botId and type='combo')
  const allDealsRecord = useDealStore((state) => state.deals);
  const hasHydrated = useDealStore((state) => state._hasHydrated);
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);
  const currentPaperContext = useMemo(
    () =>
      typeof filter?.paperContext === 'boolean'
        ? filter.paperContext
        : !isLiveTrading,
    [filter?.paperContext, isLiveTrading]
  );

  // Convert to array based on filter (memoized by allDealsRecord and filter.botId)
  // Filter by dealType='combo' to separate from DCA deals
  const dealsFromStore = useMemo(() => {
    const filterByType = (deals: DealWithType[]) => {
      let filtered = deals.filter(
        (d) => d.dealType === 'combo' && d.paperContext === currentPaperContext
      );

      // Also filter by status if provided. Match the same status group the
      // backend query requests (open => open/start/error, closed =>
      // closed/canceled) rather than an exact single status.
      const statusGroup = dealStatusGroup(filter?.status);
      if (statusGroup) {
        filtered = filtered.filter((d) => statusGroup.includes(d.status));
      }

      return filtered;
    };

    if (filter?.botId) {
      return filterByType(Object.values(allDealsRecord[filter.botId]) || []);
    }
    // Otherwise, get all deals from all bots and flatten
    return filterByType(
      Object.values(allDealsRecord)
        .map((d) => Object.values(d))
        .flat()
        .filter((d) => d.dealType === 'combo')
    );
  }, [allDealsRecord, currentPaperContext, filter?.botId, filter?.status]);

  // Prepare input for GraphQL query based on filter.
  // NOTE: comboDealList ignores a top-level `status` arg — the status must be
  // expressed as a dataGridInput.filterModel item (it overrides the backend's
  // active-only default). So we translate `filter.status` into that item.
  const input = useMemo(() => {
    const i: {
      botId?: string;
      dataGridInput?: DataGridFilterInput;
    } = {};
    if (filter?.botId) {
      i.botId = filter.botId;
    }
    const statusItem = statusFilterItem(filter?.status);
    if (statusItem) {
      i.dataGridInput = { filterModel: { items: [statusItem] } };
    }
    return i;
  }, [filter?.status, filter?.botId]);

  // Get the query from dealQueries - use comboDealList for status support
  const { query, variables } = useMemo(
    () => dealQueries.comboDealList(input),
    [input]
  );

  // Use the GraphQL hook with proper caching
  // Paper context is automatically handled by useGraphQL through useUIStore
  const queryResult = useGraphQL<ComboDealsData>('comboDealList', {
    query,
    variables,
  });

  // Update store when query succeeds (React Query v5 pattern)
  useEffect(() => {
    if (queryResult.data?.status === 'OK' && queryResult.data.data?.result) {
      const deals = Array.isArray(queryResult.data.data.result)
        ? queryResult.data.data.result
        : [];
      const normalizedDeals = deals.map((deal) => ({
        ...deal,
        paperContext:
          typeof deal.paperContext === 'boolean'
            ? deal.paperContext
            : currentPaperContext,
      }));
      const mapDealsByBotId: Record<string, ComboDeals[]> =
        normalizedDeals.reduce(
          (acc, deal) => {
            if (!acc[deal.botId]) {
              acc[deal.botId] = [];
            }
            acc[deal.botId].push(deal);
            return acc;
          },
          {} as Record<string, ComboDeals[]>
        );
      // comboDealList returns at most 500 rows per request (the server's
      // default and cap). Its per-page envelope (page/totalPages/
      // totalResults) is null on the live backend, but the operation's own
      // top-level `total` is the true count. The old check read only the
      // null envelope, so a >500-deal result (e.g. a closed list) was treated
      // as complete — silently truncated at 500 AND allowed to absence-delete
      // the rest from the store. Complete only when we hold `total` rows.
      const serverTotal = (queryResult.data as { total?: number | null })
        .total;
      const { totalResults, totalPages, page } = queryResult.data.data;
      const paginated =
        (typeof totalPages === 'number' && totalPages > 1) ||
        (typeof page === 'number' && page > 0) ||
        (typeof totalResults === 'number' &&
          normalizedDeals.length < totalResults) ||
        (typeof serverTotal === 'number' &&
          normalizedDeals.length < serverTotal);
      const complete = !paginated;
      // Reconcile the whole combo scope in one authoritative pass: the
      // snapshot wins, in-scope deals absent from it AND older than the
      // snapshot's fetch stamp are pruned (so a closed deal disappears), and
      // per-deal arbitration + tombstones run inside. snapshotAt comes from
      // the network stamp useGraphQL attaches — a cache-replayed response
      // keeps its original stamp, so it can never delete deals newer than
      // itself (e.g. created via websocket after it was fetched).
      useDealStore.getState().reconcileDeals(
        {
          dealType: 'combo',
          paperContext: currentPaperContext,
          statuses: dealStatusGroup(filter?.status) ?? ACTIVE_ONLY_DEFAULT_STATUSES,
          botId: filter?.botId,
          complete,
          snapshotAt: (queryResult.data as FetchStamped).__fetchedAt,
        },
        mapDealsByBotId
      );
    }
  }, [currentPaperContext, queryResult.data, filter?.status, filter?.botId]);

  // If there's an error, log it
  if (queryResult.error) {
    logger.error('[useComboDeals] Query error:', queryResult.error.message);
  }

  const hasValidResponse = useMemo(
    () => queryResult.data?.status === 'OK' || dealsFromStore.length > 0,
    [queryResult.data, dealsFromStore.length]
  );

  // Only show loading on initial load (when store data for this filter is
  // empty) OR while IDB is still rehydrating — otherwise the table flashes
  // empty on hard refresh / HMR before cached deals arrive.
  const isInitialLoad = useMemo(
    () =>
      !hasHydrated || (dealsFromStore.length === 0 && queryResult.isLoading),
    [hasHydrated, dealsFromStore.length, queryResult.isLoading]
  );

  // Augment deals with flattened botName for UI consistency
  // Cast to ComboDeals since ComboDeals extends DCADeals
  const dealsWithBotName = useMemo(() => {
    return dealsFromStore.map((d) => {
      // Handle dcaBot as either array or object
      const dcaBotObj = Array.isArray(d.dcaBot) ? d.dcaBot[0] : d.dcaBot;
      return {
        ...d,
        botName: d.botName || dcaBotObj?.settings?.name || undefined,
      } as ComboDeal;
    });
  }, [dealsFromStore]);

  const serverTotal = (queryResult.data as { total?: number | null } | undefined)
    ?.total;
  return {
    data: queryResult.data || null,
    deals: dealsWithBotName,
    // The server's count of ALL matching deals; `isPartial` flags a response
    // cut at the 500-row page so callers can say "500 of N".
    total:
      typeof serverTotal === 'number'
        ? Math.max(serverTotal, dealsWithBotName.length)
        : dealsWithBotName.length,
    isPartial:
      typeof serverTotal === 'number' &&
      (queryResult.data?.data?.result?.length ?? 0) < serverTotal,
    hasValidResponse,
    isLoading: isInitialLoad, // Only show loading on first load
    isError: queryResult.isError,
    error: queryResult.error,
    refetch: queryResult.refetch,
  };
}

export function useComboDealsStats(filter?: ComboDealsFilter) {
  const { deals, isLoading, isError, hasValidResponse } = useComboDeals(filter);

  // Return empty stats if loading, error, or no valid response
  if (isLoading || isError || !hasValidResponse) {
    return {
      totalDeals: 0,
      activeDeals: 0,
      completedDeals: 0,
      totalProfit: 0,
      totalProfitUsd: 0,
      averageProfit: 0,
      statusCounts: {},
      isLoading,
      isError,
      hasValidResponse,
    };
  }

  // If we have a valid response but no deals, return zero stats (empty state)
  if (!deals.length) {
    logger.debug(
      '[useComboDealsStats] Valid response but no deals found (empty state)'
    );
    return {
      totalDeals: 0,
      activeDeals: 0,
      completedDeals: 0,
      totalProfit: 0,
      totalProfitUsd: 0,
      averageProfit: 0,
      statusCounts: {},
      isLoading: false,
      isError: false,
      hasValidResponse: true,
    };
  }

  // Calculate statistics from real data
  const statusCounts = deals.reduce(
    (acc: Record<string, number>, deal: ComboDeal) => {
      acc[deal.status] = (acc[deal.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const totalProfit = deals.reduce(
    (sum: number, deal: ComboDeal) => sum + (deal.profit?.total || 0),
    0
  );

  const totalProfitUsd = deals.reduce(
    (sum: number, deal: ComboDeal) => sum + (deal.profit?.totalUsd || 0),
    0
  );

  const activeDeals = deals.filter(
    (deal) =>
      deal.status.toLowerCase() === 'active' ||
      deal.status.toLowerCase() === 'open'
  ).length;

  const completedDeals = deals.filter(
    (deal) =>
      deal.status.toLowerCase() === 'completed' ||
      deal.status.toLowerCase() === 'closed'
  ).length;

  const averageProfit = deals.length > 0 ? totalProfitUsd / deals.length : 0;

  return {
    totalDeals: deals.length,
    activeDeals,
    completedDeals,
    totalProfit,
    totalProfitUsd,
    averageProfit,
    statusCounts,
    isLoading: false,
    isError: false,
    hasValidResponse: true,
  };
}
