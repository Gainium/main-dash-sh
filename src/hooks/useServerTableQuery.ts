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

/**
 * Holds a server table's query. The first change after a quiet period
 * applies immediately (a single header click fetches at once); further
 * changes within a burst (double-clicking through asc/desc/none, typing)
 * are coalesced and only the last one is applied.
 */
export function useServerTableQuery(tableId?: string) {
  const [query, setQuery] = useState<ServerTableQuery>(() =>
    initialTableQuery(tableId)
  );
  const [reported, setReported] = useState(false);
  const lastChange = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const onQueryChange = useCallback((next: ServerTableQuery) => {
    setReported(true);
    const apply = () =>
      setQuery((prev) =>
        JSON.stringify(prev) === JSON.stringify(next) ? prev : next
      );
    const now = Date.now();
    const quiet = now - lastChange.current > BURST_MS;
    lastChange.current = now;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (quiet) apply();
    else timer.current = setTimeout(apply, BURST_MS);
  }, []);

  return { query, reported, onQueryChange };
}
