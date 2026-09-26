import { useCallback, useMemo, useState } from 'react';
import type {
  ColumnServerFields,
  DataTableServerSide,
  ServerTableQuery,
} from '../components/ui/data-table/serverSide';
import { tableQueryToServerBotQuery } from '../lib/botList/serverBotQuery';
import type { BotStatus } from '../types';
import { useLargeAccount } from './useLargeAccount';
import {
  useServerPagedBots,
  type ServerPagedBotType,
} from './useServerPagedBots';

export interface CanonicalListState<B> {
  bots: B[];
  /** Server total of the canonical (client-side) list. */
  total: number;
  /** The canonical list is capped: the server holds more than it returned. */
  isPartial: boolean;
  /** Rows the canonical response carried. */
  loadedCount: number;
}

export interface UseBotListPagingResult<B> {
  /** True when the list pages on the server (large account, or partial). */
  serverPaged: boolean;
  /** Why it pages on the server. */
  reason: 'largeAccount' | 'partial' | null;
  /** Rows to render: the server page, or the canonical list. */
  bots: B[];
  /** DataTable `serverSide` prop (undefined in client mode). */
  serverSide: DataTableServerSide | undefined;
  /** Total bots on the server for the current view. */
  total: number;
  /** `{shown,total}` for a PartialCount when a canonical list is capped. */
  partial: { shown: number; total: number } | null;
  /** Server page state (for "updated N s ago" / refresh). */
  isFetching: boolean;
  fetchedAt: number | null;
  refetch: (() => Promise<unknown>) | null;
}

const EMPTY_QUERY: ServerTableQuery = {
  pageIndex: 0,
  pageSize: 25,
  sorting: [],
  columnFilters: [],
  globalFilter: '',
};

/**
 * Decides whether a bot list page renders its client-side canonical list or
 * pages on the server, and wires the server side up.
 *
 * Server paging is on when the account is in large-account mode OR the
 * canonical list came back partial (`total > rows`) — the safety net for
 * every user: a capped list is never shown as if it were complete.
 */
export function useBotListPaging<B extends { _id: string }>(opts: {
  type: ServerPagedBotType;
  canonical: CanonicalListState<B>;
  statuses: BotStatus[];
  fields: Record<string, ColumnServerFields>;
  /** Tooltip for greyed sort icons. */
  unsupportedSortReason?: string;
  /**
   * Page on the server in large-account mode even when the list is complete.
   * Off for hedge lists: they are small, have no name field to search on,
   * and only get the partial-list safety net.
   */
  honorLargeAccount?: boolean;
  /** The list has a server-searchable name (hedge wrappers do not). */
  searchable?: boolean;
}): UseBotListPagingResult<B> {
  const { type, canonical, statuses, fields } = opts;
  const largeAccount = useLargeAccount();
  const largeActive = (opts.honorLargeAccount ?? true) && largeAccount.active;
  const serverPaged = largeActive || canonical.isPartial;
  const [query, setQuery] = useState<ServerTableQuery | null>(null);

  const q = query ?? EMPTY_QUERY;
  const searchable = opts.searchable ?? true;
  const serverQuery = useMemo(() => {
    const sq = tableQueryToServerBotQuery(q, fields);
    return searchable ? sq : { ...sq, search: '' };
  }, [q, fields, searchable]);

  const paged = useServerPagedBots<B & { paperContext?: boolean }>({
    type,
    statuses,
    enabled: serverPaged && query !== null,
    ...serverQuery,
  });

  const onQueryChange = useCallback((next: ServerTableQuery) => {
    setQuery((prev) =>
      prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next
    );
  }, []);

  const serverSide = useMemo<DataTableServerSide | undefined>(
    () =>
      serverPaged
        ? {
            rowCount: query === null ? canonical.total : paged.total,
            isFetching: paged.isFetching,
            unsupportedSortReason: opts.unsupportedSortReason,
            onQueryChange,
          }
        : undefined,
    [
      serverPaged,
      query,
      canonical.total,
      paged.total,
      paged.isFetching,
      opts.unsupportedSortReason,
      onQueryChange,
    ]
  );

  // Until the table reports its first query, show the canonical window's
  // first page rather than an empty table.
  const bots = serverPaged
    ? query === null
      ? canonical.bots.slice(0, q.pageSize)
      : (paged.bots as B[])
    : canonical.bots;

  return {
    serverPaged,
    reason: largeActive
      ? 'largeAccount'
      : canonical.isPartial
        ? 'partial'
        : null,
    bots,
    serverSide,
    total: serverPaged ? (serverSide?.rowCount ?? canonical.total) : canonical.total,
    partial: canonical.isPartial
      ? { shown: canonical.loadedCount, total: canonical.total }
      : null,
    isFetching: paged.isFetching,
    fetchedAt: paged.fetchedAt,
    refetch: serverPaged ? paged.refetch : null,
  };
}
