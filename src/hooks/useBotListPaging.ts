import { useCallback, useMemo } from 'react';
import {
  toFilterSpec,
  type ColumnServerFields,
  type DataTableServerSide,
} from '../components/ui/data-table/serverSide';
import { singleFilterStatus } from '../lib/botList/serverFilters';
import { useAccountTimeZone } from './useAccountTimeZone';
import {
  BOT_NAME_FIELD,
  tableQueryToServerBotQuery,
} from '../lib/botList/serverBotQuery';
import { previewPage, servesFromWindow } from '../lib/botList/windowPage';
import type { BotStatus } from '../types';
import { useServerTableQuery } from './useServerTableQuery';
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
  reason: 'partial' | null;
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


/** Bot lists come back from the server newest first. */
const BOT_DEFAULT_SORT = { field: 'created', direction: 'desc' as const };

/**
 * Decides whether a bot list page renders its client-side canonical list or
 * pages on the server, and wires the server side up.
 *
 * Server paging is on only when the canonical list came back partial
 * (`total > rows`) — the safety net for every user: a capped list is never
 * shown as if it were complete. A list that fits in what is loaded sorts
 * and filters client-side with no request, large account or not.
 *
 * Even in server mode, a page is answered from the loaded window whenever it
 * can be (default order, inside the window), and a sort/search click shows a
 * preview from the window at once while the server's answer loads.
 */
export function useBotListPaging<B extends { _id: string }>(opts: {
  type: ServerPagedBotType;
  canonical: CanonicalListState<B>;
  statuses: BotStatus[];
  fields: Record<string, ColumnServerFields>;
  /** The DataTable's tableId (its saved page size/sort seed the first query). */
  tableId?: string;
  /** Tooltip for greyed sort icons. */
  unsupportedSortReason?: string;
  /** The list has a server-searchable name (hedge wrappers do not). */
  searchable?: boolean;
}): UseBotListPagingResult<B> {
  const { type, canonical, statuses, fields } = opts;
  const serverPaged = canonical.isPartial;
  const { query, fetchQuery, onQueryChange } = useServerTableQuery(
    opts.tableId
  );

  const searchable = opts.searchable ?? true;
  const timeZone = useAccountTimeZone();
  const toServer = useMemo(
    () => (q: typeof query) => {
      // Bot-list capabilities need no newer backend: 'old' is the safe answer.
      const sq = tableQueryToServerBotQuery(q, fields, undefined, {
        backend: 'old',
        timeZone,
      });
      return searchable ? sq : { ...sq, search: '' };
    },
    [fields, searchable, timeZone]
  );
  const filterStatus = useCallback(
    (columnId: string, filter: unknown) =>
      singleFilterStatus(toFilterSpec(fields[columnId]?.filter), filter, 'old', timeZone),
    [fields, timeZone]
  );
  // What the table shows now (preview) vs what the server is asked for.
  const serverQuery = useMemo(() => toServer(query), [toServer, query]);
  const fetchServerQuery = useMemo(
    () => toServer(fetchQuery),
    [toServer, fetchQuery]
  );
  const fetchPending =
    JSON.stringify(serverQuery) !== JSON.stringify(fetchServerQuery);

  const fromWindow =
    !serverPaged ||
    servesFromWindow(serverQuery, canonical.loadedCount, false, BOT_DEFAULT_SORT);

  const paged = useServerPagedBots<B & { paperContext?: boolean }>({
    type,
    statuses,
    enabled: serverPaged && !fromWindow,
    ...fetchServerQuery,
  });

  // Rows derived from the loaded window: the exact page when the window can
  // answer it, otherwise a preview while the server's page loads.
  const windowPage = useMemo(
    () =>
      serverPaged
        ? previewPage(canonical.bots, serverQuery, {
            searchField: searchable ? BOT_NAME_FIELD : null,
            defaultSort: BOT_DEFAULT_SORT,
          })
        : null,
    [serverPaged, canonical.bots, serverQuery, searchable]
  );
  const serverReady =
    !fromWindow &&
    !fetchPending &&
    !paged.isLoading &&
    !paged.isPlaceholderData;

  const bots: B[] = !serverPaged
    ? canonical.bots
    : serverReady
      ? (paged.bots as B[])
      : (windowPage?.rows ?? []);

  const rowCount = fromWindow
    ? canonical.total
    : serverReady || paged.total
      ? paged.total
      : canonical.total;

  const serverSide = useMemo<DataTableServerSide | undefined>(
    () =>
      serverPaged
        ? {
            rowCount,
            isFetching: !fromWindow && (fetchPending || paged.isFetching),
            unsupportedSortReason: opts.unsupportedSortReason,
            onQueryChange,
            filterStatus,
          }
        : undefined,
    [
      serverPaged,
      rowCount,
      fromWindow,
      fetchPending,
      paged.isFetching,
      opts.unsupportedSortReason,
      onQueryChange,
      filterStatus,
    ]
  );

  return {
    serverPaged,
    reason: canonical.isPartial ? 'partial' : null,
    bots,
    serverSide,
    total: serverPaged ? rowCount : canonical.total,
    partial: canonical.isPartial
      ? { shown: canonical.loadedCount, total: canonical.total }
      : null,
    isFetching: paged.isFetching,
    fetchedAt: paged.fetchedAt,
    refetch: serverPaged ? paged.refetch : null,
  };
}
