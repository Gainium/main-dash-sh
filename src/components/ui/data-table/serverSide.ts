import type { ColumnFiltersState, SortingState } from '@tanstack/react-table';

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
}

export const SERVER_SORT_UNAVAILABLE_TOOLTIP =
  "Sorting by this column isn't available for large accounts — use the search box";

/** Server field names for a column: what it sorts and filters by. */
export interface ColumnServerFields {
  sort?: string;
  filter?: string;
}

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
