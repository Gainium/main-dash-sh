/**
 * Runner: `npx vitest run core/tests/dealsViewRenderLoop.vitest.test.tsx`
 * from the cloud parent.
 *
 * Trading Bots → Deals on a large account (bot list capped by the server, ~2k
 * open deals) rendered forever: the page stayed at ~0.9 s of script per
 * second with no network, re-rendering every deal card.
 *
 * Cycle: the page's Bots table is not mounted on the Deals view, so it never
 * reports a table query; the bot-list paging hook, server-paged because the
 * list was capped, then returned `canonical.bots.slice(0, pageSize)` — a NEW
 * array on every render. The page keys its fee lookup on that list's
 * identity and stored the (cached, instantly resolved) fees as a new array
 * every time → re-render → new slice → fee effect → setState → …
 *
 * Two guards, each tested here:
 *  1. the paging hook returns the SAME rows across renders when nothing
 *     changed (the invariant that broke);
 *  2. the page's fee state keeps its previous value when the fees are equal,
 *     so even a churning list cannot turn into a render loop.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, useEffect, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/hooks/useLargeAccount', () => ({
  useLargeAccount: () => ({ active: true }),
}));

import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useBotListPaging } from '@/hooks/useBotListPaging';
import { sameFeeRows, toSortedFeeRows } from '@/lib/utils/feeRows';

type Bot = { _id: string; created: number; settings: { name: string } };

const BOTS: Bot[] = Array.from({ length: 500 }, (_, i) => ({
  _id: `bot-${i}`,
  created: 1_700_000_000_000 - i,
  settings: { name: `Bot ${i}` },
}));
// A capped canonical list: 500 loaded of 1,497 (large account).
const CANONICAL = { bots: BOTS, total: 1497, isPartial: true, loadedCount: 500 };
const FIELDS = {};
const STATUSES = ['open'] as never[];

/** Cached fee lookup: resolves on the next microtask, like the fee service. */
const fetchFees = async (_bots: unknown) => [
  { exchangeUUID: 'ex-1', symbol: 'BTCUSDT', maker: 0.001 },
];

let root: Root | null = null;
let host: HTMLElement | null = null;
function mount(node: ReactNode) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      createElement(
        MemoryRouter,
        null,
        createElement(QueryClientProvider, { client: queryClient }, node)
      )
    )
  );
}
async function idle(ms = 150) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  queryClient.clear();
  useAuthStore.setState({
    tokens: { accessToken: 'test-token' },
    user: { id: 'u1', email: 'user@example.com' },
  } as never);
  useUIStore.setState({ isLiveTrading: true, tradingMode: 'live' } as never);
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe('Trading Bots → Deals render loop (large account)', () => {
  it('the capped bot list returns the same rows across renders when no table reports a query', async () => {
    const seen: unknown[] = [];
    const bumper: { bump: () => void } = { bump: () => {} };
    function Page() {
      const [, setN] = useState(0);
      useEffect(() => {
        bumper.bump = () => setN((n) => n + 1);
      }, []);
      const paging = useBotListPaging<Bot>({
        type: 'dca',
        canonical: CANONICAL,
        statuses: STATUSES,
        fields: FIELDS,
      });
      seen.push(paging.bots);
      return null;
    }
    mount(createElement(Page));
    await idle(50);
    const before = seen.at(-1);
    act(() => bumper.bump());
    act(() => bumper.bump());
    expect(seen.at(-1)).toBe(before);
  });

  it('the page (paging hook + an unguarded fee refresh) settles: bounded renders with nothing changing', async () => {
    let renders = 0;
    function Page() {
      renders++;
      const paging = useBotListPaging<Bot>({
        type: 'dca',
        canonical: CANONICAL,
        statuses: STATUSES,
        fields: FIELDS,
      });
      const dcaBots = paging.bots;
      const [, setAllFees] = useState<ReturnType<typeof toSortedFeeRows>>([]);
      // Unguarded on purpose (the page's code before the fee guard): this
      // test isolates the paging hook's row identity.
      useEffect(() => {
        void fetchFees(dcaBots).then((res) => setAllFees(toSortedFeeRows(res)));
      }, [dcaBots]);
      return null;
    }
    mount(createElement(Page));
    await idle(300);
    const settled = renders;
    await idle(300);
    expect(renders - settled).toBe(0);
    expect(settled).toBeLessThan(15);
  });

  it('the fee guard alone stops the loop even if the bot list churned', async () => {
    let renders = 0;
    function Page() {
      renders++;
      // Worst case: a list with a new identity on every render.
      const dcaBots = BOTS.slice(0, 10);
      const [, setAllFees] = useState<ReturnType<typeof toSortedFeeRows>>([]);
      useEffect(() => {
        void fetchFees(dcaBots).then((res) => {
          const next = toSortedFeeRows(res);
          setAllFees((prev) => (sameFeeRows(prev, next) ? prev : next));
        });
      }, [dcaBots]);
      return null;
    }
    mount(createElement(Page));
    await idle(300);
    const settled = renders;
    await idle(300);
    expect(renders - settled).toBe(0);
    expect(settled).toBeLessThan(5);
  });
});
