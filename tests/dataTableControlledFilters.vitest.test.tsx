/**
 * Runner: Vitest (jsdom) —
 * `npx vitest run core/tests/dataTableControlledFilters.vitest.test.tsx`.
 *
 * Spec 115 §7 (parent repo) — DataTable takes column filters from its caller
 * (`columnFilters` / `onColumnFiltersChange`, mirroring `sorting`) and reports
 * the rows passing every filter (`onFilteredRowsChange`). Without the props it
 * keeps reading its persisted filters, as before.
 */
import React from 'react';
import { describe, expect, test, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import type { ColumnDef, ColumnFiltersState } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table/data-table';
import { useTablePreferencesStore } from '@/stores/tablePreferencesStore';

type Pair = { id: string; quote: string; minOrder: number };
const rows: Pair[] = [
  { id: 'BTC-USDT', quote: 'USDT', minOrder: 5 },
  { id: 'ETH-USDC', quote: 'USDC', minOrder: 5 },
  { id: 'XAUT-USDT', quote: 'USDT', minOrder: 50 },
];
const columns: ColumnDef<Pair, unknown>[] = [
  { accessorKey: 'id', header: 'Pair' },
  { accessorKey: 'quote', header: 'Quote', meta: { filterType: 'array' } },
  { accessorKey: 'minOrder', header: 'Min order', meta: { filterType: 'number' } },
];
const TABLE_ID = 'controlled-filters';

const visible = () =>
  [...document.querySelectorAll('tbody tr')]
    .map((tr) => tr.querySelector('td')?.textContent?.trim() ?? '')
    .filter(Boolean);

const settle = (ms = 50) =>
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
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

const usdtOnly: ColumnFiltersState = [
  { id: 'quote', value: { operator: 'isAnyOf', value: ['USDT'] } },
];

describe('spec 115 §7.1 controlled column filters', () => {
  test('filters passed by the caller apply, and win over persisted ones', async () => {
    useTablePreferencesStore
      .getState()
      .setColumnFilters(TABLE_ID, [
        { id: 'quote', value: { operator: 'isAnyOf', value: ['USDC'] } },
      ]);
    render(
      <DataTable
        columns={columns}
        data={rows}
        tableId={TABLE_ID}
        defaultView="table"
        getRowId={(r) => r.id}
        columnFilters={usdtOnly}
        onColumnFiltersChange={() => {}}
      />
    );
    await settle();
    expect(visible()).toEqual(['BTC-USDT', 'XAUT-USDT']);
  });

  test('without the props the persisted filters still apply', async () => {
    useTablePreferencesStore.getState().setColumnFilters(TABLE_ID, usdtOnly);
    render(
      <DataTable
        columns={columns}
        data={rows}
        tableId={TABLE_ID}
        defaultView="table"
        getRowId={(r) => r.id}
      />
    );
    await settle();
    expect(visible()).toEqual(['BTC-USDT', 'XAUT-USDT']);
  });
});

describe('spec 115 §7.2 onFilteredRowsChange', () => {
  test('reports the filtered originals, and again when the filters change', async () => {
    const onFilteredRowsChange = vi.fn();
    const view = render(
      <DataTable
        columns={columns}
        data={rows}
        tableId={TABLE_ID}
        defaultView="table"
        getRowId={(r) => r.id}
        columnFilters={usdtOnly}
        onColumnFiltersChange={() => {}}
        onFilteredRowsChange={onFilteredRowsChange}
      />
    );
    await settle();
    const last = () =>
      (onFilteredRowsChange.mock.calls.at(-1)?.[0] as Pair[]).map((r) => r.id);
    expect(last()).toEqual(['BTC-USDT', 'XAUT-USDT']);

    view.rerender(
      <DataTable
        columns={columns}
        data={rows}
        tableId={TABLE_ID}
        defaultView="table"
        getRowId={(r) => r.id}
        columnFilters={[
          ...usdtOnly,
          { id: 'minOrder', value: { operator: 'lessThanOrEqual', value: 10 } },
        ]}
        onColumnFiltersChange={() => {}}
        onFilteredRowsChange={onFilteredRowsChange}
      />
    );
    await settle();
    expect(last()).toEqual(['BTC-USDT']);
  });
});

describe('spec 115 §7.2 rows are reported in display order', () => {
  test('a sort is reflected in the reported order', async () => {
    const onFilteredRowsChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={rows}
        tableId={TABLE_ID}
        defaultView="table"
        getRowId={(r) => r.id}
        sorting={[{ id: 'minOrder', desc: true }]}
        onSortingChange={() => {}}
        onFilteredRowsChange={onFilteredRowsChange}
      />
    );
    await settle();
    const ids = (onFilteredRowsChange.mock.calls.at(-1)?.[0] as Pair[]).map(
      (r) => r.id
    );
    expect(ids[0]).toBe('XAUT-USDT');
  });
});
