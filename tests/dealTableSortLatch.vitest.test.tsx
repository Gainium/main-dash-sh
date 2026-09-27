/**
 * Runner: `npx vitest run core/tests/dealTableSortLatch.vitest.test.tsx` from
 * the cloud parent.
 *
 * Spec 070 (parent repo) — Trading Bots → Deals (open): a column sort did
 * nothing once the table had latched into server paging. The latch fired on
 * a COMPLETE list (the live store lost a deal that closed, while the server
 * total was from the last fetch), it never cleared, and a complete window then
 * "answered" sorts on server-only fields its rows do not carry.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useDealStore } from '@/stores/live';
import { useDcaDeals } from '@/hooks/useDcaDeals';
import { useDealTablePaging } from '@/hooks/useDealTablePaging';
import { windowCanSort } from '@/lib/botList/windowPage';
import { DCADealStatusEnum } from '@/types';

const BOT_ID = 'bot-1';
const SERVER_PAGE_CAP = 500;
let fixture = { total: 25, status: 'open' };

const dealAt = (i: number) => ({
  _id: `deal-${i}`,
  botId: BOT_ID,
  userId: 'u1',
  status: fixture.status,
  paperContext: false,
  updateTime: 1_700_000_000_000,
  symbol: { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT' },
  // What the deal-list fragment carries: no `*Net` / valueUsd / usage.
  stats: { unrealizedProfit: i - 12 },
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
  useLargeAccount: () => ({ active: false, source: 'auto' }),
}));
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  class FakeGraphQLClient {
    async request(_query: string, variables: unknown) {
      const grid = (
        variables as {
          input?: { dataGridInput?: { page?: number; pageSize?: number } };
        }
      )?.input?.dataGridInput;
      const page = grid?.page ?? 0;
      const pageSize = Math.min(SERVER_PAGE_CAP, grid?.pageSize ?? SERVER_PAGE_CAP);
      const start = page * pageSize;
      const result = Array.from(
        { length: Math.max(0, Math.min(pageSize, fixture.total - start)) },
        (_, i) => dealAt(start + i)
      );
      return {
        dcaDealList: {
          status: 'OK',
          reason: null,
          total: fixture.total,
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

/** A deal closes: the socket patch moves it out of the open set in the store. */
function closeDealInStore(id: string) {
  const deals = useDealStore.getState().deals as Record<
    string,
    Record<string, Record<string, unknown>>
  >;
  const bucket = deals[BOT_ID] ?? {};
  useDealStore.setState({
    deals: {
      ...deals,
      [BOT_ID]: { ...bucket, [id]: { ...bucket[id], status: 'closed' } },
    },
  } as never);
}

const LATCH_KEY = 'gainium:deal-table-partial:d:open::live';

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  fixture = { total: 25, status: 'open' };
  queryClient.clear();
  localStorage.clear();
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
});

describe('spec 070 §1.1 — a complete deal window is not partial', () => {
  it('stays complete when a deal closes locally before the next fetch', async () => {
    const get = renderHook(() =>
      useDcaDeals({ terminal: false, status: DCADealStatusEnum.open })
    );
    await settle();
    expect(get().deals.length).toBe(25);
    expect(get().isPartial).toBe(false);

    act(() => closeDealInStore('deal-3'));
    await settle(5);
    expect(get().deals.length).toBe(24);
    expect(get().isPartial).toBe(false);
  });

  it('a capped window is still partial (bug #698 guarantee)', async () => {
    fixture = { total: 1457, status: 'closed' };
    const get = renderHook(() =>
      useDcaDeals({ terminal: false, status: DCADealStatusEnum.closed })
    );
    await settle();
    expect(get().deals.length).toBe(500);
    expect(get().isPartial).toBe(true);
  });
});

describe('spec 070 §1.1/§1.2 — the Deals tab stays (or returns to) client paging', () => {
  const renderTab = () =>
    renderHook(() =>
      useDealTablePaging({
        status: 'open',
        terminal: false,
        tableId: 'dca-bot-deals-trades-open',
      })
    );

  it('a deal closing on screen does not latch server paging', async () => {
    const get = renderTab();
    await settle();
    expect(get().serverPaged).toBe(false);

    act(() => closeDealInStore('deal-3'));
    await settle(5);
    expect(get().serverPaged).toBe(false);
    expect(localStorage.getItem(LATCH_KEY)).toBeNull();
  });

  it('a latch left by an earlier visit clears once the window is complete', async () => {
    localStorage.setItem(LATCH_KEY, '1');
    const get = renderTab();
    await settle();
    expect(get().serverPaged).toBe(false);
    expect(localStorage.getItem(LATCH_KEY)).toBeNull();
  });

  it('a genuinely capped list still latches', async () => {
    fixture = { total: 1457, status: 'open' };
    const get = renderTab();
    await settle();
    expect(get().serverPaged).toBe(true);
    expect(localStorage.getItem(LATCH_KEY)).toBe('1');
  });
});

describe('spec 070 §1.3 — windowCanSort', () => {
  const rows = [dealAt(1), dealAt(2)];
  const q = (field: string) => ({
    pageIndex: 0,
    pageSize: 10,
    sort: { field, direction: 'asc' as const },
  });
  it('a sort on a field the rows lack needs the server', () => {
    expect(windowCanSort(rows, q('stats.unrealizedProfitNet'))).toBe(false);
    expect(windowCanSort(rows, q('stats.unrealizedPercentNet'))).toBe(false);
  });
  it('a sort on a field the rows carry is answered locally', () => {
    expect(windowCanSort(rows, q('profit.totalUsd'))).toBe(true);
  });
  it('no sort, or no rows, is always answerable', () => {
    expect(windowCanSort(rows, { pageIndex: 0, pageSize: 10 })).toBe(true);
    expect(windowCanSort([], q('stats.unrealizedProfitNet'))).toBe(true);
  });
});
