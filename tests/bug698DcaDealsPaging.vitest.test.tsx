/**
 * Runner note: `.vitest.test.tsx`, not `.unit.test.ts` — core's
 * `playwright.unit.config.ts` only collects `.unit.test.{js,ts}` (pure
 * functions); this file renders the real hook in jsdom and mocks modules, which
 * only Vitest can do. Run it from the cloud parent:
 * `npx vitest run core/tests/bug698DcaDealsPaging.vitest.test.tsx`.
 *
 * Bug #698 — Trading Bots → Deals showed a fixed "Closed (500)" for an account
 * with 1457 closed deals, and the table could not reach past the newest 500.
 *
 * `useDcaDeals` stopped paginating on `data.totalPages`, which the live
 * `dcaDealList` resolver leaves NULL (verified against api.gainium.io: page 0/1/2
 * each report `total: 1457` with `data.totalPages` and `data.totalResults` null).
 * `totalPages || MAX_PAGES` therefore collapsed to the cap — 1 page for the
 * Deals tab, which fetches with `terminal: false` — so the hook committed 500
 * rows AND flagged that partial snapshot `complete`, letting the deal store's
 * absence-delete prune the rest.
 *
 * The fake client below mirrors the real backend exactly: `total` on the
 * operation node, `totalPages`/`totalResults` null, pageSize clamped at 500.
 *
 * Spec: specs/005.deals-tab-capped-at-500-closed-deals.md (§1, §2.1, §2.4, §3)
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
import { DCADealStatusEnum } from '@/types';

const BOT_ID = '6a8b89e98e06bef801add796';
const SERVER_PAGE_CAP = 500; // main-app clamps pageSize to min(500, limit ?? 500)

/** Server-side fixture, paged the way the live resolver pages. */
let fixture = { total: 1457, status: 'closed' };

const requestedPages: number[] = [];

const dealAt = (i: number) => ({
  _id: `deal-${i}`,
  botId: BOT_ID,
  userId: 'u1',
  status: fixture.status,
  paperContext: false,
  updateTime: 1_700_000_000_000, // long before any snapshot stamp
  symbol: { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT' },
});

// The hook's unrealized-PnL plumbing (price feed, per-symbol fees, USD rate)
// is orthogonal to paging and each piece would otherwise fetch. `useUserFees`
// in particular must hand back a STABLE `fetchMultipleFees`: it is a dep of the
// fee `useEffect`, so a fresh identity per render turns setFeesByExchange into
// a render loop under the test renderer.
vi.mock('@/helper/price', () => ({
  default: () => () => {},
  getLocalPrices: () => [],
}));

const noopFetchMultipleFees = async () => [];
vi.mock('@/hooks/useUserFeesService', () => ({
  useUserFees: () => ({ fetchMultipleFees: noopFetchMultipleFees }),
}));

vi.mock('@/hooks/useUsdRate', () => ({
  useUsdRate: () => ({ rate: 1 }),
}));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  class FakeGraphQLClient {
    async request(_query: string, variables: unknown) {
      const grid = (
        variables as { input?: { dataGridInput?: { page?: number; pageSize?: number } } }
      )?.input?.dataGridInput;
      const page = grid?.page ?? 0;
      const pageSize = Math.min(SERVER_PAGE_CAP, grid?.pageSize ?? SERVER_PAGE_CAP);
      requestedPages.push(page);
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
          // Exactly what prod returns: the per-page envelope is null.
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
  const el = document.createElement('div');
  document.body.appendChild(el);
  host = el;
  const r = createRoot(el);
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

/** Let the hook's sequential page fetches settle. */
async function settle(rounds = 60) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  requestedPages.length = 0;
  fixture = { total: 1457, status: 'closed' };
  queryClient.clear();
  useAuthStore.setState({
    tokens: { accessToken: 'test-token' },
    user: { id: 'u1', email: 'reporter@example.com' },
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

/** The Trading Bots → Deals tab's own call (TradingBots.tsx:2019). */
const renderDealsTab = (status: DCADealStatusEnum) =>
  renderHook(() => useDcaDeals({ terminal: false, status }));

describe('useDcaDeals — Deals tab paging (bug #698, spec 067 §4)', () => {
  // Spec 067 §4 replaced the automatic walk of every page (up to 40 × 500)
  // with on-demand pages: the hook loads one page, reports the server's
  // total, and `loadMore()` reaches the rest. The bug #698 guarantees still
  // hold — the total is the server's, every deal is reachable, and a partial
  // snapshot never prunes the store.
  it('§1 reports the server total and reaches every closed deal on demand', async () => {
    const get = renderDealsTab(DCADealStatusEnum.closed);
    await settle();

    expect(requestedPages).toEqual([0]);
    expect(get().deals.length).toBe(500);
    expect(get().total).toBe(1457);
    expect(get().isPartial).toBe(true);
    expect(get().hasMore).toBe(true);

    await act(async () => {
      await get().loadMore();
    });
    await settle();
    await act(async () => {
      await get().loadMore();
    });
    await settle();

    expect(requestedPages).toEqual([0, 1, 2]);
    expect(get().deals.length).toBe(1457);
    expect(get().hasMore).toBe(false);
    expect(get().isPartial).toBe(false);
  });

  it('§2.1 stops on a short page without an extra round trip', async () => {
    fixture = { total: 130, status: 'open' };
    const get = renderDealsTab(DCADealStatusEnum.open);
    await settle();

    expect(requestedPages).toEqual([0]);
    expect(get().deals.length).toBe(130);
    expect(get().hasMore).toBe(false);
  });

  it('§2.4 a partial snapshot does not absence-delete deals beyond it', async () => {
    fixture = { total: 40 * 500 + 10, status: 'closed' };
    const beyondCap = {
      ...dealAt(40 * 500 + 5),
      _id: 'deal-beyond-cap',
      dealType: 'dca',
    };
    useDealStore.setState({
      deals: { [BOT_ID]: { 'deal-beyond-cap': beyondCap } },
      _hasHydrated: true,
    } as never);

    const get = renderDealsTab(DCADealStatusEnum.closed);
    await settle();

    expect(requestedPages).toEqual([0]);
    expect(useDealStore.getState().deals[BOT_ID]?.['deal-beyond-cap']).toBeTruthy();
    expect(get().deals.length).toBe(500 + 1);
    expect(get().total).toBe(40 * 500 + 10);
  });

  it('§4.2 server-paged mode fetches exactly the requested page', async () => {
    const get = renderHook(() =>
      useDcaDeals(
        { terminal: false, status: DCADealStatusEnum.closed },
        { page: 2, pageSize: 100 }
      )
    );
    await settle();

    expect(requestedPages).toEqual([2]);
    expect(get().deals.map((d) => d._id)).toEqual(
      Array.from({ length: 100 }, (_, i) => `deal-${200 + i}`)
    );
    expect(get().total).toBe(1457);
  });
});
