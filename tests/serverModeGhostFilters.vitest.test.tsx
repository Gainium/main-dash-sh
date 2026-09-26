import React from 'react';
import {
  describe,
  test,
  expect,
  afterEach,
  beforeAll,
  beforeEach,
} from 'vitest';
import { render, cleanup, act, screen } from '@testing-library/react';
import type { ColumnDef, ColumnFiltersState } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table/data-table';
import type { DataTableServerSide } from '@/components/ui/data-table/serverSide';
import { useTablePreferencesStore } from '@/stores/tablePreferencesStore';

// Spec 068 — a server-paged table must not count filters it cannot apply.
//
// In server mode a column without `meta.serverFilterField` is made
// unfilterable, so the filter bar shows no chip (and no Reset) for it. A filter
// on such a column restored from the URL or from saved preferences was still
// counted on the Filters button — "Filters 2" with nothing to see or clear —
// and kept rewriting itself into `filters_<tableId>`.

type Deal = { botName: string; closeTime: string; cost: number };

const rows: Deal[] = [
  { botName: 'coinbase-dca', closeTime: '2026-09-26', cost: 10 },
  { botName: 'btc-grid', closeTime: '2026-09-25', cost: 20 },
];

const columns: ColumnDef<Deal, unknown>[] = [
  { accessorKey: 'botName', header: 'BOT NAME', meta: { filterType: 'string' } },
  { accessorKey: 'closeTime', header: 'CLOSE TIME', meta: { filterType: 'date' } },
  { accessorKey: 'cost', header: 'COST', meta: { filterType: 'number' } },
];

const TABLE_ID = 'dca-bot-deals-trades-closed';

// The filter set a closed-deals link carried (§2 of the spec).
const REPORTED_PARAM =
  'cost%3Aequals%3A%7CbotName%3Acontains%3Aco%7CcloseTime%3Aequals%3A2026-09-26';

const serverSide: DataTableServerSide = {
  rowCount: 5703,
  onQueryChange: () => {},
};

const setUrl = (search: string) =>
  window.history.replaceState({}, '', `/bot${search}`);

const renderTable = (
  tableId: string,
  opts: { server?: boolean; cols?: ColumnDef<Deal, unknown>[] } = {}
) =>
  render(
    <DataTable
      columns={opts.cols ?? columns}
      data={rows}
      tableId={tableId}
      defaultView="table"
      enableColumnFilters
      enableQuickFilterBar
      serverSide={opts.server === false ? undefined : serverSide}
    />
  );

/** The count badge on the toolbar's Filters button, or null when none. */
const filterBadge = () => {
  const buttons = screen.queryAllByTitle(/filters$/i);
  const counts = buttons
    .map((b) => b.querySelector('.rounded-full')?.textContent ?? null)
    .filter((t): t is string => t !== null);
  return counts[0] ?? null;
};

const savedFilters = (tableId: string): ColumnFiltersState =>
  useTablePreferencesStore.getState().preferences[tableId]?.columnFilters ?? [];

const flushUrlSync = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 400));
  });

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as Record<string, unknown>).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!window.matchMedia) {
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }
});

beforeEach(() => {
  useTablePreferencesStore.getState().resetAllPreferences();
  setUrl('');
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('server mode ignores filters on columns the server cannot filter', () => {
  // §3.1 / §3.2
  test('filters restored from the link are not counted and leave the URL', async () => {
    const tableId = `${TABLE_ID}-url`;
    setUrl(`?filters_${tableId}=${REPORTED_PARAM}&view=deals`);

    renderTable(tableId);
    await flushUrlSync();

    expect(filterBadge()).toBeNull();
    expect(window.location.search).not.toContain(`filters_${tableId}`);
    expect(window.location.search).toContain('view=deals');
  });

  // §3.1
  test('filters restored from saved preferences are not counted', () => {
    const tableId = `${TABLE_ID}-saved`;
    useTablePreferencesStore.getState().setColumnFilters(tableId, [
      { id: 'botName', value: [{ operator: 'contains', value: 'co' }] },
      { id: 'closeTime', value: [{ operator: 'equals', value: '2026-09-26' }] },
    ]);

    renderTable(tableId);

    expect(filterBadge()).toBeNull();
  });

  // §3.3 — a column the server CAN filter keeps its filter.
  test('a filter on a server-filterable column still counts', () => {
    const tableId = `${TABLE_ID}-supported`;
    useTablePreferencesStore.getState().setColumnFilters(tableId, [
      { id: 'botName', value: [{ operator: 'contains', value: 'co' }] },
      { id: 'closeTime', value: [{ operator: 'equals', value: '2026-09-26' }] },
    ]);
    const cols = columns.map((c) =>
      (c as { accessorKey?: string }).accessorKey === 'botName'
        ? { ...c, meta: { ...(c.meta as object), serverFilterField: 'botName' } }
        : c
    );

    renderTable(tableId, { cols });

    expect(filterBadge()).toBe('1');
  });

  // §3.4 — client mode is unchanged, and saved filters are not destroyed.
  test('client mode still counts them, and server mode did not delete them', () => {
    const tableId = `${TABLE_ID}-client`;
    const saved: ColumnFiltersState = [
      { id: 'botName', value: [{ operator: 'contains', value: 'co' }] },
      { id: 'closeTime', value: [{ operator: 'equals', value: '2026-09-26' }] },
    ];
    useTablePreferencesStore.getState().setColumnFilters(tableId, saved);

    const view = renderTable(tableId);
    expect(filterBadge()).toBeNull();
    view.unmount();

    renderTable(tableId, { server: false });
    expect(filterBadge()).toBe('2');
    expect(savedFilters(tableId)).toHaveLength(2);
  });
});
