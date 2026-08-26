import { useDealStore, type DealType, type DealWithType } from '@/stores/live';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GraphQLClient,
  getGraphQLConfig,
  DEFAULT_READ_TIMEOUT_MS,
} from '../lib/api';
import { botQueries } from '../lib/api/GraphQLQueries-bot-queries';
import type { ReturnResult } from '../lib/api/types';
import { logger } from '../lib/loggerInstance';
import type {
  DCADeals,
  DCADealStatusEnum,
  GridFilterModel,
  GridSortModel,
} from '../types';
import { useGraphQL, type FetchStamped } from './useGraphQL';
import { useShareContext } from './useShareContext';

// Filter interface for getBotDeals
interface BotDealsFilter {
  botId: string;
  status: DCADealStatusEnum;
  shareId?: string;
  page?: number;
  pageSize?: number;
  sortModel?: GridSortModel;
  filterModel?: GridFilterModel;
  dealType: DealType; // Type of deal: 'dca', 'combo', or 'terminal'
}

// Interface for getBotDeals response
interface GetBotDealsResponse {
  status: string;
  reason?: string;
  data: {
    deals: DCADeals[];
    page: number;
    total: number;
  };
}

export interface UseBotSpecificDealsResult {
  data: ReturnResult<GetBotDealsResponse> | null;
  deals: DealWithType[];
  total: number;
  isLoading: boolean;
  /** True while the FIRST full load cycle for the current (botId, status,
   *  dealType) is still in flight — covers the multi-page auto-loader, not
   *  just the initial network request. Unlike `isLoading` it does NOT drop to
   *  false the moment the first page lands, so the drawer can keep showing a
   *  loading indicator instead of a premature empty state. Stays false during
   *  the background 30s re-snapshot so a populated tab doesn't flicker. */
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
  /** Imperatively fetch EVERY page of this bot's deals for the requested
   *  status (not capped by the display auto-loader's `maxPages`). Used by the
   *  deals table's export so large bots don't silently export a subset. */
  fetchAllDeals: () => Promise<DCADeals[]>;
}

/** Hard ceiling for the export fetch loop: 200 pages × pageSize 100 = 20k
 *  deals — far above any real bot, purely a runaway-loop backstop. */
const FETCH_ALL_MAX_PAGES = 200;

// The status group this hook actually requests from the backend. NOTE: it puts
// `error` in the CLOSED group, which differs from dealStatusFilter.ts's
// OPEN_GROUP (open/start/error). The reconcile scope must match exactly the set
// this hook fetched — otherwise an open fetch would absence-delete `error`
// deals it never requested. So we keep this hook's own grouping, deliberately
// NOT dealStatusGroup().
const requestedStatusGroup = (status: DCADealStatusEnum): string[] =>
  status === 'open' ? ['open', 'start'] : ['closed', 'canceled', 'error'];

export function useBotSpecificDeals(
  filter: BotDealsFilter
): UseBotSpecificDealsResult {
  const dealType = useMemo(() => filter.dealType || 'dca', [filter.dealType]); // Default to 'dca' for backward compatibility

  // Auto-loading pagination state
  const [currentPageLoading, setCurrentPageLoading] = useState(0);
  const [loadedPages, setLoadedPages] = useState<Set<number>>(new Set([0]));
  const maxPages = 5;

  // Snapshot of the last completed fetch for the current (botId, status).
  // The shared deal store is the source of live updates, but it is also
  // overwritten by the list page's `useDcaDeals` (which fetches open-only with
  // replace=true) and by the cancellable debounced write below. The list page
  // re-writes open deals for us, so the Active tab survives — but Closed deals
  // have no other writer, so a clobber/cancel leaves the Closed tab empty.
  // Returning this snapshot (merged with the store) makes the result robust.
  const [committedDeals, setCommittedDeals] = useState<DCADeals[]>([]);

  // 1. Read from Zustand store (instant, filtered by botId and status)
  const allDealsRecord = useDealStore((state) => state.deals);
  const hasHydrated = useDealStore((state) => state._hasHydrated);
  // Convert to array based on filter (memoized)
  const dealsFromStore = useMemo(() => {
    const botDeals = Object.values(allDealsRecord[filter.botId] ?? {}) || [];
    // Filter by dealType and status
    return botDeals.filter(
      (d) =>
        d.dealType === dealType &&
        (filter.status === 'open'
          ? d.status === 'open' || d.status === 'start'
          : d.status === 'closed' ||
            d.status === 'canceled' ||
            d.status === 'error')
    );
  }, [allDealsRecord, filter.botId, filter.status, dealType]);
  // Pick up share id from URL when caller didn't pass one explicitly.
  const { shareId: ctxShareId } = useShareContext();
  const effectiveShareId = filter.shareId ?? ctxShareId ?? undefined;

  // Prepare input for getBotDeals query
  const input = useMemo(
    () => ({
      id: filter.botId,
      status: filter.status,
      page: currentPageLoading,
      pageSize: filter.pageSize || 100,
      sortModel: filter.sortModel || [],
      filterModel: filter.filterModel || { items: [] },
      ...(effectiveShareId && { shareId: effectiveShareId }),
    }),
    [
      filter.botId,
      filter.status,
      currentPageLoading,
      filter.pageSize,
      filter.sortModel,
      filter.filterModel,
      effectiveShareId,
    ]
  );

  // Get the query and variables from botQueries
  const q = useMemo(
    () =>
      filter.dealType === 'combo'
        ? botQueries.getComboBotDeals
        : botQueries.getBotDeals,
    [filter.dealType]
  );
  const { query, variables } = q(input);
  const key = useMemo(
    () => (filter.dealType === 'combo' ? 'getComboBotDeals' : 'getBotDeals'),
    [filter.dealType]
  );
  // Use the GraphQL hook
  const queryResult = useGraphQL<GetBotDealsResponse>(
    key,
    {
      query,
      variables,
    },
    {
      shareId: effectiveShareId ?? null,
    }
  );

  const [intermediateDeals, setIntermediateDeals] = useState<DCADeals[]>([]);
  // Mirrors `intermediateDeals` for the CURRENT auto-load run, keyed by _id.
  // A ref (not state) because the effect below must read the accumulated size
  // synchronously to decide whether the run actually covers every page it
  // walked past before it may declare the run complete — and depending on
  // `intermediateDeals` there would re-run the effect on every render (see the
  // dependency note at the end of that effect). Reset wherever
  // `intermediateDeals` is.
  const accumulatedRef = useRef<Map<string, DCADeals>>(new Map());
  const [isLoadingComplete, setIsLoadingComplete] = useState(false);
  // Latches true once the first full load cycle (all auto-loader pages) for the
  // current filter has finished. Reset only when the filter changes — NOT by
  // the periodic 30s re-snapshot — so background refreshes don't re-show the
  // loading indicator on an already-populated tab.
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Update store when query succeeds and handle sequential auto-loading
  useEffect(() => {
    if (queryResult.data && queryResult.data.status === 'OK') {
      const response = queryResult.data as unknown as GetBotDealsResponse;
      const apiDeals = response.data?.deals || [];
      const total = response.data?.total || 0;
      const pageSize = filter.pageSize || 100;

      // The payload react-query hands back is NOT necessarily this page's.
      // `lib/queryClient` sets a GLOBAL `placeholderData: (prev) => prev`, so
      // the moment `currentPageLoading` changes the key, the PREVIOUS page's
      // payload is replayed under the new key with a success status (and
      // `isLoading` false) until the network answers. Folding that in as "the
      // response for currentPageLoading" made the loader walk pages far faster
      // than the network — it reached the last page holding only page 0 and
      // committed that as the whole snapshot. The server echoes the page it
      // served, so trust that. (`?? currentPageLoading` keeps a backend that
      // omits the field on the old behaviour rather than dropping every page.)
      const responsePage = response.data?.page ?? currentPageLoading;
      if (responsePage !== currentPageLoading) return;

      apiDeals.forEach((d) => {
        if (d._id) accumulatedRef.current.set(d._id, d); // Deduplicate by _id
      });
      setIntermediateDeals(Array.from(accumulatedRef.current.values()));

      // Check if we should load more pages (only if query is not loading to ensure sequential loading)
      const shouldContinueLoading =
        !queryResult.isLoading && // Wait for current query to finish
        currentPageLoading < maxPages - 1 && // Haven't reached max pages
        apiDeals.length === pageSize && // Current page is full
        (currentPageLoading + 1) * pageSize < total; // More data available

      if (shouldContinueLoading) {
        const nextPage = currentPageLoading + 1;
        if (!loadedPages.has(nextPage)) {
          setLoadedPages((prev) => new Set([...prev, nextPage]));

          // Add a small delay to ensure sequential loading and prevent race conditions
          setTimeout(() => {
            setCurrentPageLoading(nextPage);
          }, 100);
        }
      } else if (
        accumulatedRef.current.size >=
        currentPageLoading * pageSize + apiDeals.length
      ) {
        // Last page of the run AND the accumulator holds every page of it:
        // pages before the current one are full by construction (that is the
        // only reason the loader advanced), so a run that walked to page N
        // must carry N*pageSize deals plus this page's. Short of that we
        // skipped a page whose response has not landed yet — committing here
        // is what let reconcileDeals' absence-delete prune real deals. Stay
        // put; the outstanding page re-triggers this effect when it arrives.
        setIsLoadingComplete(true);
        setHasLoadedOnce(true);
      }
    }
    // `filter` itself must NOT be a dep — only the fields the body reads. Every
    // call site passes an inline object literal, so depending on the object
    // re-runs this effect on EVERY render; the body then calls
    // `setIntermediateDeals` with a freshly-built array, which re-renders, which
    // re-runs the effect… React eventually throws "Maximum update depth
    // exceeded" and the page falls into its error boundary.
  }, [
    queryResult.data,
    queryResult.isLoading,
    dealType,
    currentPageLoading,
    loadedPages,
    filter.pageSize,
  ]);

  // Get total from API response (for pagination). Declared before the commit
  // effect below, which reads it to decide whether the snapshot is complete
  // enough to absence-delete with.
  const apiTotal = useMemo(() => {
    if (queryResult.data && queryResult.data.status === 'OK') {
      const response = queryResult.data as unknown as GetBotDealsResponse;
      return response.data?.total || 0;
    }
    return 0;
  }, [queryResult.data]);

  // Debounced store update - only update when loading is complete
  useEffect(() => {
    if (isLoadingComplete) {
      if (intermediateDeals.length > 0) {
        // Capture the fetched deals immediately so the returned value survives
        // even if the debounced store write below is cancelled or clobbered.
        setCommittedDeals(intermediateDeals);
        // Use a debounce timeout to prevent rapid updates
        const timeoutId = setTimeout(() => {
          // Single authoritative reconcile for this bot's requested-status
          // scope: snapshot wins, in-scope deals absent from it AND older
          // than the snapshot's network fetch stamp are pruned (subsumes the
          // old removeDeal stale-id loop), per-deal arbitration + tombstones
          // run inside. The stamp keeps a cache-replayed page from deleting
          // deals that arrived (e.g. via websocket) after it was fetched.
          useDealStore.getState().reconcileDeals(
            {
              dealType,
              statuses: requestedStatusGroup(filter.status),
              botId: filter.botId,
              // The display loader deliberately stops at `maxPages`, so on a
              // bot with more deals than that the snapshot is page-capped and
              // cannot vouch for the absence of anything beyond it. Merge, but
              // don't absence-delete — that is exactly what `complete: false`
              // is for.
              complete: intermediateDeals.length >= apiTotal,
              snapshotAt: (queryResult.data as FetchStamped | null)
                ?.__fetchedAt,
            },
            { [filter.botId]: intermediateDeals }
          );
          logger.info(
            `[useBotSpecificDeals] Updated store with ${intermediateDeals.length} ${dealType} deals for bot ${filter.botId}`
          );
          accumulatedRef.current = new Map();
          setIntermediateDeals([]); // Clear intermediate deals after updating
          setIsLoadingComplete(false);
        }, 50); // 50ms debounce

        return () => clearTimeout(timeoutId);
      } else {
        // Fetch completed with no deals for this status — drop the snapshot so
        // a previous status's results don't linger, then reconcile with an
        // empty snapshot so the absence-delete prunes this bot's in-scope
        // deals (snapshot-stamped for the same cache-replay reason as above).
        setCommittedDeals([]);
        useDealStore.getState().reconcileDeals(
          {
            dealType,
            statuses: requestedStatusGroup(filter.status),
            botId: filter.botId,
            // Only an empty snapshot the server agrees is empty may prune.
            complete: apiTotal === 0,
            snapshotAt: (queryResult.data as FetchStamped | null)?.__fetchedAt,
          },
          { [filter.botId]: [] }
        );
        setIsLoadingComplete(false);
      }
    }
    return undefined;
  }, [
    isLoadingComplete,
    intermediateDeals,
    filter.botId,
    dealType,
    filter.status,
    queryResult.data,
    apiTotal,
  ]);

  // Log errors
  if (queryResult.error) {
    logger.error(
      '[useBotSpecificDeals] Query error:',
      queryResult.error.message
    );
  }

  // Reset pagination state when filter changes
  useEffect(() => {
    setCurrentPageLoading(0);
    setLoadedPages(new Set([0]));
    accumulatedRef.current = new Map();
    setIntermediateDeals([]); // Clear accumulated deals
    setCommittedDeals([]); // Drop the previous status's snapshot
    setIsLoadingComplete(false); // Reset loading completion state
    setHasLoadedOnce(false); // New filter → first load cycle starts over
  }, [filter.botId, filter.status, filter.dealType, filter.shareId]);

  // Periodically re-snapshot so deals that left the requested-status scope on
  // the backend (e.g. a take-profit-filled DCA deal that closed) get pruned and
  // disappear from the Open list. The deal store is otherwise only patched by
  // websocket updates, which carry price/PnL deltas but not a status→closed
  // transition; with no fresh snapshot the reconcile's `updateTime > snapshotAt`
  // guard keeps protecting the stale 'open' copy indefinitely. We reset to page
  // 0 and force a full refetch rather than using react-query's refetchInterval,
  // which would only re-hit the *current* page and make reconcileDeals
  // absence-delete the other pages' deals on multi-page bots.
  const { refetch } = queryResult;
  useEffect(() => {
    if (!filter.botId) return undefined;
    const intervalId = setInterval(() => {
      setLoadedPages(new Set([0]));
      accumulatedRef.current = new Map();
      setIntermediateDeals([]);
      if (currentPageLoading !== 0) {
        // Off page 0 (multi-page bot): resetting the page changes the query
        // variables, which re-runs the sequential load from page 0 on its own.
        setCurrentPageLoading(0);
      } else {
        // Already on page 0: variables are unchanged, so force a network
        // refetch to obtain a fresh snapshot stamp that prunes closed deals.
        void refetch();
      }
    }, 30_000);
    return () => clearInterval(intervalId);
  }, [filter.botId, filter.status, filter.dealType, currentPageLoading, refetch]);

  // Merge the live store with the last-fetched snapshot, deduped by id. The
  // store wins on conflict so active deals keep their live updates; the
  // snapshot backfills any deals the store dropped (e.g. closed deals wiped by
  // the list page's open-only replace). Re-filter by the requested status so a
  // stale snapshot entry can't leak into the wrong tab.
  const matchesRequestedStatus = useCallback(
    (status: string) =>
      filter.status === 'open'
        ? status === 'open' || status === 'start'
        : status === 'closed' ||
          status === 'canceled' ||
          status === 'error',
    [filter.status]
  );
  const mergedDeals = useMemo(() => {
    // Ids the store currently tracks for this bot, regardless of status. The
    // snapshot may only backfill deals the store has *fully dropped* (e.g.
    // closed deals wiped by the list page's open-only replace) — it must never
    // resurrect a stale-status copy of a deal the store still tracks (e.g. one
    // just optimistically marked closed/canceled on close), or that deal would
    // linger in the Active tab after being closed.
    const storeIds = new Set(
      Object.values(allDealsRecord[filter.botId] ?? {}).map((d) => d._id)
    );
    const byId = new Map<string, DealWithType>();
    // Pages fetched so far in the CURRENT (not-yet-committed) auto-load run.
    // Including them makes the table fill incrementally as each page lands
    // instead of staying empty until every page is fetched and committed.
    // committedDeals (below) supersedes these once the run finishes.
    intermediateDeals.forEach((d) => {
      if (d._id && !storeIds.has(d._id)) {
        byId.set(d._id, { ...d, dealType } as DealWithType);
      }
    });
    committedDeals.forEach((d) => {
      if (d._id && !storeIds.has(d._id)) {
        byId.set(d._id, { ...d, dealType } as DealWithType);
      }
    });
    dealsFromStore.forEach((d) => {
      if (d._id) byId.set(d._id, d);
    });
    return Array.from(byId.values()).filter(
      (d) => d.dealType === dealType && matchesRequestedStatus(d.status)
    );
  }, [
    intermediateDeals,
    committedDeals,
    dealsFromStore,
    allDealsRecord,
    filter.botId,
    dealType,
    matchesRequestedStatus,
  ]);

  // Only show loading on initial load (when store data is empty) or during
  // auto-loading. Also treat pre-hydration as loading so the table doesn't
  // flash empty during the IDB read window on hard refresh / HMR.
  const isInitialLoad = useMemo(
    () => !hasHydrated || (mergedDeals.length === 0 && queryResult.isLoading),
    [hasHydrated, queryResult.isLoading, mergedDeals.length]
  );

  // Actively fetching the first full load cycle for the current filter. Covers
  // the whole auto-loader run (not just the first page like `isLoading`), and
  // stays false during the background 30s re-snapshot (`hasLoadedOnce` already
  // latched). Consumers use this to keep a loading indicator up while a fetch
  // is genuinely in flight but the current tab has no rows yet.
  const isFetching = useMemo(
    () =>
      !hasLoadedOnce && (queryResult.isLoading || queryResult.isFetching),
    [hasLoadedOnce, queryResult.isLoading, queryResult.isFetching]
  );

  // Imperative full fetch for exports. Mirrors useGraphQL's client
  // construction (token / paper-context / share-mode) but loops through ALL
  // pages until the server-reported total is reached — the reactive display
  // path above deliberately stops at `maxPages` to keep the store small, so
  // it must never be the source for an "export all" operation.
  const fetchAllDeals = useCallback(async (): Promise<DCADeals[]> => {
    const endpoint =
      import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
    const { tokens } = useAuthStore.getState();
    const { isLiveTrading, tradingMode } = useUIStore.getState();
    const config = getGraphQLConfig(tokens, isLiveTrading);
    // Demo mode always reads the demo user's paper account (same rule as
    // useGraphQL); share-mode sends the 'demo' sentinel token + shareId.
    const paperContext =
      tradingMode === 'demo' ? true : config.paperContext;
    const effectiveToken = effectiveShareId ? 'demo' : config.token;
    const client = new GraphQLClient(
      endpoint,
      effectiveToken,
      paperContext,
      effectiveShareId
    );

    const pageSize = filter.pageSize || 100;
    const byId = new Map<string, DCADeals>();
    let total = Infinity;
    for (
      let page = 0;
      page * pageSize < total && page < FETCH_ALL_MAX_PAGES;
      page++
    ) {
      const { query, variables } = q({
        id: filter.botId,
        status: filter.status,
        page,
        pageSize,
        sortModel: filter.sortModel || [],
        filterModel: filter.filterModel || { items: [] },
        ...(effectiveShareId && { shareId: effectiveShareId }),
      });
      const result = await client.request<
        Record<string, GetBotDealsResponse>
      >(query, variables, { timeoutMs: DEFAULT_READ_TIMEOUT_MS });
      const payload = result[key];
      if (!payload || payload.status !== 'OK') {
        throw new Error(
          payload?.reason || 'Failed to fetch deals for export'
        );
      }
      const deals = payload.data?.deals || [];
      total = payload.data?.total ?? deals.length;
      deals.forEach((d) => {
        if (d._id) byId.set(d._id, d);
      });
      if (deals.length < pageSize) break; // short page — server has no more
    }
    logger.info(
      `[useBotSpecificDeals] fetchAllDeals: ${byId.size} ${filter.status} deals for bot ${filter.botId}`
    );
    return Array.from(byId.values());
  }, [
    filter.botId,
    filter.status,
    filter.pageSize,
    filter.sortModel,
    filter.filterModel,
    effectiveShareId,
    q,
    key,
  ]);

  return {
    data: queryResult.data as ReturnResult<GetBotDealsResponse> | null,
    deals: mergedDeals,
    total: apiTotal || mergedDeals.length,
    isLoading: isInitialLoad,
    isFetching,
    isError: queryResult.isError,
    error: queryResult.error,
    refetch: queryResult.refetch,
    fetchAllDeals,
  };
}
