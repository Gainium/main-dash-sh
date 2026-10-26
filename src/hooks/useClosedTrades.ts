import { keepPreviousData } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import {
  toFilterSpec,
  type ColumnServerFields,
  type DataTableServerSide,
} from '../components/ui/data-table/serverSide';
import { dealQueries } from '../lib/api/GraphQLQueries-deal-queries';
import {
  CLOSED_DEAL_SERVER_FIELDS,
  DEAL_SEARCH_FIELD,
} from '../lib/botList/dealListServerFields';
import {
  tableQueryToServerBotQuery,
  toBotDataGridInput,
} from '../lib/botList/serverBotQuery';
import {
  resolveServerFilters,
  singleFilterStatus,
  type ServerFilterSpec,
} from '../lib/botList/serverFilters';
import type { ComboDeals, DCADeals } from '../types';
import type { GridBot } from '../types/gridBot';
import { useAccountTimeZone } from './useAccountTimeZone';
import { useDealFilterBackend } from './useDealListServerSupport';
import { useGraphQL } from './useGraphQL';
import { useServerTableQuery } from './useServerTableQuery';

export type ClosedTradeKind = 'dca' | 'terminal' | 'combo' | 'grid';

interface ClosedTradeListData {
  order: { kind: ClosedTradeKind; id: string }[];
  dca: DCADeals[];
  terminal: DCADeals[];
  combo: ComboDeals[];
  grid: GridBot[];
}

const CLOSED_TRADES_SORT_TOOLTIP =
  'Closed trades sort by open or close time only — use the search box to find a pair';

const EMPTY: ClosedTradeListData = {
  order: [],
  dca: [],
  terminal: [],
  combo: [],
  grid: [],
};

export interface ClosedTrades extends ClosedTradeListData {
  /** Pass to OpenOrdersWidget `serverPaging`. */
  serverPaging: {
    serverSide: DataTableServerSide;
    fields: Record<string, ColumnServerFields>;
  };
  total: number;
  isLoading: boolean;
}

/**
 * The Trades page's closed trades — closed DCA, terminal and combo deals and
 * stopped grid bots — one server page at a time (main-app spec 200). Closed
 * lists run to tens of thousands of rows, so this table always pages on the
 * server; `order` is the page's display order across the four kinds.
 */
export function useClosedTrades(opts: {
  enabled: boolean;
  paperContext: boolean;
  /** The DataTable's tableId (its saved page size/sort seed the first query). */
  tableId: string;
}): ClosedTrades {
  const { enabled, paperContext, tableId } = opts;
  const timeZone = useAccountTimeZone();
  const { query, fetchQuery, onQueryChange } = useServerTableQuery(tableId);
  const fields = CLOSED_DEAL_SERVER_FIELDS;
  const backend = useDealFilterBackend(enabled);
  const filterOpts = useMemo(
    () => ({ backend, timeZone }),
    [backend, timeZone]
  );
  const fetchSq = useMemo(
    () =>
      tableQueryToServerBotQuery(
        fetchQuery,
        fields,
        DEAL_SEARCH_FIELD,
        filterOpts
      ),
    [fetchQuery, fields, filterOpts]
  );
  const specs = useMemo(() => {
    const out: Record<string, ServerFilterSpec> = {};
    for (const [id, f] of Object.entries(fields)) {
      const spec = toFilterSpec(f.filter);
      if (spec) out[id] = spec;
    }
    return out;
  }, [fields]);
  const resolvedNow = useMemo(
    () => resolveServerFilters(query.columnFilters, specs, backend, timeZone),
    [query.columnFilters, specs, backend, timeZone]
  );
  const filterStatus = useCallback(
    (columnId: string, filter: unknown) =>
      resolvedNow.statusOf.get(filter) ??
      singleFilterStatus(specs[columnId], filter, backend, timeZone),
    [resolvedNow, specs, backend, timeZone]
  );

  const result = useGraphQL<ClosedTradeListData>(
    'closedTradeList',
    dealQueries.closedTradeList({ dataGridInput: toBotDataGridInput(fetchSq) }),
    {
      paperContext,
      // A filter waiting on the backend probe holds the fetch.
      enabled: enabled && !fetchSq.filtersPending,
      // The previous page stays on screen while the next one loads.
      placeholderData: keepPreviousData,
    }
  );
  const ok = result.data?.status === 'OK';
  const data = ok && result.data?.data ? result.data.data : EMPTY;
  const total = ok ? Number((result.data as { total?: number }).total ?? 0) : 0;

  const serverSide = useMemo<DataTableServerSide>(
    () => ({
      rowCount: total,
      isFetching:
        result.isFetching ||
        JSON.stringify(query) !== JSON.stringify(fetchQuery) ||
        !!fetchSq.filtersPending,
      unsupportedSortReason: CLOSED_TRADES_SORT_TOOLTIP,
      onQueryChange,
      filterStatus,
      totals: null,
    }),
    [
      total,
      result.isFetching,
      query,
      fetchQuery,
      fetchSq.filtersPending,
      onQueryChange,
      filterStatus,
    ]
  );
  const serverPaging = useMemo(
    () => ({ serverSide, fields }),
    [serverSide, fields]
  );

  return {
    ...data,
    serverPaging,
    total,
    isLoading: enabled && result.isLoading,
  };
}
