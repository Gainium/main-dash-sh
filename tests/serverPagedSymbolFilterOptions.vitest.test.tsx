/**
 * Runner: `NODE_ENV=development npx vitest run core/tests/serverPagedSymbolFilterOptions.vitest.test.tsx`
 * from the cloud parent.
 *
 * Spec 080 (parent repo) — on a server-paged deal list the Symbol column's
 * "is any of" dropdown offered only the symbols of the page on screen: in
 * server mode the table holds one page, and the option list is built from the
 * table's rows. A pair that is in the filtered list but on another page could
 * not be picked, so several pairs could not be chosen at once.
 */
import { describe, expect, it, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import React, { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  type ColumnDef,
} from '@tanstack/react-table';

import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useDealStore } from '@/stores/live';
import { useTablePreferencesStore } from '@/stores/tablePreferencesStore';
import { useDealTablePaging } from '@/hooks/useDealTablePaging';
import { ColumnFilter } from '@/components/ui/data-table/filter-components';
import {
  withServerFields,
  type ColumnServerFields,
} from '@/components/ui/data-table/serverSide';
import { SYMBOL_COLUMN_FILTER_META } from '@/components/widgets/shared/symbolColumnFilterMeta';

const SERVER_PAGE_CAP = 500;
const TOTAL = 1234;
// The reporter's shape: today's PEPE deal sits deep in the list, never on the
// first page, while the first window (500 rows) does hold it.
const PEPE_AT = 17;
const symbolAt = (i: number) =>
  i === PEPE_AT ? 'PEPE-USDC' : `S${String(i % 40).padStart(2, '0')}-USDC`;
const requests: Array<{
  page?: number;
  pageSize?: number;
  filterModel?: { items?: Array<{ field?: string; operator?: string; value?: unknown }> };
}> = [];

const dealAt = (i: number) => {
  const symbol = symbolAt(i);
  return {
    _id: `deal-${i}`,
    botId: 'bot-1',
    userId: 'u1',
    status: 'closed',
    paperContext: false,
    updateTime: 1_700_000_000_000,
    symbol: { symbol, baseAsset: symbol.split('-')[0], quoteAsset: 'USDC' },
    stats: { unrealizedProfit: 0 },
    profit: { totalUsd: i },
  };
};

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
  useLargeAccount: () => ({ active: false, source: 'auto' }),
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

type PageRow = { symbol: string };

/** The REAL ColumnFilter over a server-mode table holding one page. */
const Harness: React.FC<{
  page: PageRow[];
  fields: Record<string, ColumnServerFields>;
}> = ({ page, fields }) => {
  const columns = React.useMemo<ColumnDef<PageRow, unknown>[]>(
    () =>
      withServerFields(
        [{ accessorKey: 'symbol', header: 'Symbol', meta: SYMBOL_COLUMN_FILTER_META }],
        fields
      ),
    [fields]
  );
  // eslint-disable-next-line react-hooks/incompatible-library -- test harness, never memoized
  const table = useReactTable({
    data: page,
    columns,
    manualFiltering: true,
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });
  const column = table.getColumn('symbol');
  if (!column) throw new Error('symbol column missing');
  return <ColumnFilter column={column} />;
};

function optionsShown(
  page: PageRow[],
  fields: Record<string, ColumnServerFields>,
  search = ''
): string[] {
  const { container } = render(<Harness page={page} fields={fields} />);
  const input = container.querySelector('input[type="text"]') as HTMLInputElement;
  fireEvent.click(input);
  if (search) fireEvent.change(input, { target: { value: search } });
  return Array.from(
    document.querySelectorAll('[data-slot="popover-content"] div.cursor-pointer > span')
  ).map((el) => (el.textContent ?? '').trim());
}

async function serverPagedOnPageOne(pairs?: string[]) {
  const get = renderHook(() =>
    useDealTablePaging({
      status: 'closed',
      terminal: false,
      tableId: 'dca-bot-deals-trades-closed',
      pairs,
    })
  );
  await settle();
  const first = get().serverPaging;
  if (!first) throw new Error('expected server paging (window came back capped)');
  act(() =>
    first.serverSide.onQueryChange({
      pageIndex: 0,
      pageSize: 5,
      sorting: [],
      columnFilters: [],
      globalFilter: '',
    })
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 400));
  });
  await settle(40);
  return get;
}

describe('spec 080 §1.1 — the Symbol options cover the list, not the page', () => {
  it('a pair on another page is offered and searchable', async () => {
    const get = await serverPagedOnPageOne();
    const paging = get().serverPaging;
    if (!paging) throw new Error('expected server paging');
    const page = get().deals.map((d) => ({ symbol: d.symbol.symbol }));
    expect(page.map((r) => r.symbol)).not.toContain('PEPE-USDC');

    expect(optionsShown(page, paging.fields, 'pepe')).toEqual(['PEPE-USDC']);
    cleanup();
    // Every pair of the loaded window is offered, the page's included.
    const all = optionsShown(page, paging.fields);
    expect(all).toContain('PEPE-USDC');
    expect(all).toContain('S39-USDC');
    for (const r of page) expect(all).toContain(r.symbol);
  });

  it("the caller's pairs are offered too (deals older than the window)", async () => {
    const get = await serverPagedOnPageOne(['OLD-USDC', 'PEPE-USDC']);
    const paging = get().serverPaging;
    if (!paging) throw new Error('expected server paging');
    const page = get().deals.map((d) => ({ symbol: d.symbol.symbol }));
    const all = optionsShown(page, paging.fields);
    expect(all).toContain('OLD-USDC');
    expect(all.filter((s) => s === 'PEPE-USDC')).toHaveLength(1);
  });
});

describe('spec 080 §1.2 — several chosen pairs reach the server filter', () => {
  it('sends one pair isAnyOf item with every chosen pair', async () => {
    const get = await serverPagedOnPageOne();
    const paging = get().serverPaging;
    if (!paging) throw new Error('expected server paging');
    requests.length = 0;
    act(() =>
      paging.serverSide.onQueryChange({
        pageIndex: 0,
        pageSize: 5,
        sorting: [],
        columnFilters: [
          { id: 'symbol', value: { operator: 'isAnyOf', value: ['PEPE-USDC', 'S03-USDC'] } },
        ],
        globalFilter: '',
      })
    );
    // The table query is debounced (a filter burst settles in 300ms).
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    await settle(40);
    const items = requests.flatMap((r) => r.filterModel?.items ?? []);
    expect(items).toContainEqual(
      expect.objectContaining({
        field: 'pair',
        operator: 'isAnyOf',
        value: 'PEPE-USDC,S03-USDC',
      })
    );
  });
});
