import { hedgeComboBotFragment } from '@/lib/api/GraphQLQueries-fragments';
import { useHedgeDcaBotsStore } from '@/stores/live';
import { useShareContext } from './useShareContext';
import { useUIStore } from '@/stores/uiStore';
import { useEffect, useMemo } from 'react';
import { botQueries } from '../lib/api/GraphQLQueries-bot-queries';
import { LONG_READ_TIMEOUT_MS } from '../lib/api';
import { logger } from '../lib/loggerInstance';
import type { BotStatus, HedgeBot } from '../types';
import type { HedgeDcaBotListResponse } from '../types/hedgeBot';
import { useGraphQL } from './useGraphQL';

export interface HedgeDcaBotsFilter {
  paperContext?: boolean;
  status?: BotStatus[];
  all?: boolean;
}

export interface UseHedgeDcaBotsResult {
  data: HedgeDcaBotListResponse | null;
  bots: HedgeBot[];
  total: number;
  hasValidResponse: boolean;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

/**
 * Mirrors `useDcaBots` for hedge-DCA bots. Reads from `useHedgeDcaBotsStore`,
 * keeps it in sync with `hedgeDCABotList` GraphQL responses, and surfaces a
 * paper/live-filtered view to consumers. WebSocket updates land via
 * `socketIntegration.ts` directly into the same store.
 */
export function useHedgeDcaBots(
  filter?: HedgeDcaBotsFilter,
  enabled?: boolean
): UseHedgeDcaBotsResult {
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);
  const currentPaperContext = useMemo(
    () =>
      typeof filter?.paperContext === 'boolean'
        ? filter.paperContext
        : !isLiveTrading,
    [filter?.paperContext, isLiveTrading]
  );

  const botsRecord = useHedgeDcaBotsStore((state) => state.bots);
  const hasHydrated = useHedgeDcaBotsStore((state) => state._hasHydrated);

  const botsFromStore = useMemo(() => Object.values(botsRecord), [botsRecord]);

  const input: { status: BotStatus[] } = useMemo(
    () => ({
      status: filter?.status?.length
        ? filter.status
        : ['open', 'range', 'monitoring', 'error', 'closed'],
    }),
    [filter]
  );

  // The archived list must NOT share the global active-bots store. That store
  // is REPLACE-on-write (updateBots swaps the whole record) and every other
  // useHedgeDcaBots caller + the WebSocket reconcile fetch ACTIVE bots.
  // Whichever write lands last wins, so an active refetch would clobber the
  // archived background list and silently flip it to active bots (showArchived
  // stays true — the state never resets; only the store contents get replaced).
  // React Query already keys this query by `status`, so an archived query has
  // its OWN isolated result: read/write that directly and stay out of the
  // shared store entirely. Mirrors the useDcaBots/useGridBots/useComboBots fix.
  const isArchivedQuery =
    !!filter?.status?.length && filter.status.includes('archive');

  // Share-mode visitors must never fetch the visitor's hedge-DCA list.
  const { isDemo } = useShareContext();
  const options = useMemo(
    () => ({
      paperContext:
        typeof filter?.paperContext === 'boolean'
          ? filter.paperContext
          : undefined,
      enabled: isDemo ? false : enabled,
      // Archived lists come from cold store (ClickHouse) → generous long-read
      // cap; the active variant keeps the interactive default.
      requestTimeoutMs: isArchivedQuery ? LONG_READ_TIMEOUT_MS : undefined,
    }),
    [filter?.paperContext, enabled, isDemo, isArchivedQuery]
  );

  const queryResult = useGraphQL<HedgeDcaBotListResponse>(
    'hedgeDCABotList',
    botQueries.hedgeDCABotList(input, hedgeComboBotFragment),
    options
  );

  // Update store when query succeeds. The hedgeDCABotList resolver
  // returns `{ status, reason, total, data: HedgeBot[] }`; useGraphQL
  // already unwraps the operation key, so `queryResult.data` is that
  // response object and `queryResult.data.data` is the bots array
  // directly — same shape as `useDcaBots`. Backend may not always set
  // paperContext on the bot itself — fall back to whatever context we
  // queried in so the client-side filter matches.
  useEffect(() => {
    // Skip for the archived query — writing archived bots into the shared
    // active store would both clobber active consumers and be clobbered back
    // by them (see isArchivedQuery).
    if (isArchivedQuery) return;
    if (queryResult.data?.status === 'OK' && queryResult.data.data) {
      const list = Array.isArray(queryResult.data.data)
        ? queryResult.data.data
        : [];
      const normalizedBots = list.map((bot) => ({
        ...bot,
        paperContext:
          typeof bot.paperContext === 'boolean'
            ? bot.paperContext
            : currentPaperContext,
      }));
      useHedgeDcaBotsStore.getState().updateBots(normalizedBots);
    }
  }, [currentPaperContext, queryResult.data, isArchivedQuery]);

  if (queryResult.error) {
    const errorMessage = queryResult.error.message;
    logger.error('[useHedgeDcaBots] Query error:', errorMessage);
  }

  const filteredBots = useMemo(
    () =>
      botsFromStore.filter((bot: HedgeBot) => {
        if (bot.paperContext !== currentPaperContext) {
          return false;
        }
        return true;
      }),
    [botsFromStore, currentPaperContext]
  );

  // Archived list: derive bots from THIS query's own result (isolated from the
  // shared store), applying the same paperContext client filter.
  const archivedBots = useMemo(() => {
    if (!isArchivedQuery) return null;
    const data = queryResult.data?.data;
    const arr = Array.isArray(data) ? data : [];
    return arr
      .map((bot) => ({
        ...bot,
        paperContext:
          typeof bot.paperContext === 'boolean'
            ? bot.paperContext
            : currentPaperContext,
      }))
      .filter((bot: HedgeBot) => bot.paperContext === currentPaperContext);
  }, [isArchivedQuery, queryResult.data, currentPaperContext]);

  // Treat pre-hydration as loading so consumers don't render a flash-empty
  // table on hard refresh / HMR before cached bots arrive from IndexedDB.
  const isInitialLoad =
    !hasHydrated || (!botsFromStore.length && queryResult.isLoading);

  const result = useMemo(() => {
    // Archived list is isolated from the shared store (see isArchivedQuery):
    // read directly from this query's own result so an active refetch can't
    // flip the archived background list to active bots.
    if (isArchivedQuery && !isDemo) {
      const arr = archivedBots ?? [];
      return {
        data:
          (queryResult.data as unknown as
            | HedgeDcaBotListResponse
            | undefined) ?? null,
        bots: arr,
        total:
          (queryResult.data as unknown as HedgeDcaBotListResponse | undefined)
            ?.total ?? arr.length,
        hasValidResponse: queryResult.data?.status === 'OK',
        isLoading: queryResult.isLoading && !arr.length,
        isError: queryResult.isError,
        error: queryResult.error,
        refetch: queryResult.refetch,
      };
    }
    return {
      // queryResult.data IS the hedgeDCABotList response payload
      // (`{ status, reason, total, data: HedgeBot[] }`) — useGraphQL has
      // already unwrapped the operation key. In share mode we force an
      // empty payload to avoid leaking a previously-logged-in visitor's
      // cached list.
      data: isDemo
        ? null
        : (queryResult.data as unknown as
            | HedgeDcaBotListResponse
            | undefined) ?? null,
      bots: isDemo ? [] : filteredBots,
      total: isDemo
        ? 0
        : (queryResult.data as unknown as HedgeDcaBotListResponse | undefined)
            ?.total ?? filteredBots.length,
      hasValidResponse: isDemo
        ? true
        : queryResult.data?.status === 'OK' || botsFromStore.length > 0,
      isLoading: isDemo ? false : isInitialLoad,
      isError: isDemo ? false : queryResult.isError,
      error: isDemo ? null : queryResult.error,
      refetch: queryResult.refetch,
    };
  }, [
    isArchivedQuery,
    archivedBots,
    isDemo,
    queryResult.data,
    queryResult.isLoading,
    filteredBots,
    botsFromStore.length,
    isInitialLoad,
    queryResult.isError,
    queryResult.error,
    queryResult.refetch,
  ]);
  return result;
}
