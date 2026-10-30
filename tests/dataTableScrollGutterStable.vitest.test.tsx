/**
 * Runner: Vitest (jsdom) —
 * `NODE_ENV=development npx vitest run core/tests/dataTableScrollGutterStable.vitest.test.tsx`
 * (from the parent repo).
 *
 * Spec 140 §2 (parent repo) — the table's scroll container must not change
 * its own box when it gains or loses horizontal overflow. Reserving a gutter
 * only while the table overflows shrinks a width:100% table back inside the
 * container, which removes the overflow, which drops the gutter: a layout
 * loop that redraws every frame when the table is within a gutter's width of
 * the container. The scroll indicators overlay the content instead.
 */
import React from 'react';
import { describe, expect, test, afterEach, beforeEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table/data-table';
import { useTablePreferencesStore } from '@/stores/tablePreferencesStore';

type Row = { id: string; a: number };
const rows: Row[] = [{ id: 'x', a: 1 }];
const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'a', header: 'A' },
];

const settle = (ms = 50) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

// jsdom has no layout: drive the scroller's extents by hand.
let scrollWidth = 1000;
const clientWidth = 1000;
const restore: Array<() => void> = [];
const stub = (prop: string, get: () => number) => {
  const prev = Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop);
  Object.defineProperty(HTMLElement.prototype, prop, {
    configurable: true,
    get,
  });
  restore.push(() =>
    prev
      ? Object.defineProperty(HTMLElement.prototype, prop, prev)
      : Reflect.deleteProperty(HTMLElement.prototype, prop)
  );
};

beforeEach(() => {
  useTablePreferencesStore.getState().resetAllPreferences();
  (globalThis as Record<string, unknown>).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
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
  stub('scrollWidth', () => scrollWidth);
  stub('clientWidth', () => clientWidth);
  stub('offsetWidth', () => clientWidth);
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  restore.splice(0).reverse().forEach((undo) => undo());
});

const scroller = () =>
  document.querySelector('.data-table-container > .overflow-auto') as HTMLElement;
const gutter = (el: HTMLElement) =>
  el.className.split(/\s+/).filter((c) => /^p[lrx]-/.test(c)).sort().join(' ');

describe('spec 140 §2 scroll gutter does not depend on overflow', () => {
  test('same horizontal padding with and without overflow; indicator still shows', async () => {
    scrollWidth = 1000;
    render(
      <DataTable columns={columns} data={rows} tableId="gutter-stable" defaultView="table" getRowId={(r) => r.id} />
    );
    await settle(150);
    const sc = scroller();
    expect(sc).toBeTruthy();
    const fits = gutter(sc);
    expect(document.querySelector('[title="Scroll right"]')).toBeNull();

    // Table now 2px wider than the container (the reported edge case).
    scrollWidth = 1002;
    fireEvent.scroll(sc);
    await settle();
    expect(document.querySelector('[title="Scroll right"]')).not.toBeNull();
    expect(gutter(sc)).toBe(fits);

    // Scrolled into the middle: left indicator shows, box still unchanged.
    sc.scrollLeft = 1;
    fireEvent.scroll(sc);
    await settle();
    expect(document.querySelector('[title="Scroll left"]')).not.toBeNull();
    expect(gutter(sc)).toBe(fits);
  });

  // §3 — the trigger: a clickable row's hover must not scale it wider than
  // the table (a transform counts toward the scroller's overflow).
  test('clickable rows have no hover scale', async () => {
    render(
      <DataTable columns={columns} data={rows} tableId="gutter-hover" defaultView="table" getRowId={(r) => r.id} onRowClick={() => {}} />
    );
    await settle(150);
    const tr = document.querySelector('tbody tr') as HTMLElement;
    expect(tr.className).toContain('cursor-pointer');
    expect(tr.className).not.toMatch(/hover:scale/);
  });
});
