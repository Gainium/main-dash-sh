/**
 * Runner: Vitest (jsdom) —
 * `npx vitest run core/tests/dataTableLockedPins.vitest.test.tsx`.
 *
 * Spec 115 §7.3 (parent repo) — a column the caller locks to a side stays
 * pinned there whatever the saved preferences say, and on phones too (where
 * the table otherwise unpins everything). The pair picker's select column
 * must never scroll out of view.
 */
import React from 'react';
import { describe, expect, test, afterEach, beforeEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table/data-table';
import { useTablePreferencesStore } from '@/stores/tablePreferencesStore';

type Row = { id: string; a: number };
const rows: Row[] = [{ id: 'x', a: 1 }];
const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'a', header: 'A' },
  { id: 'select', header: '', cell: () => <span data-testid="sel">o</span> },
];
const TABLE_ID = 'locked-pins';

const settle = (ms = 50) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

const mockViewport = (mobile: boolean) => {
  (globalThis as Record<string, unknown>).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.matchMedia = ((q: string) => ({
    matches: mobile && q.includes('max-width'),
    media: q,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
};

const selectCellStyle = () =>
  (document.querySelector('[data-testid="sel"]')?.closest('td') as HTMLElement)
    ?.style;

beforeEach(() => {
  useTablePreferencesStore.getState().resetAllPreferences();
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

const renderTable = () =>
  render(
    <DataTable
      columns={columns}
      data={rows}
      tableId={TABLE_ID}
      defaultView="table"
      getRowId={(r) => r.id}
      lockedPinnedColumns={{ right: ['select'] }}
    />
  );

describe('spec 115 §7.3 locked pinned columns', () => {
  test('pinned right on desktop', async () => {
    mockViewport(false);
    renderTable();
    await settle();
    expect(selectCellStyle()?.position).toBe('sticky');
    expect(selectCellStyle()?.right).toBe('0px');
  });

  test('pinned right on a phone, where other pins are dropped', async () => {
    mockViewport(true);
    renderTable();
    await settle();
    expect(selectCellStyle()?.position).toBe('sticky');
  });

  test('saved preferences without the pin do not unpin it', async () => {
    mockViewport(false);
    useTablePreferencesStore
      .getState()
      .setPinnedColumns(TABLE_ID, { left: ['select'], right: [] });
    renderTable();
    await settle();
    expect(selectCellStyle()?.right).toBe('0px');
  });
});

describe('spec 115 §7.4 column sizes apply with resizing off', () => {
  const sized: ColumnDef<Row, unknown>[] = [
    { accessorKey: 'id', header: 'ID', size: 120 },
    { accessorKey: 'a', header: 'A', size: 300 },
  ];
  const widths = () =>
    [...document.querySelectorAll('thead tr:first-child th')].map(
      (t) => (t as HTMLElement).style.width
    );

  test('headers take the declared sizes', async () => {
    mockViewport(false);
    render(
      <DataTable
        columns={sized}
        data={rows}
        tableId="sized"
        defaultView="table"
        getRowId={(r) => r.id}
        enableColumnResizing={false}
      />
    );
    await settle();
    expect(widths()).toEqual(['120px', '300px']);
  });

  test('saved widths are ignored when the table cannot be resized', async () => {
    mockViewport(false);
    useTablePreferencesStore
      .getState()
      .setColumnWidths('sized', { id: 339, a: 50 });
    render(
      <DataTable
        columns={sized}
        data={rows}
        tableId="sized"
        defaultView="table"
        getRowId={(r) => r.id}
        enableColumnResizing={false}
      />
    );
    await settle();
    expect(widths()).toEqual(['120px', '300px']);
  });
});

describe('spec 115 §7.5 auto-resize measures the right columns', () => {
  type R = { id: string; h: string; a: string; b: string };
  const data: R[] = [{ id: '1', h: 'h', a: 'a', b: 'b' }];
  const cols: ColumnDef<R, unknown>[] = [
    { accessorKey: 'h', header: 'H', minSize: 300 },
    { accessorKey: 'a', header: 'A', minSize: 40, maxSize: 60 },
    { accessorKey: 'b', header: 'B', minSize: 200 },
  ];

  test('a hidden column does not shift widths onto its neighbours, and max sizes hold', async () => {
    mockViewport(false);
    render(
      <DataTable
        columns={cols}
        data={data}
        tableId="autosize"
        defaultView="table"
        getRowId={(r) => r.id}
        defaultColumnVisibility={{ h: false }}
      />
    );
    await settle(400); // auto-resize runs 150ms after data changes
    const widths = [...document.querySelectorAll('thead tr:first-child th')].map(
      (t) => (t as HTMLElement).style.width
    );
    expect(widths).toEqual(['60px', '200px']);
  });
});

describe('spec 115 §7.7 a header that is a control has no overlay', () => {
  test('meta.headerControls: false hides the drag / menu overlay', async () => {
    mockViewport(false);
    const cols: ColumnDef<Row, unknown>[] = [
      { accessorKey: 'id', header: 'ID' },
      {
        id: 'select',
        header: () => <input type="checkbox" aria-label="all" />,
        meta: { headerControls: false },
      },
    ];
    render(
      <DataTable
        columns={cols}
        data={rows}
        tableId="header-controls"
        defaultView="table"
        getRowId={(r) => r.id}
      />
    );
    await settle();
    const ths = [...document.querySelectorAll('thead tr:first-child th')];
    const overlays = (th: Element) =>
      [...th.querySelectorAll('.absolute')].filter(
        (el) => !el.classList.contains('hidden') && el.querySelector('button')
      ).length;
    expect(overlays(ths[0])).toBeGreaterThan(0);
    expect(overlays(ths[1])).toBe(0);
  });
});
