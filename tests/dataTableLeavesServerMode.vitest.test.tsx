/**
 * Runner: Vitest (jsdom) —
 * `npx vitest run core/tests/dataTableLeavesServerMode.vitest.test.tsx`.
 *
 * Spec 070 §1.4 (parent repo) — a table that leaves server mode while mounted
 * (its list turned out not to be capped) sorts and pages on the client again.
 * `useReactTable` MERGES each render's options into the previous ones, so the
 * server-mode `manualSorting` / `manualPagination` / `manualFiltering` stayed
 * `true` once the server options were no longer spread in: header clicks
 * changed the sort state but the rows never moved, and the page size was
 * ignored.
 */
import React from 'react';
import { describe, expect, test, afterEach, beforeAll, beforeEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table/data-table';
import type { DataTableServerSide } from '@/components/ui/data-table/serverSide';
import { useTablePreferencesStore } from '@/stores/tablePreferencesStore';

type Deal = { id: string; pnl: number };
const rows: Deal[] = [
  { id: 'a', pnl: 3 },
  { id: 'b', pnl: -5 },
  { id: 'c', pnl: 1 },
];
const columns: ColumnDef<Deal, unknown>[] = [
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'pnl', header: 'PNL', meta: { serverSortField: 'pnl' } },
];
const TABLE_ID = 'leaves-server-mode';
const serverSide: DataTableServerSide = {
  rowCount: 3,
  isFetching: false,
  onQueryChange: () => {},
};

const Table = ({ server }: { server: boolean }) => (
  <DataTable
    columns={columns}
    data={rows}
    tableId={TABLE_ID}
    defaultView="table"
    getRowId={(r) => r.id}
    serverSide={server ? serverSide : undefined}
  />
);

const order = () =>
  [...document.querySelectorAll('tbody tr')].map(
    (tr) => tr.querySelector('td')?.textContent?.trim() ?? ''
  );

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

describe('spec 070 §1.4 — DataTable leaving server mode', () => {
  test('a header click sorts the rows after the table leaves server mode', async () => {
    const view = render(<Table server />);
    await settle();
    view.rerender(<Table server={false} />);
    await settle();
    expect(order()).toEqual(['a', 'b', 'c']);

    const th = [...document.querySelectorAll('thead th')].find((h) =>
      h.textContent?.includes('PNL')
    ) as HTMLElement;
    fireEvent.click(th); // first click reveals the header controls
    fireEvent.click(th); // second click sorts ascending
    await settle();
    expect(
      useTablePreferencesStore.getState().preferences[TABLE_ID]?.sorting
    ).toEqual([{ id: 'pnl', desc: false }]);
    expect(order()).toEqual(['b', 'c', 'a']);
  });
});
