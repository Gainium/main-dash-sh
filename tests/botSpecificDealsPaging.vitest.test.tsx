/**
 * Runner note: this file is named `.vitest.test.tsx`, not `.unit.test.ts` like
 * the rest of `core/tests`. Those are Playwright pure-function tests; this one
 * renders the real hook in jsdom and mocks a module, which only Vitest can do
 * here. The distinct suffix is what keeps the two runners apart: core's
 * `playwright.unit.config.ts` matches `.unit.test.js` / `.unit.test.ts` and so
 * never collects this file, while the cloud parent's `vitest.config.ts`
 * includes core's `.vitest.test.ts` / `.vitest.test.tsx` files and runs them.
 * Run it from the parent:
 * `npx vitest run core/tests/botSpecificDealsPaging.vitest.test.tsx`.
 */

/**
 * Bug #510 — "DCA Analysis" on the bot page cycled between the correct
 * "Finished Deals by DCA Count" totals and much smaller ones, roughly 30s
 * wrong for every ~1s right.
 *
 * `useBotSpecificDeals` walks the deal pages sequentially, then commits the
 * accumulated snapshot to the deal store via `reconcileDeals`, whose
 * absence-delete prunes in-scope deals the snapshot does not contain. Two
 * things made the accumulator short at commit time:
 *
 *  1. `lib/queryClient` sets a GLOBAL `placeholderData: (prev) => prev`, so the
 *     instant `currentPageLoading` changed the query key, the PREVIOUS page's
 *     payload was replayed under the new key with a success status. The loader
 *     read that as "this page is done" and walked to the last page holding only
 *     page 0 — then committed page 0 as the whole snapshot.
 *  2. After a run committed, the last page's background refetch landed on an
 *     empty accumulator and committed that one page on its own.
 *
 * Either way `reconcileDeals` deleted the rest of the bot's closed deals, and
 * the widget showed a fraction of them until the next 30s re-snapshot.
 *
 * These tests drive the real hook against the real queryClient defaults and the
 * real deal store, and assert the property that matters: once the first load
 * has settled, the hook never reports fewer deals than the server says exist.
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
import { useBotSpecificDeals } from '@/hooks/useBotSpecificDeals';

const BOT_ID = '6a8b89e98e06bef801add796'; // the reporter's bot
const PAGE_SIZE = 100;
const MAX_PAGES = 5; // the hook's display ceiling
const NETWORK_MS = 120; // realistic RTT — longer than the loader's 100ms step
const STEP_MS = 50;

/** Server-side fixture: `total` deals of `status`, paged like the real API. */
let fixture = { total: 204, status: 'closed' };

const dealAt = (i: number) => ({
  _id: `deal-${i}`,
  botId: BOT_ID,
  status: fixture.status,
  updateTime: 1_700_000_000_000, // long before any snapshot stamp
  transactions: { buy: 3 },
  levels: { all: 5, complete: 3 },
});

const requestedPages: number[] = [];

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  class FakeGraphQLClient {
    async request(_query: string, variables: unknown) {
      const page =
        (variables as { input?: { page?: number } })?.input?.page ?? 0;
      requestedPages.push(page);
      await new Promise((r) => setTimeout(r, NETWORK_MS));
      const start = page * PAGE_SIZE;
      const deals = Array.from(
        { length: Math.max(0, Math.min(PAGE_SIZE, fixture.total - start)) },
        (_, i) => dealAt(start + i)
      );
      const payload = {
        status: 'OK',
        data: { page, total: fixture.total, deals },
      };
      return { getBotDeals: payload, getComboBotDeals: payload };
    }
  }
  return { ...actual, GraphQLClient: FakeGraphQLClient };
});

let root: Root | null = null;
let host: HTMLElement | null = null;

/** Mounts `hook` under the providers it needs; returns an accessor for its
 *  latest return value. */
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

/**
 * Advance fake time in small `act` steps, sampling after each one. Small steps
 * matter: `act` flushes trailing effects only on exit, so one big advance can
 * leave the loader's 100ms page-step timer registered but never fired. 50ms
 * steps keep effects flushing continuously — how the browser actually behaves —
 * and yield a timeline of what the widget shows over time.
 */
async function runTimeline(totalMs: number, sample: () => number) {
  const out: Array<{ t: number; n: number }> = [];
  for (let t = 0; t < totalMs; t += STEP_MS) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STEP_MS);
    });
    out.push({ t: t + STEP_MS, n: sample() });
  }
  return out;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  requestedPages.length = 0;
  fixture = { total: 204, status: 'closed' };
  vi.useFakeTimers();
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
  vi.useRealTimers();
});

const renderClosed = () =>
  renderHook(() =>
    useBotSpecificDeals({
      botId: BOT_ID,
      status: fixture.status as never,
      dealType: 'dca',
    })
  );

describe('useBotSpecificDeals — paginated auto-loader (bug #510)', () => {
  it('holds every closed deal across the 30s re-snapshot cycles (multi-page)', async () => {
    // The reporter's bot: 204 closed deals = pages of 100 / 100 / 4.
    const get = renderClosed();
    const timeline = await runTimeline(
      75_000, // ~2.5 re-snapshot cycles
      () => get().deals.length
    );

    // Ignore the initial load window; from there on the widget must never show
    // fewer deals than the server reports.
    const settled = timeline.filter((s) => s.t >= 3_000);
    const wrong = settled.filter((s) => s.n !== fixture.total);

    expect([...new Set(settled.map((s) => s.n))]).toEqual([fixture.total]);
    expect(wrong.length).toBe(0);
  });

  it('settles on a single-page bot and still prunes (regression guard)', async () => {
    // One short page — the loader must still latch "complete" and commit, or
    // the tab would spin forever.
    fixture = { total: 50, status: 'open' };
    const get = renderClosed();
    const timeline = await runTimeline(40_000, () => get().deals.length);

    const settled = timeline.filter((s) => s.t >= 3_000);
    expect([...new Set(settled.map((s) => s.n))]).toEqual([50]);
    expect(get().isFetching).toBe(false);

    // The snapshot covers the whole server total, so the absence-delete is
    // allowed to run: a deal that has since left the status scope is pruned.
    expect(
      Object.keys(useDealStore.getState().deals[BOT_ID] ?? {}).length
    ).toBe(50);
  });

  it('does not absence-delete beyond the maxPages display cap', async () => {
    // 700 deals but the display loader stops at 5 pages, so the snapshot is
    // page-capped and must NOT prune the deals past it.
    fixture = { total: 700, status: 'closed' };
    const beyondCap = {
      ...dealAt(650), // page 6 — never fetched by the display loader
      _id: 'deal-650',
      dealType: 'dca',
    };
    useDealStore.setState({
      deals: { [BOT_ID]: { 'deal-650': beyondCap } },
      _hasHydrated: true,
    } as never);

    const get = renderClosed();
    await runTimeline(40_000, () => get().deals.length);

    // The loader settled at its cap rather than hanging...
    expect(get().isFetching).toBe(false);
    // ...and the deal beyond the cap survived the reconcile: the 500 the
    // display loader fetched, plus the one it never asked for. Before the fix
    // the page-capped snapshot absence-deleted it.
    expect(useDealStore.getState().deals[BOT_ID]?.['deal-650']).toBeTruthy();
    expect(get().deals.length).toBe(MAX_PAGES * PAGE_SIZE + 1);
  });
});
