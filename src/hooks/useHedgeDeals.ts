/**
 * Fetches the user's hedge deals (DCA or Combo) via the purpose-built
 * `hedgeDcaDealList` / `hedgeComboDealList` queries.
 *
 * Why a dedicated hook instead of `useDcaDeals` / `useComboDeals`: hedge legs
 * are excluded from the generic deal lists, and those hooks' shared-store
 * reconcile is authoritative — a "complete" all-bots fetch prunes any deal
 * absent from its response. So feeding a hedge view from them made hedge-leg
 * deals flash in (from a drawer/socket write) then vanish the moment the list
 * fetch reconciled them away. This hook keeps results in react-query's own
 * cache and never writes the shared deal store, so nothing can clobber it
 * (mirrors the old main-dash `dealDataGridTable` hedge path, which holds deals
 * in local state).
 *
 * Pass no `botId` to get every hedge deal across the user's hedge bots; pass a
 * hedge wrapper id to scope to a single bot (both legs). Status is expressed as
 * a dataGrid filter the same way the standalone deal hooks do it.
 *
 * Pagination: the backend hard-caps each `hedge*DealList` response at 500 rows
 * regardless of the requested `pageSize`. A user with more than 500 open hedge
 * deals would otherwise have whichever bots' deals fell outside the
 * newest-500 (`createTime desc`) window silently dropped — surfacing as $0.00
 * unrealized on cards/table and an empty Deals drawer for those bots even
 * though the deals exist. So we page through (`page` 0,1,2…) until the server
 * stops returning full pages or we've drained its reported `total`, then
 * concatenate. Most users fetch a single page; only large accounts pay for the
 * extra round-trips.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  GraphQLClient,
  getGraphQLConfig,
  DEFAULT_READ_TIMEOUT_MS,
  type ReturnResult,
} from '../lib/api';
import { dealQueries } from '../lib/api/GraphQLQueries-deal-queries';
import {
  comboDealFragment,
  dcaDealFragment,
} from '../lib/api/GraphQLQueries-fragments';
import { statusFilterItem } from '../lib/utils/dealStatusFilter';
import logger from '../lib/loggerInstance';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import type { ComboDeal } from './useComboDeals';
import type { DCADeals, DCADealStatusEnum } from '../types';
import { useCacheKey } from './useCacheKey';
import { type DcaDealsResponse } from './useDcaDeals';
import { useShareContext } from './useShareContext';

/** Server caps each page at 500 rows; mirror that as the page size we request. */
const HEDGE_DEAL_PAGE_SIZE = 500;
/**
 * Safety bound so a pathological account (or a backend that never returns a
 * short page) can't spin forever. 40 × 500 = 20k deals — far above any real
 * open-hedge-deal count. If we ever hit it we log and return what we have
 * rather than truncating silently.
 */
const HEDGE_DEAL_MAX_PAGES = 40;

// The list builders append `botName` themselves for the generic queries but the
// hedge builders don't, and neither fragment includes it — so request it
// explicitly, otherwise the Deals table's Name column is blank.
const HEDGE_DCA_DEAL_FIELDS = `${dcaDealFragment}
  botName`;
const HEDGE_COMBO_DEAL_FIELDS = `${comboDealFragment}
  botName`;

export interface UseHedgeDealsFilter {
  status?: DCADealStatusEnum;
  /** Hedge wrapper id to scope to one bot; omit for all the user's hedge bots. */
  botId?: string;
  paperContext?: boolean;
  enabled?: boolean;
}

interface HedgeDealsResultBase {
  total: number;
  isLoading: boolean;
  /** Any fetch in flight (initial OR a background refetch over rehydrated
   *  cache). `isLoading` alone drops to false once a persisted/stale cache
   *  entry rehydrates, so a consumer that wants a spinner while the paginated
   *  fetch is still streaming must use this. */
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

function useHedgeDealsInternal(
  isCombo: boolean,
  filter?: UseHedgeDealsFilter
): HedgeDealsResultBase & { deals: DcaDealsResponse['result'] } {
  const { isDemo } = useShareContext();
  const { tokens } = useAuthStore();
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);

  const operation = isCombo ? 'hedgeComboDealList' : 'hedgeDcaDealList';
  const fields = isCombo ? HEDGE_COMBO_DEAL_FIELDS : HEDGE_DCA_DEAL_FIELDS;

  const baseInput = useMemo(() => {
    const statusItem = statusFilterItem(filter?.status);
    return {
      ...(filter?.botId ? { botId: filter.botId } : {}),
      dataGridInput: {
        page: 0,
        pageSize: HEDGE_DEAL_PAGE_SIZE,
        sortModel: [{ field: 'createTime', sort: 'desc' as const }],
        filterModel: { items: statusItem ? [statusItem] : [] },
      },
    };
  }, [filter?.status, filter?.botId]);

  const paperContextOverride =
    typeof filter?.paperContext === 'boolean' ? filter.paperContext : undefined;

  // Distinct base key (`:all-pages`) so this paginated entry never collides
  // with a single-page `useGraphQL` cache of the same operation.
  const cacheKey = useCacheKey(
    `${operation}:all-pages`,
    baseInput as unknown as Record<string, unknown>,
    paperContextOverride
  );

  // Deals accumulated page-by-page during the CURRENT fetch, published as each
  // page lands so consumers can render incrementally instead of waiting for all
  // ~N pages of a large bot to finish. `deals` below prefers the completed
  // react-query result (warm cache = instant) and falls back to this stream
  // while a cold fetch is still in flight.
  const [streamedDeals, setStreamedDeals] = useState<
    DcaDealsResponse['result']
  >([]);
  const [streamedTotal, setStreamedTotal] = useState<number | null>(null);

  const queryResult = useQuery<ReturnResult<DcaDealsResponse>, Error>({
    queryKey: cacheKey,
    enabled:
      (isDemo ? false : filter?.enabled !== false) && !!tokens?.accessToken,
    queryFn: async () => {
      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const config = getGraphQLConfig(tokens, isLiveTrading);
      const { tradingMode } = useUIStore.getState();
      const isDemoMode = tradingMode === 'demo';
      const paperContext = isDemoMode
        ? true
        : (paperContextOverride ?? config.paperContext);
      const client = new GraphQLClient(endpoint, config.token, paperContext);

      const all: DcaDealsResponse['result'] = [];
      let total = Infinity;
      let page = 0;
      // Reset the incremental stream for this fresh run.
      setStreamedDeals([]);
      setStreamedTotal(null);
      for (; page < HEDGE_DEAL_MAX_PAGES; page += 1) {
        const input = {
          ...baseInput,
          dataGridInput: { ...baseInput.dataGridInput, page },
        };
        const built = isCombo
          ? dealQueries.hedgeComboDealList(input, fields)
          : dealQueries.hedgeDcaDealList(input, fields);
        const res = await client.request<{
          [k: string]: ReturnResult<DcaDealsResponse>;
        }>(built.query, built.variables, { timeoutMs: DEFAULT_READ_TIMEOUT_MS });
        const node = res[operation];
        const pageResult =
          (node && 'data' in node ? node.data?.result : undefined) ?? [];
        all.push(...(pageResult as DcaDealsResponse['result']));
        // Publish progress so the table fills in as pages arrive.
        setStreamedDeals(all.slice());
        // The backend reports the authoritative count on the operation's own
        // `total` field — its `data.totalResults` is frequently null — so trust
        // `total` to know when the list is drained.
        const reported =
          node && 'total' in node && typeof node.total === 'number'
            ? node.total
            : undefined;
        if (typeof reported === 'number') {
          total = reported;
          setStreamedTotal(reported);
        }
        // Stop on a short page (server has no more rows) or once we've
        // collected everything it claims to hold.
        if (pageResult.length < HEDGE_DEAL_PAGE_SIZE || all.length >= total) {
          break;
        }
      }
      if (page >= HEDGE_DEAL_MAX_PAGES && all.length < total) {
        logger.warn(
          `[useHedgeDeals] Stopped paginating ${operation} at ${HEDGE_DEAL_MAX_PAGES} pages; collected ${all.length}/${total}. Some hedge deals are not shown.`
        );
      }

      return {
        status: 'OK',
        reason: null,
        total: all.length,
        data: {
          page: 0,
          totalPages: 1,
          totalResults: all.length,
          result: all,
        },
      } satisfies ReturnResult<DcaDealsResponse>;
    },
  });

  const deals = useMemo(() => {
    // Prefer the completed react-query result (warm cache resolves instantly);
    // fall back to the page-by-page stream while a cold fetch is still in
    // flight so the table fills incrementally instead of blocking on the full
    // multi-page fetch. `isFetching` gates the "still loading" indicator.
    const result = queryResult.data?.data?.result;
    if (Array.isArray(result) && result.length > 0) return result;
    if (queryResult.isFetching && streamedDeals.length > 0) {
      return streamedDeals;
    }
    return Array.isArray(result) ? result : streamedDeals;
  }, [queryResult.data, queryResult.isFetching, streamedDeals]);

  return {
    deals,
    total:
      queryResult.data?.data?.totalResults ??
      streamedTotal ??
      deals.length,
    isLoading: queryResult.isLoading,
    isFetching: queryResult.isFetching,
    isError: queryResult.isError,
    error: queryResult.error,
    refetch: queryResult.refetch,
  };
}

export function useHedgeDcaDeals(
  filter?: UseHedgeDealsFilter
): HedgeDealsResultBase & { deals: DCADeals[] } {
  const r = useHedgeDealsInternal(false, filter);
  return { ...r, deals: r.deals as DCADeals[] };
}

export function useHedgeComboDeals(
  filter?: UseHedgeDealsFilter
): HedgeDealsResultBase & { deals: ComboDeal[] } {
  const r = useHedgeDealsInternal(true, filter);
  return { ...r, deals: r.deals as unknown as ComboDeal[] };
}

/**
 * Type-agnostic variant for callers that decide DCA vs Combo at runtime (the
 * shared bot drawer). Returns the raw deal records; the caller maps them with
 * the matching `*DealToOpenTrade` mapper.
 */
export function useHedgeDeals(
  isCombo: boolean,
  filter?: UseHedgeDealsFilter
): HedgeDealsResultBase & { deals: Array<DCADeals | ComboDeal> } {
  const r = useHedgeDealsInternal(isCombo, filter);
  return { ...r, deals: r.deals as Array<DCADeals | ComboDeal> };
}
