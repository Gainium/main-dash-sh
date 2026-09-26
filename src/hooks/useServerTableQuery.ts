import { useCallback, useEffect, useRef, useState } from 'react';
import type { ServerTableQuery } from '../components/ui/data-table/serverSide';
import { useTablePreferencesStore } from '../stores/tablePreferencesStore';

/** DataTable's own default page size when a table has no saved preference. */
const DATA_TABLE_DEFAULT_PAGE_SIZE = 10;

/**
 * The query a DataTable will report on mount, read from its saved
 * preferences — so the first request already matches the table (a default
 * guess would cost a second request once the table reports its real page
 * size or sort).
 */
export function initialTableQuery(
  tableId: string | undefined,
  defaultPageSize = DATA_TABLE_DEFAULT_PAGE_SIZE
): ServerTableQuery {
  const prefs = tableId
    ? useTablePreferencesStore.getState().preferences[tableId]
    : undefined;
  return {
    pageIndex: prefs?.pagination?.pageIndex ?? 0,
    pageSize: prefs?.pagination?.pageSize ?? defaultPageSize,
    sorting: prefs?.sorting ?? [],
    columnFilters: prefs?.columnFilters ?? [],
    globalFilter: prefs?.globalFilter ?? '',
  };
}

/** Rapid changes inside this window are coalesced into the last one. */
const BURST_MS = 300;
/** Search text is fetched once it has been still this long. */
const SEARCH_SETTLE_MS = 250;

/**
 * Holds a server table's query in two forms:
 * - `query`: applied at once on every change, for the instant preview built
 *   from the loaded rows;
 * - `fetchQuery`: what the server is asked for. The first change after a
 *   quiet period goes out immediately (a single header click fetches at
 *   once); further changes within a burst (clicking through asc/desc, typing)
 *   are coalesced and only the last one is fetched.
 */
export function useServerTableQuery(tableId?: string) {
  const [query, setQuery] = useState<ServerTableQuery>(() =>
    initialTableQuery(tableId)
  );
  const [fetchQuery, setFetchQuery] = useState<ServerTableQuery>(query);
  const [reported, setReported] = useState(false);
  const lastChange = useRef(0);
  const lastSearch = useRef(query.globalFilter);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const onQueryChange = useCallback((next: ServerTableQuery) => {
    setReported(true);
    const same = (prev: ServerTableQuery) =>
      JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    setQuery(same);
    const apply = () => setFetchQuery(same);
    const now = Date.now();
    const quiet = now - lastChange.current > BURST_MS;
    lastChange.current = now;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    // Typing is always a burst: fetch only once the text settles, never the
    // first keystroke on its own (a second request would follow anyway).
    const typing = next.globalFilter !== lastSearch.current;
    lastSearch.current = next.globalFilter;
    if (quiet && !typing) apply();
    else timer.current = setTimeout(apply, typing ? SEARCH_SETTLE_MS : BURST_MS);
  }, []);

  return { query, fetchQuery, reported, onQueryChange };
}
