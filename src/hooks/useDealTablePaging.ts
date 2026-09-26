import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ColumnServerFields,
  DataTableServerSide,
} from '../components/ui/data-table/serverSide';
import {
  isDefaultQuery,
  previewPage,
  servesFromWindow,
} from '../lib/botList/windowPage';
import { useServerTableQuery } from './useServerTableQuery';
import {
  CLOSED_DEAL_SERVER_FIELDS,
  CLOSED_DEAL_SORT_TOOLTIP,
  DEAL_SEARCH_FIELD,
  OPEN_DEAL_SERVER_FIELDS,
} from '../lib/botList/dealListServerFields';
import {
  tableQueryToServerBotQuery,
  toBotDataGridInput,
} from '../lib/botList/serverBotQuery';
import { DCADealStatusEnum, type DCADeals, type DataGridFilterInput } from '../types';
import { useDcaDeals } from './useDcaDeals';
import { useLargeAccount } from './useLargeAccount';
import { useLiveDealPnl } from './useLiveDealPnl';


export interface DealTablePaging {
  /** Deals to render (the server page in server mode). */
  deals: DCADeals[];
  /** Pass to OpenOrdersWidget `serverPaging` (undefined in client mode). */
  serverPaging:
    | { serverSide: DataTableServerSide; fields: Record<string, ColumnServerFields> }
    | undefined;
  /** Server total for the current status/filters. */
  total: number;
  serverPaged: boolean;
  isLoading: boolean;
  error: Error | null;
}

/**
 * A deals table (open or closed) that pages on the server when the account is
 * in large-account mode, or as soon as the first client window comes back
 * partial (`total > loaded`) — then it stays server-paged for the session so
 * the list never silently shows a subset. Pages the first window covers are
 * answered from it, so going server-paged never costs a second request for
 * the page already on screen.
 *
 * In server mode live uPnL is computed only for the rows on the page, with
 * the shared fee-inclusive function (`useLiveDealPnl`); every other row
 * shows the server's stored value.
 */
export function useDealTablePaging(opts: {
  status: 'open' | 'closed';
  terminal: boolean;
  enabled?: boolean;
  /** Only this bot's deals (bot drawer). */
  botId?: string;
  /** Page on the server regardless of mode (the caller already decided). */
  force?: boolean;
  /** The DataTable's tableId (its saved page size/sort seed the first query). */
  tableId?: string;
  /** Column → server field maps for this table (default: the Deals tab's). */
  fields?: {
    open: Record<string, ColumnServerFields>;
    closed: Record<string, ColumnServerFields>;
  };
}): DealTablePaging {
  const { status, terminal } = opts;
  const enabled = opts.enabled !== false;
  const largeAccount = useLargeAccount();
  const [latchedPartial, setLatchedPartial] = useState(false);
  const { query, fetchQuery, onQueryChange } = useServerTableQuery(
    opts.tableId
  );
  const fields =
    status === 'closed'
      ? (opts.fields?.closed ?? CLOSED_DEAL_SERVER_FIELDS)
      : (opts.fields?.open ?? OPEN_DEAL_SERVER_FIELDS);
  const baseFilter = useMemo(
    () => ({
      terminal,
      status:
        status === 'closed' ? DCADealStatusEnum.closed : DCADealStatusEnum.open,
      ...(opts.botId ? { botId: opts.botId } : {}),
    }),
    [terminal, status, opts.botId]
  );

  // The first window (one request, the server's default order). It answers
  // every page it covers, so switching to server paging — large-account mode
  // resolving, or the window coming back capped — costs no second request
  // for the first page(s).
  // (A caller that forces server paging — the bot drawer — skips it: its
  // table is always paged on the server.)
  const windowResult = useDcaDeals(baseFilter, {
    enabled: enabled && !opts.force,
  });

  // Safety net: the first client window came back capped → page on the server.
  useEffect(() => {
    if (windowResult.isPartial) setLatchedPartial(true);
  }, [windowResult.isPartial]);

  const serverPaged = !!opts.force || largeAccount.active || latchedPartial;
  const sq = useMemo(
    () => tableQueryToServerBotQuery(query, fields, DEAL_SEARCH_FIELD),
    [query, fields]
  );
  const fetchSq = useMemo(
    () => tableQueryToServerBotQuery(fetchQuery, fields, DEAL_SEARCH_FIELD),
    [fetchQuery, fields]
  );
  const windowComplete =
    !opts.force && !windowResult.isLoading && !windowResult.isPartial;
  // While the first window is still loading, a default-order page will be
  // answered by it — wait instead of racing it with a second request.
  const windowPending =
    !opts.force && windowResult.isLoading && isDefaultQuery(sq, null);
  const fromWindow =
    !serverPaged ||
    windowPending ||
    (!opts.force &&
      servesFromWindow(sq, windowResult.loadedCount, windowComplete, null));

  const dataGrid = useMemo<DataGridFilterInput | undefined>(() => {
    if (fromWindow) return undefined;
    const { page: _p, pageSize: _s, ...rest } = toBotDataGridInput(fetchSq);
    return rest;
  }, [fromWindow, fetchSq]);

  const paged = useDcaDeals(
    { ...baseFilter, ...(dataGrid ? { dataGrid } : {}) },
    {
      enabled: enabled && serverPaged && !fromWindow,
      page: fetchSq.pageIndex,
      pageSize: fetchSq.pageSize,
    }
  );
  const fetchPending = JSON.stringify(sq) !== JSON.stringify(fetchSq);

  // The page from the window: exact when the window can answer the query,
  // otherwise a preview shown while the server's page loads (rows never
  // blank on a sort/search click).
  const windowPage = useMemo(
    () =>
      serverPaged
        ? previewPage(windowResult.deals, sq, { searchField: DEAL_SEARCH_FIELD })
        : null,
    [serverPaged, windowResult.deals, sq]
  );
  const pagedKey = JSON.stringify([dataGrid, fetchSq.pageIndex, fetchSq.pageSize]);
  const shownKey = useRef<string | null>(null);
  const pagedReady =
    !fromWindow &&
    !fetchPending &&
    !paged.isLoading &&
    !(paged.isFetching && shownKey.current !== pagedKey);
  useEffect(() => {
    if (pagedReady) shownKey.current = pagedKey;
  }, [pagedReady, pagedKey]);

  const rawDeals: DCADeals[] = useMemo(
    () =>
      !serverPaged
        ? windowResult.deals
        : pagedReady
          ? paged.deals
          : (windowPage?.rows ?? []),
    [serverPaged, windowResult.deals, pagedReady, paged.deals, windowPage]
  );

  const live = useLiveDealPnl(serverPaged ? rawDeals : [], {
    enabled: serverPaged && status === 'open',
  });
  const deals = useMemo(() => {
    if (!serverPaged || live.size === 0) return rawDeals;
    return rawDeals.map((d) => {
      const r = live.get(d._id);
      return r ? ({ ...d, unrealizedUsd: r.unrealizedUsd } as DCADeals) : d;
    });
  }, [serverPaged, live, rawDeals]);

  const total = !serverPaged
    ? windowResult.total
    : fromWindow
      ? windowComplete
        ? (windowPage?.matched ?? windowResult.total)
        : windowResult.total
      : paged.total || windowResult.total;

  const serverPaging = useMemo(
    () =>
      serverPaged
        ? {
            serverSide: {
              rowCount: total,
              isFetching: !fromWindow && (fetchPending || paged.isFetching),
              unsupportedSortReason:
                status === 'closed' ? CLOSED_DEAL_SORT_TOOLTIP : undefined,
              onQueryChange,
            },
            fields,
          }
        : undefined,
    [
      serverPaged,
      total,
      fromWindow,
      fetchPending,
      paged.isFetching,
      status,
      onQueryChange,
      fields,
    ]
  );

  return {
    deals,
    serverPaging,
    total,
    serverPaged,
    isLoading: fromWindow
      ? windowResult.isLoading
      : paged.isLoading && rawDeals.length === 0,
    error: windowResult.error ?? paged.error,
  };
}
