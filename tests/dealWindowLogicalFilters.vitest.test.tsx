/**
 * Runner: `NODE_ENV=development npx vitest run core/tests/dealWindowLogicalFilters.vitest.test.tsx`
 * from the cloud parent.
 *
 * A large account's deal list is server-paged, but a window that came back
 * whole answers every query locally. Filters on LOGICAL server fields were
 * then evaluated against loaded deals that do not carry them: Symbol (`pair`,
 * stored as `symbol.symbol`) returned no rows at all, and number/day filters
 * (`>`, `<=` …) were skipped, so Cost and date filters showed the whole list.
 */
import { describe, expect, it, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { cleanup } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useDealStore } from '@/stores/live';
import { useTablePreferencesStore } from '@/stores/tablePreferencesStore';
import { useDealTablePaging } from '@/hooks/useDealTablePaging';

const SERVER_PAGE_CAP = 500;
const TOTAL = 30;
const DAY0 = Date.UTC(2026, 8, 1);
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
    botName: i % 2 ? 'Odd bot' : 'Even bot',
    createTime: DAY0 + i * 86_400_000,
    usage: { current: { quote: i * 10, base: 0 } },
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
  useLargeAccount: () => ({ active: true, source: 'auto' }),
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



async function withFilter(columnFilters: Array<{ id: string; value: unknown }>) {
  const get = renderHook(() =>
    useDealTablePaging({ status: 'closed', terminal: false, tableId: 'window-logical-closed' })
  );
  await settle();
  const p = get().serverPaging;
  if (!p) throw new Error('expected server paging (large account)');
  requests.length = 0;
  act(() =>
    p.serverSide.onQueryChange({ pageIndex: 0, pageSize: 50, sorting: [], columnFilters, globalFilter: '' })
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 400));
  });
  await settle(40);
  return {
    symbols: get().deals.map((d) => d.symbol.symbol),
    // The paged fetch; the totals read asks for a 1-row page.
    pagedFetches: requests.filter((r) => (r.pageSize ?? 0) > 1),
  };
}

describe('complete window, large account: filters on logical fields', () => {
  it('Symbol "is any of" matches the loaded deal (pair -> symbol.symbol)', async () => {
    const r = await withFilter([
      { id: 'symbol', value: [{ operator: 'isAnyOf', value: ['PEPE-USDC'] }] },
    ]);
    expect(r.symbols).toEqual(['PEPE-USDC']);
    expect(r.pagedFetches).toHaveLength(0);
  });

  it('Symbol "contains" matches the loaded deal', async () => {
    const r = await withFilter([{ id: 'symbol', value: [{ operator: 'contains', value: 'pepe' }] }]);
    expect(r.symbols).toEqual(['PEPE-USDC']);
  });

  it('a day filter is applied from the window, not skipped', async () => {
    const after = await withFilter([
      { id: 'createdTime', value: [{ operator: 'after', value: '2030-01-01' }] },
    ]);
    expect(after.symbols).toEqual([]);
    expect(after.pagedFetches).toHaveLength(0);
    cleanup();
    const before = await withFilter([
      { id: 'createdTime', value: [{ operator: 'onOrBefore', value: '2026-09-03' }] },
    ]);
    expect(before.symbols.length).toBeGreaterThanOrEqual(2);
    expect(before.symbols.length).toBeLessThanOrEqual(4);
  });

  it('Cost, a computed column the deals do not carry, goes to the server', async () => {
    const r = await withFilter([{ id: 'cost', value: [{ operator: 'greaterThan', value: 200 }] }]);
    expect(r.pagedFetches.length).toBeGreaterThan(0);
    const items = r.pagedFetches.at(-1)?.filterModel?.items ?? [];
    expect(items).toContainEqual({ field: 'cost', operator: '>', value: '200' });
  });
});
