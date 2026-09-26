import {
  botFragment,
  comboBotFragment,
  dcaBotListFragment,
  hedgeComboBotFragment,
} from '@/lib/api/GraphQLQueries-fragments';
import {
  useComboBotsStore,
  useDcaBotsStore,
  useGridBotsStore,
  useHedgeComboBotsStore,
  useHedgeDcaBotsStore,
} from '@/stores/live';
import { useUIStore } from '@/stores/uiStore';
import { keepPreviousData } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { botQueries } from '../lib/api/GraphQLQueries-bot-queries';
import { LONG_READ_TIMEOUT_MS } from '../lib/api';
import {
  toBotDataGridInput,
  type ServerBotQuery,
} from '../lib/botList/serverBotQuery';
import type { BotStatus } from '../types';
import { useGraphQL } from './useGraphQL';
import { useShareContext } from './useShareContext';

export type ServerPagedBotType =
  | 'dca'
  | 'combo'
  | 'grid'
  | 'hedgeDca'
  | 'hedgeCombo';

type AnyBot = { _id: string; paperContext?: boolean; status?: string };
type ListResponse = { status?: string; total?: number; data?: AnyBot[] };

const QUERY: Record<
  ServerPagedBotType,
  {
    key: string;
    build: (input: object) => { query: string; variables: unknown };
  }
> = {
  dca: {
    key: 'dcaBotList',
    build: (input) => botQueries.dcaBotList(input, dcaBotListFragment),
  },
  combo: {
    key: 'comboBotList',
    build: (input) => botQueries.comboBotList(input, comboBotFragment),
  },
  grid: {
    key: 'botList',
    build: (input) => botQueries.botList(input, botFragment),
  },
  hedgeDca: {
    key: 'hedgeDCABotList',
    build: (input) => botQueries.hedgeDCABotList(input, hedgeComboBotFragment),
  },
  hedgeCombo: {
    key: 'hedgeComboBotList',
    build: (input) =>
      botQueries.hedgeComboBotList(input, hedgeComboBotFragment),
  },
};

function storeFor(type: ServerPagedBotType) {
  switch (type) {
    case 'dca':
      return useDcaBotsStore;
    case 'combo':
      return useComboBotsStore;
    case 'grid':
      return useGridBotsStore;
    case 'hedgeDca':
      return useHedgeDcaBotsStore;
    case 'hedgeCombo':
      return useHedgeComboBotsStore;
  }
}

/** How often a visible server-paged list re-reads its page. */
export const SERVER_PAGE_REFRESH_MS = 60_000;

export interface UseServerPagedBotsOptions extends ServerBotQuery {
  type: ServerPagedBotType;
  statuses: BotStatus[];
  enabled: boolean;
}

export interface UseServerPagedBotsResult<B> {
  /** The requested page, in server order, with live updates applied. */
  bots: B[];
  /** Server total for the current filters. */
  total: number;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  /** Epoch ms of the page's last server read (for "updated N s ago"). */
  fetchedAt: number | null;
  refetch: () => Promise<unknown>;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * One page of a bot list, paged, sorted and searched ON THE SERVER.
 *
 * Used when an account is in large-account mode or its canonical list came
 * back partial (`total > rows`): nothing outside the visible page is fetched.
 * Page rows are merged (upsert-only) into the live bot store, and rendered
 * back from it by id, so socket updates for the rows on screen still apply;
 * updates for bots not on screen find nothing to update. The page re-reads
 * every minute while visible.
 */
export function useServerPagedBots<B extends AnyBot>(
  opts: UseServerPagedBotsOptions
): UseServerPagedBotsResult<B> {
  const { type, statuses, enabled } = opts;
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);
  const paperContext = !isLiveTrading;
  const { isDemo } = useShareContext();
  const search = useDebounced(opts.search ?? '', 300);

  const dataGridInput = useMemo(
    () =>
      toBotDataGridInput({
        pageIndex: opts.pageIndex,
        pageSize: opts.pageSize,
        sort: opts.sort,
        search,
        filters: opts.filters,
      }),
    [opts.pageIndex, opts.pageSize, opts.sort, search, opts.filters]
  );
  const input = useMemo(
    () => ({ status: statuses, dataGridInput }),
    [statuses, dataGridInput]
  );
  const isArchived = statuses.includes('archive');
  const spec = QUERY[type];

  const query = useGraphQL<AnyBot[]>(spec.key, spec.build(input) as never, {
    enabled: enabled && !isDemo,
    placeholderData: keepPreviousData,
    refetchInterval: enabled ? SERVER_PAGE_REFRESH_MS : false,
    refetchIntervalInBackground: false,
    requestTimeoutMs: isArchived ? LONG_READ_TIMEOUT_MS : undefined,
  } as never);

  const response = query.data as unknown as ListResponse | undefined;
  const pageRows = useMemo(() => {
    const rows = Array.isArray(response?.data) ? response.data : [];
    // Hedge lists on an older backend raise any pageSize below 500 to 500;
    // the first `pageSize` rows are still the requested page.
    return rows.slice(0, opts.pageSize).map((b) => ({
      ...b,
      paperContext:
        typeof b.paperContext === 'boolean' ? b.paperContext : paperContext,
    }));
  }, [response, opts.pageSize, paperContext]);

  const useStore = storeFor(type);
  // Upsert the page into the live store (never removes: a page is partial).
  // Archived rows stay out of the active store.
  useEffect(() => {
    if (!enabled || isArchived || !pageRows.length) return;
    (useStore.getState().updateBots as (bots: AnyBot[]) => void)(pageRows);
  }, [enabled, isArchived, pageRows, useStore]);

  const ids = useMemo(() => pageRows.map((b) => b._id), [pageRows]);
  const liveRows = (useStore as unknown as (
    sel: (s: { bots: Record<string, AnyBot> }) => (AnyBot | undefined)[]
  ) => (AnyBot | undefined)[])(
    useShallow((s: { bots: Record<string, AnyBot> }) =>
      ids.map((id) => s.bots[id])
    )
  );

  const bots = useMemo(
    () =>
      pageRows.map(
        (row, i) => ((isArchived ? row : (liveRows[i] ?? row)) as unknown) as B
      ),
    [pageRows, liveRows, isArchived]
  );

  const fetchedAt =
    (response as { __fetchedAt?: number } | undefined)?.__fetchedAt ?? null;

  return {
    bots,
    total: typeof response?.total === 'number' ? response.total : bots.length,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    fetchedAt,
    refetch: query.refetch,
  };
}
