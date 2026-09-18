import React from 'react';
import {
  describe,
  test,
  expect,
  afterEach,
  beforeAll,
  beforeEach,
  vi,
} from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import type { ColumnDef, ColumnFiltersState } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table/data-table';
import { useTablePreferencesStore } from '@/stores/tablePreferencesStore';

// Filters set on a list must survive leaving the page and coming back.
//
// A DataTable keeps its filters in TWO places: the durable per-table
// preferences store (`table-preferences-storage`, localStorage) and the
// `filters_<tableId>` URL query param. The store is the source of truth — the
// param is a debounced, lossy MIRROR of it, written 250 ms after a change with
// `history.replaceState`.
//
// Two defects compounded:
//   1. the mirror goes stale, because the debounce is cancelled by the very
//      unmount that navigating away causes, and
//   2. on EVERY mount the mirror was read back and written into the store
//      wholesale — so a stale param did not merely display stale filters, it
//      PERMANENTLY overwrote the saved ones, and any column the param omitted
//      was deleted.
//
// Together they turned a `botName contains 'co'` filter back into an older
// `notContains`, and dropped a `closeTime` filter the param never carried.
//
// These tests drive the REAL DataTable against the REAL preferences store.

type Deal = { botName: string; closeTime: string };

const rows: Deal[] = [
  { botName: 'coinbase-dca', closeTime: '2026-09-18' },
  { botName: 'btc-grid', closeTime: '2026-09-10' },
];

const columns: ColumnDef<Deal, unknown>[] = [
  { accessorKey: 'botName', header: 'BOT NAME', meta: { filterType: 'string' } },
  { accessorKey: 'closeTime', header: 'CLOSE TIME', meta: { filterType: 'date' } },
];

// The closed-deals list, whose table id OpenOrdersWidget builds as
// `${widgetId}-trades-${statusFilter}`. Each test uses its own suffix because a
// `filters_<tableId>` param is adopted once per DOCUMENT per table id, and
// every test here shares one module instance = one document.
const TABLE_ID = 'dca-bot-deals-trades-closed';

/** Two filters, in the shape the column-filter UI persists. */
const SAVED_FILTERS: ColumnFiltersState = [
  { id: 'botName', value: [{ operator: 'contains', value: 'co' }] },
  { id: 'closeTime', value: [{ operator: 'after', value: '2026-09-18' }] },
];

/** A stale link: an OLDER botName condition, and no closeTime at all. */
const STALE_PARAM = 'botName%3AnotContains%3Aco';

const savedFilters = (tableId: string) =>
  useTablePreferencesStore.getState().preferences[tableId]?.columnFilters ?? [];

const conditionOf = (filters: ColumnFiltersState, id: string) => {
  const entry = filters.find((f) => f.id === id);
  if (!entry) return undefined;
  const list = Array.isArray(entry.value) ? entry.value : [entry.value];
  return list[0] as { operator?: string; value?: unknown } | undefined;
};

const setUrl = (search: string) =>
  window.history.replaceState({}, '', `/bot${search}`);

const renderTable = (tableId: string) =>
  render(
    <DataTable
      columns={columns}
      data={rows}
      tableId={tableId}
      defaultView="table"
    />
  );

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
  vi.useRealTimers();
});

describe('a stale filters_<tableId> param must not destroy saved filters', () => {
  // Precondition, not the defect itself: this is HOW the param goes stale.
  // Documented here so the fix is not mistaken for a cure of the staleness.
  test('a filter change lost to the unmount inside the 250ms debounce never reaches the URL', () => {
    const tableId = `${TABLE_ID}-debounce`;
    vi.useFakeTimers();
    setUrl(`?filters_${tableId}=botName%3Acontains%3Aco`);

    const view = renderTable(tableId);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // The user now adds the Close Time filter and navigates away immediately.
    act(() => {
      useTablePreferencesStore
        .getState()
        .setColumnFilters(tableId, SAVED_FILTERS);
    });
    act(() => {
      vi.advanceTimersByTime(100); // still inside the debounce
    });
    view.unmount();
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Store has both filters; the URL mirror never learned about closeTime.
    expect(savedFilters(tableId)).toHaveLength(2);
    expect(window.location.search).not.toContain('closeTime');
  });

  test('an SPA remount does not re-apply the stale param over the saved filters', async () => {
    const tableId = `${TABLE_ID}-remount`;
    // Mount #1 is the genuine document load; the URL carries no filters yet.
    const first = renderTable(tableId);
    act(() => {
      useTablePreferencesStore
        .getState()
        .setColumnFilters(tableId, SAVED_FILTERS);
    });
    first.unmount();

    // Whatever the debounce last managed to write is now stale — here, the
    // older botName condition with no closeTime at all.
    setUrl(`?filters_${tableId}=${STALE_PARAM}&view=deals`);

    // Navigating back to the page remounts the table in the SAME document.
    renderTable(tableId);

    const after = savedFilters(tableId);
    expect(conditionOf(after, 'botName')).toMatchObject({
      operator: 'contains',
      value: 'co',
    });
    expect(conditionOf(after, 'closeTime')).toMatchObject({
      operator: 'after',
      value: '2026-09-18',
    });

    // The mirror is still written on the way out, so the stale param heals
    // instead of lingering to catch the next mount.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(decodeURIComponent(window.location.search)).toContain(
      'botName:contains:co|closeTime:after:2026-09-18'
    );
  });

  test('a genuine inbound link never deletes a saved filter for a column it omits', () => {
    const tableId = `${TABLE_ID}-inbound`;
    useTablePreferencesStore
      .getState()
      .setColumnFilters(tableId, SAVED_FILTERS);
    setUrl(`?filters_${tableId}=${STALE_PARAM}&view=deals`);

    // First mount in this document = a real inbound/shared link, so the param
    // IS authoritative for the column it names...
    renderTable(tableId);

    const after = savedFilters(tableId);
    expect(conditionOf(after, 'botName')).toMatchObject({
      operator: 'notContains',
      value: 'co',
    });
    // ...but it says nothing about closeTime, so that filter must survive.
    expect(conditionOf(after, 'closeTime')).toMatchObject({
      operator: 'after',
      value: '2026-09-18',
    });
  });

  // 5302c8d's guarantee ("table filters survive a reload"), which this fix
  // must not undo: a real document load still takes its filters from the link.
  test('a reload still restores the filters the link carries', () => {
    const tableId = `${TABLE_ID}-reload`;
    setUrl(
      `?filters_${tableId}=botName%3Acontains%3Aco%7CcloseTime%3Aafter%3A2026-09-18`
    );

    renderTable(tableId);

    const after = savedFilters(tableId);
    expect(conditionOf(after, 'botName')).toMatchObject({
      operator: 'contains',
      value: 'co',
    });
    expect(conditionOf(after, 'closeTime')).toMatchObject({
      operator: 'after',
      value: '2026-09-18',
    });
  });
});
