import { useDealStore, type DealType, type DealWithType } from '@/stores/live';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDealResyncStore } from '@/stores/live/dealResync';
import { dealQueries } from '../lib/api/GraphQLQueries-deal-queries';
import {
  GraphQLClient,
  getGraphQLConfig,
  DEFAULT_READ_TIMEOUT_MS,
} from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useShareContext } from './useShareContext';
import { useUIStore } from '@/stores/uiStore';
import type { ReturnResult } from '../lib/api/types';
import { logger } from '../lib/loggerInstance';
import { serverDealUnrealizedPnl } from '../lib/utils/dealUnrealizedPnl';
import type {
  DataGridFilterInput,
  DCADeals,
  DCADealStatusEnum,
} from '../types';
import {
  ACTIVE_ONLY_DEFAULT_STATUSES,
  dealStatusGroup,
  statusFilterItem,
} from '../lib/utils/dealStatusFilter';

/* export interface DCADeals {
  _id: string;
  // Some APIs may return top-level botName (ensure we capture it)
  botName?: string;
  dcaBot?: {
    exchange: string;
    settings: {
      name: string;
    };
  };
  // Convenience fields (populated by this hook)
  // Flattened for easy consumption by UI components
  exchange?: string; // Prefer human-readable or UUID from dcaBot.exchange, fallback to exchangeUUID
  levels?: {
    complete: number;
    all: number;
  };
  status: string;
  currentBalances: {
    base: number;
    quote: number;
  };
  initialBalances: {
    base: number;
    quote: number;
  };
  symbol: {
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
  };
  strategy: string;
  botId: string;
  settings?: {
    futures?: boolean;
    coinm?: boolean;
  };
  usage?: {
    current: {
      base: number;
      quote: number;
    };
    currentUsd: number;
    max: {
      base: number;
      quote: number;
    };
    maxUsd: number;
  };
  avgPrice: number;
  profit?: {
    total: number;
    totalUsd: number;
    pureBase: number;
    pureQuote: number;
  };
  exchangeUUID: string;
  initialPrice: number;
  createTime: string;
  // Computed fields (hook-enhanced)
  unrealizedUsd?: number;
  unrealizedPct?: number;
} */

// This represents the inner "data" payload returned inside ReturnResult for dcaDealList
export interface DcaDealsResponse {
  page: number;
  totalPages: number;
  totalResults: number;
  result: DCADeals[];
}

export interface DcaDealsFilter {
  terminal?: boolean;
  paperContext?: boolean;
  status?: DCADealStatusEnum; // Add status filter
  botId?: string; // Add botId filter
  dataGrid?: DataGridFilterInput;
}

export interface UseDcaDealsResult {
  data: ReturnResult<DcaDealsResponse> | null;
  deals: DCADeals[];
  /** The server's count of ALL matching deals (not just the loaded ones). */
  total: number;
  /** How many of them are held client-side. */
  loadedCount: number;
  /** True when `loadedCount < total` — render "N of M", never a silent subset. */
  isPartial: boolean;
  /** More pages exist beyond what is loaded (non-paged mode). */
  hasMore: boolean;
  /** Fetch the next page and append it. */
  loadMore: () => Promise<void>;
  /** A request is in flight (initial or loadMore). */
  isFetching: boolean;
  hasValidResponse: boolean;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
  // Optional computed metrics map keyed by deal id
  dealMetrics: Record<string, { unrealizedUsd: number; unrealizedPct: number }>;
}

export interface UseDcaDealsOptions {
  enabled?: boolean;
  /**
   * Server-paged mode: fetch exactly this 0-based page (the table's current
   * page) and return its rows in server order. Without it the hook loads the
   * first page and `loadMore()` appends the next one on demand.
   */
  page?: number;
  /** Rows per request (max 500, the server's clamp). Default 500. */
  pageSize?: number;
}

export const isTerminalDeal = (deal: Partial<DCADeals>): boolean => {
  const directType = String(deal.type || '').toLowerCase();
  const hasTerminalSettings = Boolean(
    (deal.settings as { terminalDealType?: unknown } | undefined)
      ?.terminalDealType
  );
  const hasTerminalBotSettings = Boolean(
    deal.dcaBot?.settings?.terminalDealType
  );

  return (
    directType === 'terminal' || hasTerminalSettings || hasTerminalBotSettings
  );
};

export function useDcaDeals(
  filter?: DcaDealsFilter,
  options?: UseDcaDealsOptions
): UseDcaDealsResult {
  // 1. Read from Zustand store (instant, filtered by botId and type='dca')
  // Select the Record directly to avoid creating new array reference on every render
  const isTerminal = useMemo(
    () => filter?.terminal === true,
    [filter?.terminal]
  );
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);
  const tradingMode = useUIStore((s) => s.tradingMode);
  const currentPaperContext = useMemo(() => {
    if (typeof filter?.paperContext === 'boolean') {
      return filter.paperContext;
    }
    return tradingMode === 'demo' ? true : !isLiveTrading;
  }, [filter?.paperContext, isLiveTrading, tradingMode]);
  const allDealsRecord = useDealStore((state) => state.deals);
  const hasHydrated = useDealStore((state) => state._hasHydrated);
  // Convert to array based on filter (memoized by allDealsRecord and filter.botId)
  // Filter by dealType='dca' to separate from combo deals
  const dealsFromStore = useMemo(() => {
    const filterByType = (deals: DealWithType[]) => {
      let filtered = deals.filter((d) =>
        isTerminal
          ? d.dealType === 'terminal' || isTerminalDeal(d)
          : d.dealType === 'dca' && !isTerminalDeal(d)
      );

      filtered = filtered.filter(
        (deal) => deal.paperContext === currentPaperContext
      );

      // Defensive dedupe by deal id to avoid duplicates when store keys overlap
      const byId = new Map<string, DealWithType>();
      filtered.forEach((deal) => {
        if (deal._id) {
          byId.set(deal._id, deal);
        }
      });
      filtered = Array.from(byId.values());

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
    // Apply terminal/dca type filter to all deals
    const allDeals = isTerminal
      ? Object.values(allDealsRecord['terminal'] ?? {})
      : Object.entries(allDealsRecord)
          // Exclude the 'terminal' bucket when fetching non-terminal deals
          // to prevent terminal deals from appearing as DCA deals
          .filter(([key]) => key !== 'terminal')
          .flatMap(([, d]) => Object.values(d));

    return filterByType(allDeals);
  }, [
    allDealsRecord,
    currentPaperContext,
    filter?.botId,
    filter?.status,
    isTerminal,
  ]);

  // Only whether a session exists — the token itself is read at request time.
  // Selecting the whole `tokens` object re-ran the full fetch on every token
  // refresh.
  const hasSession = useAuthStore((s) => !!s.tokens?.accessToken);

  // Prepare input for GraphQL query based on filter.
  // NOTE: dcaDealList ignores a top-level `status` arg — the status must be
  // expressed as a dataGridInput.filterModel item (it overrides the backend's
  // active-only default). So we translate `filter.status` into that item.
  const input = useMemo(() => {
    const i: DcaDealListInput = {};
    // Always pass terminal flag explicitly so the backend
    // excludes terminal deals from non-terminal queries and vice-versa
    i.terminal = isTerminal;
    if (filter?.botId) {
      i.botId = filter.botId;
    }
    const statusItem = statusFilterItem(filter?.status);
    if (statusItem || filter?.dataGrid) {
      const baseGrid = filter?.dataGrid;
      const baseItems = (baseGrid?.filterModel?.items ?? []).filter(
        (it) => (it as { field?: string })?.field !== 'status'
      );
      i.dataGridInput = {
        ...(baseGrid ?? {}),
        filterModel: {
          ...(baseGrid?.filterModel ?? { items: [] }),
          items: statusItem ? [...baseItems, statusItem] : baseItems,
        },
      };
    }
    return i;
  }, [isTerminal, filter?.status, filter?.botId, filter?.dataGrid]);

  const { isDemo: isShareMode } = useShareContext();

  // Determine if the hook is enabled. Share-mode visitors never load the
  // visitor's own deal list — they only see the single shared resource.
  const isEnabled = useMemo(
    () => options?.enabled !== false && hasSession && !isShareMode,
    [options?.enabled, hasSession, isShareMode]
  );

  const pageSize = Math.min(
    DEAL_PAGE_SIZE_MAX,
    Math.max(1, options?.pageSize ?? DEAL_PAGE_SIZE_MAX)
  );
  const serverPage = options?.page;
  const isServerPaged = typeof serverPage === 'number';

  // Pages are fetched ON DEMAND. The hook used to walk every page in sequence
  // (up to 40 × 500 = 20 000 closed deals, 58 MB for a large account) on every
  // mount of every instance. Now it loads one page — the requested one in
  // server-paged mode, else the first — and `loadMore()` appends the next.
  const [queryResult, setQueryResult] = useState<{
    data: ReturnResult<DcaDealsResponse> | null;
    isLoading: boolean;
    isError: boolean;
    error: Error | null;
    serverTotal: number | null;
    loadedPages: number;
    reachedEnd: boolean;
    pageRows: DCADeals[];
  }>({
    data: null,
    isLoading: false,
    isError: false,
    error: null,
    serverTotal: null,
    loadedPages: 0,
    reachedEnd: false,
    pageRows: [],
  });

  // Accumulated rows of the current (non-paged) walk, for reconcile.
  const accumulatedRef = useRef<DCADeals[]>([]);
  const rawLoadedRef = useRef(0);
  const generationRef = useRef(0);

  const fetchPage = useCallback(
    async (page: number, opts: { reset: boolean; fresh?: boolean }) => {
      if (!isEnabled) return;
      const generation = opts.reset
        ? ++generationRef.current
        : generationRef.current;
      setQueryResult((prev) => ({
        ...prev,
        isLoading: true,
        isError: false,
        error: null,
      }));
      const paperContext = currentPaperContext;
      try {
        const { rows, total } = await fetchDcaDealPage(
          { input, page, pageSize, paperContext },
          { fresh: !!opts.fresh }
        );
        if (generation !== generationRef.current) return; // superseded

        const scoped = (
          isTerminal ? rows : rows.filter((deal) => !isTerminalDeal(deal))
        ).map((deal) => ({
          ...deal,
          paperContext:
            typeof deal.paperContext === 'boolean'
              ? deal.paperContext
              : paperContext,
        }));

        const base = opts.reset || isServerPaged ? [] : accumulatedRef.current;
        const accumulated = isServerPaged ? scoped : [...base, ...scoped];
        accumulatedRef.current = accumulated;
        const loadedRows = isServerPaged
          ? page * pageSize + rows.length
          : (opts.reset ? 0 : rawLoadedRef.current) + rows.length;
        if (!isServerPaged) rawLoadedRef.current = loadedRows;
        const reachedEnd =
          rows.length < pageSize ||
          (typeof total === 'number' && loadedRows >= total);

        const dealType: DealType = isTerminal ? 'terminal' : 'dca';
        const mapDealsByBotId: Record<string, DCADeals[]> = {};
        for (const deal of accumulated) {
          const key = isTerminal ? 'terminal' : deal.botId;
          (mapDealsByBotId[key] ??= []).push(deal);
        }
        // Reconcile the fetched scope. Only a snapshot that holds the whole
        // result set (first page through the end, not a server page in the
        // middle) may absence-delete — a partial one would prune real deals.
        useDealStore.getState().reconcileDeals(
          {
            dealType,
            paperContext,
            statuses:
              dealStatusGroup(filter?.status) ?? ACTIVE_ONLY_DEFAULT_STATUSES,
            botId: isTerminal ? 'terminal' : filter?.botId,
            complete: reachedEnd && (!isServerPaged || page === 0),
            snapshotAt: Date.now(),
          },
          mapDealsByBotId
        );

        setQueryResult({
          data: {
            status: 'OK',
            data: {
              page,
              totalPages:
                typeof total === 'number'
                  ? Math.max(1, Math.ceil(total / pageSize))
                  : page + 1,
              totalResults: typeof total === 'number' ? total : loadedRows,
              result: accumulated,
            },
          } as ReturnResult<DcaDealsResponse>,
          isLoading: false,
          isError: false,
          error: null,
          serverTotal: typeof total === 'number' ? total : null,
          loadedPages: isServerPaged ? 1 : page + 1,
          reachedEnd,
          pageRows: scoped,
        });
      } catch (error) {
        if (generation !== generationRef.current) return;
        logger.error('[useDcaDeals] Query error:', error);
        setQueryResult((prev) => ({
          ...prev,
          isLoading: false,
          isError: true,
          error: error instanceof Error ? error : new Error('Unknown error'),
        }));
      }
    },
    [
      isEnabled,
      currentPaperContext,
      input,
      isTerminal,
      filter?.botId,
      filter?.status,
      pageSize,
      isServerPaged,
    ]
  );

  const fetchPageRef = useRef(fetchPage);
  fetchPageRef.current = fetchPage;

  // (Re)load the first / requested page whenever the query changes.
  useEffect(() => {
    if (!isEnabled) return;
    void fetchPageRef.current(serverPage ?? 0, { reset: true });
  }, [isEnabled, currentPaperContext, input, pageSize, serverPage]);

  // Re-fetch on a resync request (socket reconnect, tab back after a while, a
  // close answered "already closed"): this list is otherwise patched only by
  // socket events, so one that never landed would keep a finished deal open.
  const resyncNonce = useDealResyncStore((s) => s.nonce);
  const handledResyncRef = useRef(resyncNonce);
  useEffect(() => {
    if (handledResyncRef.current === resyncNonce) return;
    handledResyncRef.current = resyncNonce;
    void fetchPageRef.current(serverPage ?? 0, { reset: true, fresh: true });
  }, [resyncNonce, serverPage]);

  const refetch = useCallback(async () => {
    await fetchPageRef.current(serverPage ?? 0, { reset: true, fresh: true });
  }, [serverPage]);

  const hasMore = !isServerPaged && !queryResult.reachedEnd && queryResult.loadedPages > 0;
  const loadMore = useCallback(async () => {
    if (!hasMore || queryResult.isLoading) return;
    await fetchPageRef.current(queryResult.loadedPages, { reset: false });
  }, [hasMore, queryResult.isLoading, queryResult.loadedPages]);

  // No need for additional client-side filtering - status is handled by the query
  const dealsArray = dealsFromStore;

  // Only show loading on initial load (when store data for this filter is
  // empty) OR while IDB is still rehydrating — otherwise the table flashes
  // empty on hard refresh / HMR before cached deals arrive.
  const isInitialLoad = useMemo(
    () => !hasHydrated || (dealsArray.length === 0 && queryResult.isLoading),
    [hasHydrated, dealsArray.length, queryResult.isLoading]
  );
  const hasValidResponse = useMemo(
    () => queryResult.data?.status === 'OK' || dealsFromStore.length > 0,
    [queryResult.data, dealsFromStore.length]
  );

  // Per-deal unrealized P&L: the server's stored value. Live, fee-inclusive
  // values are computed only for the rows actually on screen — see
  // `useLiveDealPnl`. This hook used to price EVERY loaded deal (thousands)
  // on every price tick in every mounted instance.
  const dealMetrics = useMemo(() => {
    const map: Record<
      string,
      { unrealizedUsd: number; unrealizedPct: number }
    > = {};
    if (!isEnabled) return map;
    for (const d of dealsArray) {
      const server = serverDealUnrealizedPnl(d);
      const key = d._id || d.botId;
      if (key && server) {
        map[key] = {
          unrealizedUsd: server.unrealizedUsd,
          unrealizedPct: server.percent,
        };
      }
    }
    return map;
  }, [dealsArray, isEnabled]);

  // Augment deals with flattened fields for consumers
  const dealsWithMetrics: DCADeals[] = useMemo(() => {
    return dealsArray.map((d: DCADeals) => {
      const key = d._id || d.botId;
      const m = key ? dealMetrics[key] : undefined;
      // Flatten commonly-used UI fields for parity across widgets
      const flatExchange = d.exchange || d.exchangeUUID || undefined;
      // Prefer any existing top-level botName, then nested settings.name
      // Handle dcaBot as either array or object
      const dcaBotObj = Array.isArray(d.dcaBot) ? d.dcaBot[0] : d.dcaBot;
      const flatBotName =
        (d as Partial<DCADeals>).botName ||
        dcaBotObj?.settings?.name ||
        undefined;
      return {
        ...d,
        unrealizedUsd: m?.unrealizedUsd,
        unrealizedPct: m?.unrealizedPct,
        exchange: flatExchange,
        botName: flatBotName,
      } as DCADeals;
    });
  }, [dealsArray, dealMetrics]);

  // Server-paged mode: the requested page's rows in server order, each
  // replaced by the store's live copy when it has one.
  const pageDeals = useMemo(() => {
    if (!isServerPaged) return dealsWithMetrics;
    const byId = new Map(dealsWithMetrics.map((d) => [d._id, d]));
    return queryResult.pageRows.map((row) => byId.get(row._id) ?? row);
  }, [isServerPaged, dealsWithMetrics, queryResult.pageRows]);

  const serverTotal = queryResult.serverTotal;
  return {
    data: queryResult.data || null,
    deals: pageDeals,
    total: serverTotal ?? dealsWithMetrics.length,
    loadedCount: dealsWithMetrics.length,
    isPartial:
      serverTotal !== null && !isServerPaged && dealsWithMetrics.length < serverTotal,
    hasMore,
    loadMore,
    hasValidResponse,
    isLoading: isInitialLoad, // Only show loading on first load
    isFetching: queryResult.isLoading,
    isError: queryResult.isError,
    error: queryResult.error,
    refetch,
    dealMetrics,
  };
}

type DcaDealListInput = {
  terminal?: boolean;
  botId?: string;
  dataGridInput?: DataGridFilterInput;
};

/** The server clamps every deal page to 500 rows. */
export const DEAL_PAGE_SIZE_MAX = 500;
const inFlight = new Map<
  string,
  Promise<{ rows: DCADeals[]; total: number | null }>
>();

/**
 * Fetch one `dcaDealList` page. Identical requests in flight at the same time
 * (the sidebar, the page and a widget mounting together) share one network
 * call instead of each hook instance fetching the same page.
 */
export async function fetchDcaDealPage(
  args: {
    input: DcaDealListInput;
    page: number;
    pageSize: number;
    paperContext: boolean;
  },
  opts: { fresh?: boolean } = {}
): Promise<{ rows: DCADeals[]; total: number | null }> {
  const { tokens } = useAuthStore.getState();
  const isLiveTrading = useUIStore.getState().isLiveTrading;
  const pageInput = {
    ...args.input,
    dataGridInput: {
      ...(args.input.dataGridInput || {}),
      page: args.page,
      pageSize: args.pageSize,
    },
  };
  const key = JSON.stringify([args.paperContext, pageInput]);
  const pending = inFlight.get(key);
  if (!opts.fresh && pending) return pending;
  const promise = (async () => {
    const config = getGraphQLConfig(tokens, isLiveTrading);
    const client = new GraphQLClient(
      import.meta.env.VITE_API_ENDPOINT || 'http://localhost:4000',
      config.token,
      args.paperContext
    );
    const { query, variables } = dealQueries.dcaDealList(pageInput);
    const result = await client.request<{
      dcaDealList: ReturnResult<DcaDealsResponse>;
    }>(query, variables, { timeoutMs: DEFAULT_READ_TIMEOUT_MS });
    if (result.dcaDealList?.status !== 'OK') {
      throw new Error(result.dcaDealList?.reason || 'dcaDealList failed');
    }
    const rows = Array.isArray(result.dcaDealList.data?.result)
      ? result.dcaDealList.data.result
      : [];
    const total =
      typeof result.dcaDealList.total === 'number'
        ? result.dcaDealList.total
        : null;
    return { rows, total };
  })();
  inFlight.set(key, promise);
  const clear = () => {
    if (inFlight.get(key) === promise) inFlight.delete(key);
  };
  promise.then(clear, clear);
  return promise;
}

export function useDcaDealsStats(filter?: DcaDealsFilter) {
  const { deals, isLoading, isError, hasValidResponse } = useDcaDeals(filter);

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
      '[useDcaDealsStats] Valid response but no deals found (empty state)'
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
    (acc: Record<string, number>, deal: DCADeals) => {
      acc[deal.status] = (acc[deal.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const totalProfit = deals.reduce(
    (sum: number, deal: DCADeals) => sum + (deal.profit?.total || 0),
    0
  );

  const totalProfitUsd = deals.reduce(
    (sum: number, deal: DCADeals) => sum + (deal.profit?.totalUsd || 0),
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
