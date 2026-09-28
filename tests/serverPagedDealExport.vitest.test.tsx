/**
 * Runner: `NODE_ENV=development npx vitest run core/tests/serverPagedDealExport.vitest.test.tsx`
 * from the cloud parent.
 *
 * Spec 071 (parent repo) — "Export as CSV/JSON" on a server-paged deal list
 * wrote only the rows of the visible page: in server mode the DataTable holds
 * one page, and the deal table gave it no way to fetch the rest.
 */
import { describe, expect, it, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import React, { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ColumnDef, Row } from '@tanstack/react-table';

import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useDealStore } from '@/stores/live';
import { useTablePreferencesStore } from '@/stores/tablePreferencesStore';
import { useDealTablePaging } from '@/hooks/useDealTablePaging';
import { DataTable } from '@/components/ui/data-table/data-table';
import type { DataTableServerSide } from '@/components/ui/data-table/serverSide';

const SERVER_PAGE_CAP = 500;
const TOTAL = 1234;
const requests: Array<{
  page?: number;
  pageSize?: number;
  sortModel?: unknown;
  filterModel?: { items?: Array<{ field?: string; value?: unknown }> };
}> = [];

const dealAt = (i: number) => ({
  _id: `deal-${i}`,
  botId: 'bot-1',
  userId: 'u1',
  status: 'closed',
  paperContext: false,
  updateTime: 1_700_000_000_000,
  symbol: { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT' },
  stats: { unrealizedProfit: 0 },
  profit: { totalUsd: i },
});

vi.mock('@/helper/price', () => ({
  default: () => () => {},
  getLocalPrices: () => [],
}));
const noopFetchMultipleFees = async () => [];
vi.mock('@/hooks/useUserFeesService', () => ({
  useUserFees: () => ({ fetchMultipleFees: noopFetchMultipleFees }),
}));
vi.mock('@/hooks/useUsdRate', () => ({ useUsdRate: () => ({ rate: 1 }) }));
vi.mock('@/hooks/useLargeAccount', () => ({
  useLargeAccount: () => ({ active: true, source: 'server' }),
}));
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  class FakeGraphQLClient {
    async request(_query: string, variables: unknown) {
      const grid = (
        variables as { input?: { dataGridInput?: (typeof requests)[number] } }
      )?.input?.dataGridInput;
      if (grid) requests.push(grid);
      const page = grid?.page ?? 0;
      const pageSize = Math.min(SERVER_PAGE_CAP, grid?.pageSize ?? SERVER_PAGE_CAP);
      const start = page * pageSize;
      const result = Array.from(
        { length: Math.max(0, Math.min(pageSize, TOTAL - start)) },
        (_, i) => dealAt(start + i)
      );
      return {
        dcaDealList: {
          status: 'OK',
          reason: null,
          total: TOTAL,
          data: { page: null, totalPages: null, totalResults: null, result },
        },
      };
    }
  }
  return { ...actual, GraphQLClient: FakeGraphQLClient };
});

const exported: Array<Row<unknown>[]> = [];
vi.mock('@/components/ui/data-table/exportCsv', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    downloadCsv: (_name: string, _headers: unknown, rows: Row<unknown>[]) => {
      exported.push(rows);
    },
  };
});

let root: Root | null = null;
let host: HTMLElement | null = null;
function renderHook<R>(hook: () => R): () => R {
  const ref: { current: R | null } = { current: null };
  function Probe() {
    ref.current = hook();
    return null;
  }
  host = document.createElement('div');
  document.body.appendChild(host);
  const r = createRoot(host);
  root = r;
  act(() => {
    r.render(
      createElement(
        MemoryRouter,
        null,
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(Probe) as ReactNode
        ) as ReactNode
      )
    );
  });
  return () => {
    if (ref.current === null) throw new Error('hook did not render');
    return ref.current;
  };
}

async function settle(rounds = 60) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

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
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  requests.length = 0;
  exported.length = 0;
  queryClient.clear();
  localStorage.clear();
  useTablePreferencesStore.getState().resetAllPreferences();
  useAuthStore.setState({
    tokens: { accessToken: 'test-token' },
    user: { id: 'u1', email: 'user@example.com' },
  } as never);
  useUIStore.setState({ isLiveTrading: true, tradingMode: 'live' } as never);
  useDealStore.setState({ deals: {}, _hasHydrated: true } as never);
});
afterEach(() => {
  const r = root;
  if (r) act(() => r.unmount());
  host?.remove();
  root = null;
  host = null;
  cleanup();
});

describe('spec 071 §1.1 — the server-paged deal list can fetch every match', () => {
  it('walks all pages with the table query, not the on-screen page size', async () => {
    const get = renderHook(() =>
      useDealTablePaging({
        status: 'closed',
        terminal: false,
        tableId: 'dca-bot-deals-trades-closed',
      })
    );
    await settle();
    const paging = get().serverPaging;
    if (!paging) throw new Error('expected server paging');
    act(() =>
      paging.serverSide.onQueryChange({
        pageIndex: 3,
        pageSize: 10,
        sorting: [{ id: 'closeTime', desc: false }],
        columnFilters: [],
        globalFilter: 'BTC',
      })
    );
    await settle(40);
    expect(get().deals.length).toBe(10);

    const fetchAll = (
      get().serverPaging as { fetchAllDeals?: () => Promise<unknown[]> }
    ).fetchAllDeals;
    expect(typeof fetchAll).toBe('function');
    if (!fetchAll) return;
    requests.length = 0;
    const all = (await fetchAll()) as Array<{ _id: string }>;
    expect(all.length).toBe(TOTAL);
    expect(new Set(all.map((d) => d._id)).size).toBe(TOTAL);
    expect(requests.map((r) => r.page)).toEqual([0, 1, 2]);
    for (const r of requests) {
      expect(r.pageSize).toBe(SERVER_PAGE_CAP);
      expect(JSON.stringify(r.sortModel)).toContain('closeTime');
      const items = r.filterModel?.items ?? [];
      expect(items.some((it) => it.field === 'status')).toBe(true);
      expect(items.some((it) => it.value === 'BTC')).toBe(true);
    }
  });
});

describe('spec 071 §1.1/§1.2 — DataTable server-mode export', () => {
  type T = { id: string; n: number };
  const page: T[] = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, n: i }));
  const full: T[] = Array.from({ length: 25 }, (_, i) => ({ id: `r${i}`, n: i }));
  const columns: ColumnDef<T, unknown>[] = [
    { accessorKey: 'id', header: 'ID' },
    { accessorKey: 'n', header: 'N' },
  ];
  const serverSide: DataTableServerSide = {
    rowCount: 25,
    isFetching: false,
    onQueryChange: () => {},
  };

  async function exportCsv() {
    // The toolbar's ⋮ trigger: a button carrying an sr-only label, outside
    // the aria-hidden measurement copies.
    const trigger = ([...document.querySelectorAll('button')].find(
      (b) => b.querySelector('.sr-only') && !b.closest('[aria-hidden]')
    ) ?? null) as HTMLElement | null;
    if (!trigger) throw new Error('export menu trigger not found');
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.click(trigger);
    await settle(5);
    fireEvent.click(await screen.findByText('Export as CSV'));
    await settle(10);
  }

  const renderTable = (getExportData?: () => Promise<T[] | null>) => {
    // A search the SERVER answered: none of these rows contain it, so a
    // client-side re-filter would drop every exported row.
    useTablePreferencesStore.getState().setGlobalFilter?.('srv-tbl', 'zzz');
    render(
      <DataTable
        columns={columns}
        data={page}
        tableId="srv-tbl"
        defaultView="table"
        getRowId={(r) => r.id}
        serverSide={serverSide}
        getExportData={getExportData}
      />
    );
  };

  it('without getExportData it writes only the loaded page (the pre-fix deal table)', async () => {
    renderTable();
    await settle(5);
    await exportCsv();
    expect(exported.at(-1)?.length).toBe(10);
  });

  it('with getExportData it writes every server match, not re-filtered or sliced', async () => {
    renderTable(async () => full);
    await settle(5);
    await exportCsv();
    expect(exported.at(-1)?.length).toBe(25);
  });
});
