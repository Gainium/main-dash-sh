/**
 * The ONE place that builds a server `sortModel` for `dataGridInput`.
 *
 * The backend's `mapDataGridOptionsToMongoOptions` maps `sort: 'desc'` to Mongo
 * `1` (ascending) and `'asc'` to `-1` (descending). That inversion is part of
 * the public contract (the legacy dashboard depends on it) and will not be
 * changed server-side, so every client caller must invert — here, and nowhere
 * else. Callers speak in the direction they MEAN ("largest first" = 'desc').
 */
export type SortDirection = 'asc' | 'desc';

export interface ServerSortItem {
  field: string;
  sort: SortDirection;
}

/** Direction the server must receive to produce `intended`. */
export function toServerSortDirection(intended: SortDirection): SortDirection {
  return intended === 'desc' ? 'asc' : 'desc';
}

/**
 * Build a server `sortModel` from the direction the caller intends.
 * `toServerSortModel('stats.usage', 'desc')` → largest usage first.
 * Only the first item is honoured by the server.
 */
export function toServerSortModel(
  field: string | null | undefined,
  intended: SortDirection
): ServerSortItem[] {
  if (!field) return [];
  return [{ field, sort: toServerSortDirection(intended) }];
}
