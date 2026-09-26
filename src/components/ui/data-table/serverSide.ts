import type { ColumnFiltersState, SortingState } from '@tanstack/react-table';
import type {
  ServerFilterSpec,
  SingleFilterStatus,
} from '../../../lib/botList/serverFilters';

/** What a server-side DataTable asks its caller to fetch. */
export interface ServerTableQuery {
  pageIndex: number;
  pageSize: number;
  sorting: SortingState;
  columnFilters: ColumnFiltersState;
  globalFilter: string;
}

export interface DataTableServerSide {
  /** Total rows on the server for the current filters. */
  rowCount: number;
  /** A page request is in flight (the previous page stays on screen). */
  isFetching?: boolean;
  /** Tooltip on the greyed sort icon of a column the server cannot sort. */
  unsupportedSortReason?: string;
  /** Called with the table's query whenever paging, sort, search or filters change. */
  onQueryChange: (query: ServerTableQuery) => void;
  /**
   * Whether one filter reaches the server. Filters the server cannot apply
   * are kept (chip, URL, saved state) and marked; they are never dropped.
   * Omitted: every filter counts as applied.
   */
  filterStatus?: (columnId: string, filter: unknown) => SingleFilterStatus;
  /**
   * Aggregates over the whole FILTERED server set, by column id. A totals
   * cell without an entry here sums only the rows on this page and is
   * labelled "Page total".
   */
  totals?: Record<string, ServerColumnTotal> | null;
}

export interface ServerColumnTotal {
  value: number;
  /** Deals the sum covers, when fewer than the filtered count. */
  coverage?: { covered: number; count: number } | null;
}

export const SERVER_SORT_UNAVAILABLE_TOOLTIP =
  "Sorting by this column isn't available for large accounts — use the search box";

/** Server field names for a column: what it sorts and filters by. */
export interface ColumnServerFields {
  sort?: string;
  /** A server text field, or a full filter capability. */
  filter?: string | ServerFilterSpec;
}

/** Column filter capability from a `filter` entry (a bare field = text). */
export function toFilterSpec(
  filter: string | ServerFilterSpec | undefined
): ServerFilterSpec | undefined {
  if (!filter) return undefined;
  return typeof filter === 'string' ? { field: filter, kind: 'text' } : filter;
}

/** Tooltip on a filter the server does not apply. */
export const SERVER_FILTER_UNAVAILABLE_TOOLTIP =
  "Not applied: the server can't filter this column yet for large accounts. Your filter is kept and will apply automatically when it can.";

export const SERVER_FILTER_PENDING_TOOLTIP =
  'Checking whether the server can apply this filter…';

/**
 * Attach `meta.serverSortField` / `meta.serverFilterField` to the columns a
 * server can sort or filter, keyed by column id (or accessorKey). Columns not
 * in the map are left alone and, in server mode, show a greyed sort icon.
 */
export function withServerFields<C extends { id?: string; meta?: unknown }>(
  columns: C[],
  fields: Record<string, ColumnServerFields>
): C[] {
  return columns.map((col) => {
    const key =
      col.id ?? (col as { accessorKey?: string }).accessorKey ?? undefined;
    const f = key ? fields[key] : undefined;
    if (!f) return col;
    return {
      ...col,
      meta: {
        ...(col.meta as object | undefined),
        ...(f.sort ? { serverSortField: f.sort } : {}),
        ...(f.filter ? { serverFilterField: f.filter } : {}),
      },
    };
  });
}
