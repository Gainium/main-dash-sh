/**
 * Pure mapping from a table's query (page, sort, search, column filters) to
 * the server's `dataGridInput`. No I/O; tested in isolation.
 *
 * The server contract (`mapDataGridOptionsToMongoOptions`): 0-based `page`,
 * `pageSize`, ONE sort item whose direction is inverted (see serverSort.ts),
 * and `filterModel.items[{field, operator, value}]` combined with AND.
 */
import type { DataGridFilterInput } from '../../types';
import { toServerSortModel, type SortDirection } from '../api/serverSort';
import {
  resolveServerFilters,
  type FilterBackend,
  type ServerFilterSpec,
} from './serverFilters';

export interface ServerFilterItem {
  field: string;
  operator: string;
  value: string;
}

export interface ServerBotQuery {
  pageIndex: number;
  pageSize: number;
  /** Sort the caller MEANS (inverted for the server in one place). */
  sort?: { field: string; direction: SortDirection } | null;
  /** Free-text search. */
  search?: string;
  /** Server field the search matches (default: the bot name). */
  searchField?: string;
  filters?: ServerFilterItem[];
}

/** Field the search box maps to for bot lists. */
export const BOT_NAME_FIELD = 'settings.name';

export function toBotDataGridInput(q: ServerBotQuery): DataGridFilterInput {
  const items: ServerFilterItem[] = [...(q.filters ?? [])];
  const search = q.search?.trim();
  if (search) {
    items.push({
      field: q.searchField ?? BOT_NAME_FIELD,
      operator: 'contains',
      value: search,
    });
  }
  const input: DataGridFilterInput = {
    page: Math.max(0, Math.floor(q.pageIndex)),
    pageSize: Math.max(1, Math.floor(q.pageSize)),
  };
  if (q.sort?.field) {
    input.sortModel = toServerSortModel(q.sort.field, q.sort.direction);
  }
  if (items.length) input.filterModel = { items };
  return input;
}

/**
 * Translate a DataTable column filter value into server filter items.
 * Supports the multi-select shape (`string[]` or `{ value: string[] }`) as
 * `isAnyOf`, and a text filter (`{ operator, value }` or a string) as
 * `contains`. Anything else is dropped (the column is not server-filterable
 * for that operator).
 */
export function columnFilterToServerItems(
  field: string,
  value: unknown
): ServerFilterItem[] {
  if (value == null || value === '') return [];
  const arr = Array.isArray(value)
    ? value
    : typeof value === 'object' && Array.isArray((value as { value?: unknown }).value)
      ? ((value as { value: unknown[] }).value as unknown[])
      : null;
  if (arr) {
    const vals = arr.map((v) => String(v)).filter(Boolean);
    return vals.length ? [{ field, operator: 'isAnyOf', value: vals.join(',') }] : [];
  }
  if (typeof value === 'string') {
    return [{ field, operator: 'contains', value }];
  }
  if (typeof value === 'object') {
    const v = (value as { value?: unknown }).value;
    const op = String((value as { operator?: unknown }).operator ?? 'contains');
    if (v == null || v === '') return [];
    const serverOp =
      op === 'equals' || op === 'is'
        ? 'equals'
        : op === 'startsWith' || op === 'endsWith'
          ? op
          : ['=', '!=', '>', '>=', '<', '<='].includes(op)
            ? op
            : 'contains';
    return [{ field, operator: serverOp, value: String(v) }];
  }
  return [];
}

/**
 * Map a DataTable server query (column ids) to a ServerBotQuery (server
 * fields). Columns without a server field are ignored — the table already
 * refuses to sort or filter them in server mode.
 */
export function tableQueryToServerBotQuery(
  q: {
    pageIndex: number;
    pageSize: number;
    sorting: Array<{ id: string; desc: boolean }>;
    columnFilters: Array<{ id: string; value: unknown }>;
    globalFilter: string;
  },
  fields: Record<string, { sort?: string; filter?: string | ServerFilterSpec }>,
  searchField?: string,
  opts: { backend?: FilterBackend; timeZone?: string | null } = {}
): ServerBotQuery & { filtersPending: boolean } {
  const first = q.sorting[0];
  const sortField = first ? fields[first.id]?.sort : undefined;
  const specs: Record<string, ServerFilterSpec> = {};
  for (const [id, f] of Object.entries(fields)) {
    if (f.filter)
      specs[id] =
        typeof f.filter === 'string' ? { field: f.filter, kind: 'text' } : f.filter;
  }
  const resolved = resolveServerFilters(
    q.columnFilters,
    specs,
    opts.backend ?? 'unknown',
    opts.timeZone
  );
  return {
    pageIndex: q.pageIndex,
    pageSize: q.pageSize,
    sort: sortField
      ? { field: sortField, direction: first.desc ? 'desc' : 'asc' }
      : null,
    search: q.globalFilter,
    ...(searchField ? { searchField } : {}),
    filters: resolved.items,
    filtersPending: resolved.pending,
  };
}
