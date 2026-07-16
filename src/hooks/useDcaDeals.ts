import { useDealStore, type DealType, type DealWithType } from '@/stores/live';
import { useCallback, useEffect, useMemo, useState } from 'react';
import getLatestPrices /* , { setActiveExchanges }  */ from '../helper/price';
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
import {
  calculateUnrealizedPnL,
  findUSDRate,
  type PriceData,
} from '../lib/utils/unrealizedPnL';
import { isLongStrategy } from '../lib/utils/tradingMetrics';
import type {
  DataGridFilterInput,
  DCADeals,
  DCADealStatusEnum,
  Prices,
} from '../types';
import { useUsdRate } from './useUsdRate';
import { useUserFees } from './useUserFeesService';
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
  total: number;
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
}

const isTerminalDeal = (deal: Partial<DCADeals>): boolean => {
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
  const { tradingMode } = useUIStore();
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

  const endpoint = useMemo(
    () => import.meta.env.VITE_API_ENDPOINT || 'http://localhost:4000',
    []
  );

  // Auth tokens and UI state
  const { tokens } = useAuthStore();

  // State for managing pagination fetch
  const [queryResult, setQueryResult] = useState<{
    data: ReturnResult<DcaDealsResponse> | null;
    isLoading: boolean;
    isError: boolean;
    error: Error | null;
  }>({
    data: null,
    isLoading: false,
    isError: false,
    error: null,
  });

  // Prepare input for GraphQL query based on filter.
  // NOTE: dcaDealList ignores a top-level `status` arg — the status must be
  // expressed as a dataGridInput.filterModel item (it overrides the backend's
  // active-only default). So we translate `filter.status` into that item.
  const input = useMemo(() => {
    const i: {
      terminal?: boolean;
      botId?: string;
      dataGridInput?: DataGridFilterInput;
    } = {};
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
    () => options?.enabled !== false && !!tokens?.accessToken && !isShareMode,
    [options?.enabled, tokens?.accessToken, isShareMode]
  );

  // Fetch all pages with autopagination
  const fetchAllPages = useCallback(async () => {
    if (!isEnabled) return;

    setQueryResult({
      data: null,
      isLoading: true,
      isError: false,
      error: null,
    });

    try {
      const config = getGraphQLConfig(tokens, isLiveTrading);
      const paperContext = currentPaperContext;
      const client = new GraphQLClient(endpoint, config.token, paperContext);

      const allDeals: DCADeals[] = [];
      const MAX_PAGES = isTerminal ? 5 : 1; // Only autopaginate for terminal deals
      const PAGE_SIZE = 500;
      let totalPages = MAX_PAGES;
      // Whether we fetched the full result set (vs. stopping at the page cap
      // with more pages remaining). Only a complete snapshot may absence-delete
      // in reconcileDeals — pruning against a capped page drops genuine deals.
      let reachedEnd = false;

      // Fetch pages sequentially (0-based) until we reach max pages or no more pages
      for (let page = 0; page < MAX_PAGES && page < totalPages; page++) {
        const pageInput = {
          ...input,
          dataGridInput: {
            ...(input.dataGridInput || {}),
            page,
            pageSize: PAGE_SIZE,
          },
        };

        const { query, variables } = dealQueries.dcaDealList(pageInput);

        const result = await client.request<{
          dcaDealList: ReturnResult<DcaDealsResponse>;
        }>(query, variables, { timeoutMs: DEFAULT_READ_TIMEOUT_MS });

        if (
          result.dcaDealList?.status === 'OK' &&
          result.dcaDealList.data?.result
        ) {
          const pageDeals = Array.isArray(result.dcaDealList.data.result)
            ? result.dcaDealList.data.result
            : [];

          allDeals.push(...pageDeals);
          totalPages = result.dcaDealList.data.totalPages || MAX_PAGES;

          logger.debug(`[useDcaDeals] Fetched page ${page + 1}/${totalPages}`, {
            pageDeals: pageDeals.length,
            totalDeals: allDeals.length,
            isTerminal,
          });

          // If this page has fewer deals than page size, we've reached the last page
          if (pageDeals.length < PAGE_SIZE) {
            reachedEnd = true;
            break;
          }
          // Fetched every page the backend reports -> snapshot is complete.
          if (page + 1 >= totalPages) {
            reachedEnd = true;
            break;
          }
        } else {
          // If page fails, stop pagination
          break;
        }
      }

      // Apply client-side filtering
      const scopedDeals = isTerminal
        ? allDeals
        : allDeals.filter((deal) => !isTerminalDeal(deal));

      const normalizedDeals = scopedDeals.map((deal) => ({
        ...deal,
        paperContext:
          typeof deal.paperContext === 'boolean'
            ? deal.paperContext
            : paperContext,
      }));

      // Update store once with all deals
      const dealType: DealType = isTerminal ? 'terminal' : 'dca';
      const mapDealsByBotId: Record<string, DCADeals[]> =
        normalizedDeals.reduce(
          (acc, deal) => {
            const key = isTerminal ? 'terminal' : deal.botId;
            if (!acc[key]) {
              acc[key] = [];
            }
            acc[key].push(deal);
            return acc;
          },
          {} as Record<string, DCADeals[]>
        );

      // Reconcile the whole fetched scope in one authoritative pass. Unlike the
      // old per-bot replace=true writes, this also prunes stale in-scope deals
      // of bots that are ABSENT from the response (all-bots fetch where a bot
      // has zero remaining active deals). An empty snapshot still triggers the
      // absence-delete, subsuming the old empty-result special cases.
      useDealStore.getState().reconcileDeals(
        {
          dealType,
          paperContext,
          statuses:
            dealStatusGroup(filter?.status) ?? ACTIVE_ONLY_DEFAULT_STATUSES,
          botId: isTerminal ? 'terminal' : filter?.botId,
          // Only prune absent deals when we fetched the whole result set;
          // a page-capped snapshot must not delete deals beyond the cap.
          complete: reachedEnd,
          // This hook always fetches over the raw client (no RQ cache), so
          // the snapshot is fresh as of now.
          snapshotAt: Date.now(),
        },
        mapDealsByBotId
      );

      // Set final result
      setQueryResult({
        data: {
          status: 'OK',
          data: {
            page: 0,
            totalPages: Math.min(totalPages, MAX_PAGES),
            totalResults: allDeals.length,
            result: normalizedDeals,
          },
        } as ReturnResult<DcaDealsResponse>,
        isLoading: false,
        isError: false,
        error: null,
      });

      logger.debug(
        `[useDcaDeals] ${isTerminal ? 'Autopagination' : 'Single page load'} complete`,
        {
          totalDeals: allDeals.length,
          scopedDeals: scopedDeals.length,
          pagesLoaded: Math.ceil(allDeals.length / PAGE_SIZE),
          isTerminal,
        }
      );
    } catch (error) {
      logger.error('[useDcaDeals] Query error:', error);
      setQueryResult({
        data: null,
        isLoading: false,
        isError: true,
        error: error instanceof Error ? error : new Error('Unknown error'),
      });
    }
  }, [
    isEnabled,
    tokens,
    isLiveTrading,
    currentPaperContext,
    endpoint,
    input,
    isTerminal,
    filter?.botId,
    filter?.status,
  ]);

  // Trigger fetch when dependencies change
  useEffect(() => {
    void fetchAllPages();
  }, [fetchAllPages]);

  // Refetch function to manually trigger a new fetch
  const refetch = useCallback(async () => {
    await fetchAllPages();
  }, [fetchAllPages]);

  // No need for additional client-side filtering - status is handled by the query
  const dealsArray = useMemo(() => dealsFromStore, [dealsFromStore]);

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

  // Subscribe to latest prices (same as Trades) and compute unrealized PnL
  const [latestPrices, setLatestPrices] = useState<Prices>([]);
  // no need for explicit ready flag; presence of latestPrices is enough

  useEffect(() => {
    // Skip price subscription when disabled
    if (!isEnabled) return;

    const unsubscribe = getLatestPrices(
      (result) => {
        if (result.status === 'OK') {
          setLatestPrices(result.data);
        }
      },
      false // don't load US exchanges (same as Trades)
    );
    return () => unsubscribe();
  }, [isEnabled]);

  // Fetch cached USD rate (updates every 12 hours on backend)
  const { rate: usdRate } = useUsdRate();

  // Keep active exchanges similar to Trades
  /* React.useEffect(() => {
    if (!isEnabled) return;

    const active = Array.from(
      new Set(
        (dealsArray || [])
          .map((d) => d?.exchange || d.exchangeUUID)
          .filter(Boolean) as string[]
      )
    );
    if (active.length > 0) setActiveExchanges(active);
  }, [dealsArray, isEnabled]); */

  const priceData: PriceData[] = useMemo(() => {
    const out: PriceData[] = [];
    for (const p of latestPrices) {
      out.push({
        symbol: p.symbol,
        price: p.price,
        exchange: p.exchange || 'all',
      });
    }
    out.push({ symbol: 'USDTUSD', price: 1, exchange: 'all' });
    out.push({ symbol: 'USDUSDT', price: 1, exchange: 'all' });
    return out;
  }, [latestPrices]);

  const finalUsdRate = useMemo(() => usdRate || 0, [usdRate]);

  // Fetch and cache per-exchange symbol fee rates (prefer taker)
  const [feesByExchange, setFeesByExchange] = useState<
    Record<string, Record<string, number>>
  >({});

  const { fetchMultipleFees } = useUserFees();

  useEffect(() => {
    // Skip fee fetching when disabled
    if (!isEnabled || !dealsArray?.length) return;

    // Build symbols list per exchange
    const byExchange = new Map<string, Set<string>>();
    for (const d of dealsArray) {
      // Prefer exchange UUID for fee queries
      const ex = d.exchangeUUID || d.exchange;
      const sym = d.symbol?.symbol;
      if (!ex || !sym) continue;
      if (!byExchange.has(ex)) byExchange.set(ex, new Set());
      byExchange.get(ex)?.add(sym);
    }

    const fetchFees = async () => {
      const updates: Record<string, Record<string, number>> = {};
      for (const [ex, symbolsSet] of byExchange.entries()) {
        const multipleFees = await fetchMultipleFees({
          exchangeSymbolMap: new Map().set(ex, symbolsSet),
        });
        updates[ex] = updates[ex] || {};
        for (const f of multipleFees) {
          // Use taker fee when available; values are expected as decimal (e.g., 0.001 for 0.1%)
          const rate =
            typeof f.taker === 'number'
              ? f.taker
              : typeof f.maker === 'number'
                ? f.maker
                : 0;
          updates[ex][f.symbol] = rate;
        }
      }
      if (Object.keys(updates).length > 0) {
        setFeesByExchange((prev) => ({ ...prev, ...updates }));
      }
    };

    void fetchFees();
  }, [dealsArray, endpoint, isEnabled, fetchMultipleFees]);

  const dealMetrics = useMemo(() => {
    const map: Record<
      string,
      { unrealizedUsd: number; unrealizedPct: number }
    > = {};
    // Skip calculations when disabled or no deals
    if (!isEnabled || !dealsArray?.length) return map;
    for (const d of dealsArray) {
      // Adapt to DealData expected by util
      const dealForCalc = {
        ...d,
        dcaBot: d.dcaBot ? [{ exchange: d.exchange }] : [],
      } as unknown as DCADeals;
      const u =
        calculateUnrealizedPnL(dealForCalc, priceData, finalUsdRate) || 0;
      // Legacy parity: the fee & percentage denominator ("usage") depends on
      // strategy.  LONG spot → current.quote; SHORT spot → current.base * price.
      // Both are then multiplied by the quoteAsset USD rate.
      const long = isLongStrategy(d.strategy);
      const symStr = d.symbol?.symbol;
      const dealPrice = symStr
        ? (priceData.find((p) => p.symbol === symStr)?.price ?? 0)
        : 0;
      const quoteAsset = d.symbol?.quoteAsset || 'USDT';
      const usdRateForDenom = findUSDRate(quoteAsset, priceData, d.exchange);
      const denom = long
        ? (d.usage?.current?.quote ?? 0) * usdRateForDenom
        : (d.usage?.current?.base ?? 0) * dealPrice * usdRateForDenom;
      // Apply 2x exchange fee (open + close) against the invested amount
      const ex = d.exchangeUUID || d.exchange;
      const sym = d.symbol?.symbol;
      const feeRate = (ex && sym && feesByExchange[ex]?.[sym]) || 0;
      const feeCost = denom > 0 && feeRate > 0 ? 2 * feeRate * denom : 0;
      const uNet = u - feeCost;
      const pct = denom > 0 ? (uNet / denom) * 100 : 0;
      const key = d._id || d.botId;
      if (key) map[key] = { unrealizedUsd: uNet, unrealizedPct: pct };
    }
    return map;
  }, [dealsArray, feesByExchange, isEnabled, priceData, finalUsdRate]);

  // Augment deals with computed metrics for consumers
  const dealsWithMetrics: DCADeals[] = useMemo(() => {
    return dealsArray.map((d: DCADeals) => {
      const key = d._id || d.botId;
      const m = (key && dealMetrics[key]) || {
        unrealizedUsd: 0,
        unrealizedPct: 0,
      };
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
        unrealizedUsd: m.unrealizedUsd,
        unrealizedPct: m.unrealizedPct,
        exchange: flatExchange,
        botName: flatBotName,
      } as DCADeals;
    });
  }, [dealsArray, dealMetrics]);

  return {
    data: queryResult.data || null,
    deals: dealsWithMetrics,
    total: dealsWithMetrics.length,
    hasValidResponse,
    isLoading: isInitialLoad, // Only show loading on first load
    isError: queryResult.isError,
    error: queryResult.error,
    refetch,
    dealMetrics,
  };
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
