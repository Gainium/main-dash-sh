import React from 'react';
import { describe, test, expect, afterEach, beforeAll, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import type { DragEndEvent } from '@dnd-kit/core';

// Bug #655 — "Moving columns on the Trading Bots / Deals page".
// Reporter 6a8b1db88e06bef801d752bd.
//
// Enabling a column from the Columns button and then dragging it did nothing
// until the page was remounted (navigate to Bots and back). `DataTable` built
// its drag-source order from a `useMemo` keyed on `[table, columnOrder]`;
// react-table's `table` object is created ONCE (`useState` in
// `useReactTable`) so its identity never changes, and toggling visibility
// doesn't touch `columnOrder` — so the memo still held the pre-toggle header
// list, the just-enabled column resolved to `indexOf(...) === -1`, and
// `handleDragEnd` bailed out.
//
// Same file also guards the second half: header groups contain only VISIBLE
// columns, so persisting the dragged order verbatim dropped every hidden
// column out of `columnOrder` and reset its saved position.
//
// The real `DndContext` is rendered; we only capture its `onDragEnd` prop so
// the drop can be delivered deterministically in jsdom (which has no layout,
// so dnd-kit's pointer sensors + closestCenter cannot resolve a target).

const box = vi.hoisted(() => ({
  onDragEnd: null as ((event: DragEndEvent) => void) | null,
}));

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    DndContext: (props: React.ComponentProps<typeof actual.DndContext>) => {
      box.onDragEnd = props.onDragEnd as (event: DragEndEvent) => void;
      return React.createElement(actual.DndContext, props);
    },
  };
});

import { DataTable } from '@/components/ui/data-table/data-table';
import { useTablePreferencesStore } from '@/stores/tablePreferencesStore';

type Row = { a: string; b: string; c: string; d: string; e: string };

const columns: ColumnDef<Row, unknown>[] = [
  { id: 'colA', accessorKey: 'a', header: 'Alpha' },
  { id: 'colB', accessorKey: 'b', header: 'Bravo' },
  { id: 'colC', accessorKey: 'c', header: 'Charlie' },
  { id: 'colD', accessorKey: 'd', header: 'Delta' },
  { id: 'colE', accessorKey: 'e', header: 'Echo' },
];

const data: Row[] = [{ a: '1', b: '2', c: '3', d: '4', e: '5' }];

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

afterEach(() => {
  cleanup();
  localStorage.clear();
  box.onDragEnd = null;
});

/** Rendered header labels, in visual order. */
function headers(container: HTMLElement): string[] {
  const row = container.querySelector('thead tr');
  if (!row) return [];
  return [...row.querySelectorAll('th')].map((th) => {
    const content = th.querySelector('[data-header-content]');
    return (content ?? th).textContent?.trim() ?? '';
  });
}

/**
 * Toggle a column's visibility exactly the way the Columns dropdown does:
 * `column.toggleVisibility()` lands in `onColumnVisibilityChange`, which
 * writes the table-preferences store. Going through the store directly keeps
 * the component MOUNTED (a remount is the very workaround this bug is about)
 * and avoids driving Radix's portal menu in jsdom.
 */
function setVisibility(tableId: string, visibility: Record<string, boolean>) {
  act(() => {
    useTablePreferencesStore.getState().setColumnVisibility(tableId, visibility);
  });
}

function drag(activeId: string, overId: string) {
  expect(box.onDragEnd, 'DndContext onDragEnd was never wired').toBeTruthy();
  act(() => {
    box.onDragEnd?.({
      active: { id: activeId },
      over: { id: overId },
    } as unknown as DragEndEvent);
  });
}

describe('bug #655 — reordering a column enabled in the same page view', () => {
  test('a column enabled from the Columns menu can be dragged without a remount', () => {
    const tableId = 'bug655-enable-then-drag';
    // The reporter's real starting state: a table whose order has already been
    // persisted once. That matters — with no persisted order `columnOrder`
    // falls back to a memo over the ColumnDef list, whose identity churns as
    // the widget re-renders and incidentally thawed the stale memo. Users who
    // have ever moved or pinned a column get the deterministic failure.
    act(() => {
      useTablePreferencesStore
        .getState()
        .setColumnOrder(tableId, ['colA', 'colB', 'colC', 'colD', 'colE']);
    });

    const { container } = render(
      <DataTable
        tableId={tableId}
        columns={columns}
        data={data}
        defaultColumnVisibility={{ colE: false }}
        enableCardView={false}
      />
    );

    expect(headers(container)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);

    // The reporter's step 1: add the column from the Columns button.
    setVisibility(tableId, { colE: true });
    expect(headers(container)).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
      'Delta',
      'Echo',
    ]);

    // The reporter's step 2: move it — in the SAME page view, no navigation.
    drag('colE', 'colA');

    expect(headers(container)).toEqual([
      'Echo',
      'Alpha',
      'Bravo',
      'Charlie',
      'Delta',
    ]);
  });

  test('dragging does not reset a hidden column’s saved position', () => {
    const tableId = 'bug655-hidden-position';
    act(() => {
      useTablePreferencesStore
        .getState()
        .setColumnOrder(tableId, ['colA', 'colB', 'colC', 'colD', 'colE']);
    });

    const { container } = render(
      <DataTable
        tableId={tableId}
        columns={columns}
        data={data}
        defaultColumnVisibility={{ colC: false }}
        enableCardView={false}
      />
    );

    expect(headers(container)).toEqual(['Alpha', 'Bravo', 'Delta', 'Echo']);

    // Move a visible column while `colC` is hidden.
    drag('colE', 'colA');
    expect(headers(container)).toEqual(['Echo', 'Alpha', 'Bravo', 'Delta']);

    // Bring the hidden column back: it belongs between Bravo and Delta, where
    // the user left it — not appended to the end of the table.
    setVisibility(tableId, { colC: true });
    expect(headers(container)).toEqual([
      'Echo',
      'Alpha',
      'Bravo',
      'Charlie',
      'Delta',
    ]);
  });
});
