import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ColumnServerFields,
  DataTableServerSide,
  ServerTableQuery,
} from '../components/ui/data-table/serverSide';
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

const DEFAULT_DEAL_QUERY: ServerTableQuery = {
  pageIndex: 0,
  pageSize: 25,
  sorting: [],
  columnFilters: [],
  globalFilter: '',
};

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
}

/**
 * A deals table (open or closed) that pages on the server when the account is
 * in large-account mode, or as soon as the first client window comes back
 * partial (`total > loaded`) — then it stays server-paged for the session so
 * the list never silently shows a subset.
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
  /** Column → server field maps for this table (default: the Deals tab's). */
  fields?: {
    open: Record<string, ColumnServerFields>;
    closed: Record<string, ColumnServerFields>;
  };
}): DealTablePaging {
  const { status, terminal } = opts;
  const largeAccount = useLargeAccount();
  const [latchedPartial, setLatchedPartial] = useState(false);
  const [query, setQuery] = useState<ServerTableQuery | null>(null);
  const serverPaged = !!opts.force || largeAccount.active || latchedPartial;
  const fields =
    status === 'closed'
      ? (opts.fields?.closed ?? CLOSED_DEAL_SERVER_FIELDS)
      : (opts.fields?.open ?? OPEN_DEAL_SERVER_FIELDS);

  // Until the table reports its first query, fetch its first page with the
  // default order (a table with no rows may never mount to report one).
  const q = query ?? DEFAULT_DEAL_QUERY;
  const dataGrid = useMemo<DataGridFilterInput | undefined>(() => {
    if (!serverPaged || !query) return undefined;
    const sq = tableQueryToServerBotQuery(query, fields, DEAL_SEARCH_FIELD);
    const { page: _p, pageSize: _s, ...rest } = toBotDataGridInput(sq);
    return rest;
  }, [serverPaged, query, fields]);

  const result = useDcaDeals(
    {
      terminal,
      status: status === 'closed' ? DCADealStatusEnum.closed : DCADealStatusEnum.open,
      ...(opts.botId ? { botId: opts.botId } : {}),
      ...(dataGrid ? { dataGrid } : {}),
    },
    serverPaged
      ? {
          enabled: opts.enabled !== false,
          page: q.pageIndex,
          pageSize: q.pageSize,
        }
      : { enabled: opts.enabled !== false }
  );

  // Safety net: the first client window came back capped → page on the server.
  useEffect(() => {
    if (!serverPaged && result.isPartial) setLatchedPartial(true);
  }, [serverPaged, result.isPartial]);

  const live = useLiveDealPnl(serverPaged ? result.deals : [], {
    enabled: serverPaged && status === 'open',
  });
  const deals = useMemo(() => {
    if (!serverPaged || live.size === 0) return result.deals;
    return result.deals.map((d) => {
      const r = live.get(d._id);
      return r ? ({ ...d, unrealizedUsd: r.unrealizedUsd } as DCADeals) : d;
    });
  }, [serverPaged, live, result.deals]);

  const onQueryChange = useCallback((next: ServerTableQuery) => {
    setQuery((prev) =>
      prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next
    );
  }, []);

  const serverPaging = useMemo(
    () =>
      serverPaged
        ? {
            serverSide: {
              rowCount: result.total,
              isFetching: result.isFetching,
              unsupportedSortReason:
                status === 'closed' ? CLOSED_DEAL_SORT_TOOLTIP : undefined,
              onQueryChange,
            },
            fields,
          }
        : undefined,
    [serverPaged, result.total, result.isFetching, status, onQueryChange, fields]
  );

  return {
    deals,
    serverPaging,
    total: result.total,
    serverPaged,
    isLoading: result.isLoading,
  };
}
