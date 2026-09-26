/**
 * Serving a table page from rows already held client-side ("the window"),
 * instead of asking the server. Pure; no I/O.
 *
 * A server-paged table only needs the server when the page it shows cannot
 * be derived from what is loaded: a page beyond the loaded window, or a
 * sort / filter / search over a window that is not the whole set. Everything
 * else — the first pages in default order, or any query over a complete
 * window — is answered locally with no request.
 *
 * `previewPage` is also used while a server request is in flight, so a sort
 * or search click updates the rows at once from the loaded window; the
 * server's answer then replaces the preview.
 */
import type { ServerBotQuery } from './serverBotQuery';

function get(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const k of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

function comparable(v: unknown): number | string | undefined {
  if (v == null || v === '') return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string') {
    const n = Number(v);
    if (v.trim() !== '' && Number.isFinite(n)) return n;
    return v.toLowerCase();
  }
  if (typeof v === 'boolean') return v ? 1 : 0;
  return undefined;
}

/** The query asks for the table's default order with no narrowing. */
export function isDefaultQuery(
  q: ServerBotQuery,
  defaultSort?: { field: string; direction: 'asc' | 'desc' } | null
): boolean {
  if (q.search?.trim()) return false;
  if (q.filters?.length) return false;
  if (!q.sort) return true;
  return (
    !!defaultSort &&
    q.sort.field === defaultSort.field &&
    q.sort.direction === defaultSort.direction
  );
}

/**
 * The page can be answered from the loaded window: either the window is the
 * whole set (any query), or the query is the default order and the page lies
 * inside the window.
 */
export function servesFromWindow(
  q: ServerBotQuery,
  loaded: number,
  windowIsComplete: boolean,
  defaultSort?: { field: string; direction: 'asc' | 'desc' } | null
): boolean {
  if (windowIsComplete) return true;
  return (
    isDefaultQuery(q, defaultSort) &&
    (q.pageIndex + 1) * q.pageSize <= loaded
  );
}

/**
 * Apply the query (search, filters, sort, page) to held rows. Rows keep their
 * given order unless a sort is requested (or `defaultSort` is given).
 * Returns the page and the number of matching rows.
 */
export function previewPage<T>(
  rows: readonly T[],
  q: ServerBotQuery,
  opts: {
    searchField?: string | null;
    defaultSort?: { field: string; direction: 'asc' | 'desc' } | null;
  } = {}
): { rows: T[]; matched: number } {
  let out = rows as T[];
  const search = q.search?.trim().toLowerCase();
  const searchField = opts.searchField === undefined ? 'settings.name' : opts.searchField;
  if (search && searchField) {
    out = out.filter((r) =>
      String(get(r, searchField) ?? '').toLowerCase().includes(search)
    );
  }
  for (const f of q.filters ?? []) {
    const val = String(f.value);
    if (f.operator === 'isAnyOf') {
      const set = new Set(val.split(','));
      out = out.filter((r) => set.has(String(get(r, f.field))));
    } else if (f.operator === 'equals') {
      out = out.filter((r) => String(get(r, f.field)) === val);
    } else if (f.operator === 'contains') {
      const v = val.toLowerCase();
      out = out.filter((r) =>
        String(get(r, f.field) ?? '').toLowerCase().includes(v)
      );
    }
  }
  const sort = q.sort ?? opts.defaultSort ?? null;
  if (sort) {
    const dir = sort.direction === 'desc' ? -1 : 1;
    out = [...out].sort((a, b) => {
      const x = comparable(get(a, sort.field));
      const y = comparable(get(b, sort.field));
      // Missing values last in either direction (the server's descending
      // order also puts them last).
      if (x === undefined && y === undefined) return 0;
      if (x === undefined) return 1;
      if (y === undefined) return -1;
      return (x > y ? 1 : x < y ? -1 : 0) * dir;
    });
  }
  const start = q.pageIndex * q.pageSize;
  return { rows: out.slice(start, start + q.pageSize), matched: out.length };
}
