import React, { Profiler } from 'react';
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
import {
  toFilterSpec,
  type DataTableServerSide,
  type ServerTableQuery,
} from '@/components/ui/data-table/serverSide';
import { useTablePreferencesStore } from '@/stores/tablePreferencesStore';
import { CLOSED_DEAL_SERVER_FIELDS } from '@/lib/botList/dealListServerFields';
import {
  resolveServerFilters,
  singleFilterStatus,
  type FilterBackend,
  type ServerFilterSpec,
} from '@/lib/botList/serverFilters';
import { dateFilterBounds } from '@/components/ui/data-table/filter-logic';

// A server-paged closed-deals table restored from a shared link or saved
// preferences. Filters the server cannot apply must never be dropped: they
// stay in the URL, in saved state and as chips, marked "Not applied", and
// are left out of the query. Filters the server can apply are sent. The
// footer never shows an unlabelled page-only sum.
//
// Runner: Vitest (jsdom) — `npx vitest run core/tests/serverModeGhostFilters.vitest.test.tsx`.

type Deal = { botName: string; closeTime: string; cost: number };

const rows: Deal[] = [
  { botName: 'coinbase-dca', closeTime: '2026-09-26T10:00:00Z', cost: 10 },
  { botName: 'btc-grid', closeTime: '2026-09-25T10:00:00Z', cost: 20 },
];

const columns: ColumnDef<Deal, unknown>[] = [
  { accessorKey: 'botName', header: 'BOT NAME', meta: { filterType: 'string' } },
  { accessorKey: 'closeTime', header: 'CLOSE TIME', meta: { filterType: 'date' } },
  {
    accessorKey: 'cost',
    header: 'COST',
    meta: { filterType: 'number', enableTotalsRow: true },
  },
];

const TABLE_ID = 'dca-bot-deals-trades-closed';

// The exact filter set the reporter's closed-deals link carried.
const REPORTED_PARAM =
  'cost%3Aequals%3A%7CbotName%3Acontains%3Aco%7CcloseTime%3Aequals%3A2026-09-26';

const SPECS: Record<string, ServerFilterSpec> = Object.fromEntries(
  Object.entries(CLOSED_DEAL_SERVER_FIELDS)
    .map(([id, f]) => [id, toFilterSpec(f.filter)] as const)
    .filter((e): e is readonly [string, ServerFilterSpec] => !!e[1])
);

const makeServerSide = (
  backend: FilterBackend,
  onQuery: (q: ServerTableQuery) => void = () => {},
  totals: DataTableServerSide['totals'] = null
): DataTableServerSide => ({
  rowCount: 5703,
  onQueryChange: onQuery,
  filterStatus: (columnId, filter) =>
    singleFilterStatus(SPECS[columnId], filter, backend, 'UTC'),
  totals,
});

const setUrl = (search: string) =>
  window.history.replaceState({}, '', `/bot${search}`);

let renders = 0;
const renderTable = (
  tableId: string,
  serverSide: DataTableServerSide | undefined
) =>
  render(
    <Profiler id="table" onRender={() => void renders++}>
      <DataTable
        columns={columns}
        data={rows}
        tableId={tableId}
        defaultView="table"
        enableColumnFilters
        enableQuickFilterBar
        serverSide={serverSide}
      />
    </Profiler>
  );

const filterBadge = () => {
  const buttons = screen.queryAllByTitle(/filters$/i);
  const counts = buttons
    .map((b) => b.querySelector('.rounded-full')?.textContent ?? null)
    .filter((t): t is string => t !== null);
  return counts[0] ?? null;
};

const chips = () =>
  [...document.querySelectorAll('[data-testid="filter-chip"]')].map((c) => ({
    text: c.textContent ?? '',
    status: c.getAttribute('data-filter-status'),
  }));

const savedFilters = (tableId: string): ColumnFiltersState =>
  useTablePreferencesStore.getState().preferences[tableId]?.columnFilters ?? [];

const settle = (ms = 400) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
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
  renders = 0;
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('server-paged closed deals: filters are applied or visibly marked, never dropped', () => {
  test('the reported link keeps its filters in the URL, as chips, and in saved state (older backend)', async () => {
    const tableId = `${TABLE_ID}-url`;
    setUrl(`?filters_${tableId}=${REPORTED_PARAM}&view=deals`);
    let last: ServerTableQuery | null = null;

    renderTable(tableId, makeServerSide('old', (q) => (last = q)));
    await settle();

    // Both non-empty filters are counted and shown (the empty cost one is not a filter).
    expect(filterBadge()).toBe('2');
    const c = chips();
    expect(c).toHaveLength(2);
    const bot = c.find((x) => /BOT NAME/i.test(x.text));
    const close = c.find((x) => /CLOSE TIME/i.test(x.text));
    // botName needs a newer backend: shown, marked, not applied.
    expect(bot?.status).toBe('unavailable');
    expect(bot?.text).toMatch(/Not applied/);
    // A whole day needs two bounds on one field, which an older backend
    // merges into one (it would become "on or before"): shown, not applied.
    expect(close?.status).toBe('unavailable');
    // The link survives in the URL, and the saved state keeps both.
    expect(window.location.search).toContain(`filters_${tableId}`);
    expect(window.location.search).toContain('view=deals');
    expect(savedFilters(tableId).map((f) => f.id).sort()).toEqual(
      expect.arrayContaining(['botName', 'closeTime'])
    );
    // The table still reports every filter to its caller (who decides what to send).
    expect((last as ServerTableQuery | null)?.columnFilters.map((f) => f.id)).toEqual(
      expect.arrayContaining(['botName', 'closeTime'])
    );
  });

  test('on a newer backend the same filters all apply', async () => {
    const tableId = `${TABLE_ID}-new`;
    setUrl(`?filters_${tableId}=${REPORTED_PARAM}`);
    renderTable(tableId, makeServerSide('new'));
    await settle();
    expect(chips().every((c) => c.status === 'applied')).toBe(true);
  });

  test('while the backend check is pending, newer-field filters show "applying…"', async () => {
    const tableId = `${TABLE_ID}-pending`;
    setUrl(`?filters_${tableId}=${REPORTED_PARAM}`);
    renderTable(tableId, makeServerSide('unknown'));
    await settle();
    const bot = chips().find((x) => /BOT NAME/i.test(x.text));
    expect(bot?.status).toBe('pending');
    expect(bot?.text).toMatch(/applying/);
  });

  test('client mode is unchanged: every saved filter counts and filters rows', async () => {
    const tableId = `${TABLE_ID}-client`;
    useTablePreferencesStore.getState().setColumnFilters(tableId, [
      { id: 'botName', value: [{ operator: 'contains', value: 'co' }] },
    ]);
    renderTable(tableId, undefined);
    await settle();
    expect(filterBadge()).toBe('1');
    expect(chips()[0]?.status).toBe('applied');
  });

  test('render count settles (no render loop) with unapplied filters restored', async () => {
    const tableId = `${TABLE_ID}-loop`;
    setUrl(`?filters_${tableId}=${REPORTED_PARAM}`);
    renderTable(tableId, makeServerSide('old'));
    await settle(600);
    const afterMount = renders;
    await settle(800);
    expect(renders - afterMount).toBeLessThanOrEqual(1);
    expect(afterMount).toBeLessThan(40);
  });
});

describe('server-paged footer totals', () => {
  test('without server totals the sum is labelled as this page only', async () => {
    renderTable(`${TABLE_ID}-page`, makeServerSide('old'));
    await settle();
    expect(document.querySelector('[data-testid="footer-page-total"]')).not.toBeNull();
  });

  test('with server totals the footer shows the filtered-set total, unlabelled as page', async () => {
    renderTable(
      `${TABLE_ID}-totals`,
      makeServerSide('new', () => {}, { cost: { value: 12345.5 } })
    );
    await settle();
    expect(document.querySelector('[data-testid="footer-page-total"]')).toBeNull();
    expect(document.body.textContent).toContain('12345.50');
  });

  test('client mode keeps its plain total', async () => {
    renderTable(`${TABLE_ID}-plain`, undefined);
    await settle();
    expect(document.querySelector('[data-testid="footer-page-total"]')).toBeNull();
  });
});

describe('resolveServerFilters on the reported set', () => {
  const reported = [
    { id: 'cost', value: [{ operator: 'equals', value: '' }] },
    { id: 'botName', value: [{ operator: 'contains', value: 'co' }] },
    { id: 'closeTime', value: [{ operator: 'equals', value: '2026-09-26' }] },
  ];
  const day = dateFilterBounds('2026-09-26', 'UTC') ?? { start: 0, end: 0 };

  test('older backend: nothing it would misapply is sent; both filters are shown unapplied', () => {
    const r = resolveServerFilters(reported, SPECS, 'old', 'UTC');
    expect(r.items).toEqual([]);
    expect(r.unapplied.sort()).toEqual(['botName', 'closeTime']);
    expect(r.pending).toBe(false);
  });

  test('older backend: a one-sided day filter is applied (one item per field)', () => {
    const r = resolveServerFilters(
      [{ id: 'closeTime', value: [{ operator: 'onOrAfter', value: '2026-09-26' }] }],
      SPECS,
      'old',
      'UTC'
    );
    expect(r.items).toEqual([
      { field: 'closeTime', operator: '>=', value: String(day.start) },
    ]);
    expect(r.unapplied).toEqual([]);
  });

  test('older backend: a second filter on a field already sent is not applied', () => {
    const r = resolveServerFilters(
      [
        {
          id: 'closeTime',
          value: [
            { operator: 'onOrAfter', value: '2026-09-01' },
            { operator: 'onOrBefore', value: '2026-09-26' },
          ],
        },
      ],
      SPECS,
      'old',
      'UTC'
    );
    expect(r.items).toHaveLength(1);
    expect(r.unapplied).toEqual(['closeTime']);
  });

  test('newer backend: the whole reported set is sent', () => {
    const r = resolveServerFilters(reported, SPECS, 'new', 'UTC');
    expect(r.items).toEqual([
      { field: 'botName', operator: 'contains', value: 'co' },
      { field: 'closeTime', operator: '>=', value: String(day.start) },
      { field: 'closeTime', operator: '<=', value: String(day.end) },
    ]);
    expect(r.unapplied).toEqual([]);
  });

  test('unknown backend: the filtered fetch waits', () => {
    expect(resolveServerFilters(reported, SPECS, 'unknown', 'UTC').pending).toBe(true);
  });

  test('cost ranges and pairs map to the server operators', () => {
    const r = resolveServerFilters(
      [
        { id: 'cost', value: [{ operator: 'between', value: ['5', '50'] }] },
        { id: 'symbol', value: [{ operator: 'isAnyOf', value: ['BTCUSDT', 'ETHUSDT'] }] },
      ],
      SPECS,
      'new',
      'UTC'
    );
    expect(r.items).toEqual([
      { field: 'cost', operator: '>=', value: '5' },
      { field: 'cost', operator: '<=', value: '50' },
      { field: 'pair', operator: 'isAnyOf', value: 'BTCUSDT,ETHUSDT' },
    ]);
  });
});
