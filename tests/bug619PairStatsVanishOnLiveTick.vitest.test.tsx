/**
 * Runner note: `.vitest.test.tsx`, not `.unit.test.ts` — core's Playwright
 * config only collects `*.unit.test.{js,ts}`; this file renders a real hook in
 * jsdom and mocks a module, so it is Vitest-only. Run from the parent:
 * `npx vitest run core/tests/bug619PairStatsVanishOnLiveTick.vitest.test.tsx`.
 */

/**
 * Bug #619 — "Pair metrics on Statistics page is gone", intermittently.
 *
 * The reporter's DCA bot SCS003 (130 pairs, ~40 deals/day) renders the whole
 * Statistics tab except the per-pair table at the bottom. Prod's GraphQL still
 * has the data: `getDCABot(SCS003).symbolStats` returns 131 entries.
 *
 * The tab's data comes from `useBotFullStats`, which fetches `stats` +
 * `symbolStats` for the one bot being looked at, and overlays socket-pushed
 * stats on top. But the socket channel carries only `stats`:
 * `LiveUpdateContext`'s `bot stats update` handler forwards `data.stats` and
 * drops the `symbolStats` main-app sends alongside it (dcaHelper emits
 * `{ stats, symbolStats }`). And `needFetch` was gated on `stats` alone — so
 * once a live tick parked full stats in `botStatsStore`, the hook decided it
 * had everything and never asked for `symbolStats` at all.
 *
 * These tests drive the real hook against the real queryClient and the real
 * `botStatsStore`, feeding the store exactly what `LiveUpdateContext` feeds it.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useBotStatsStore } from '@/stores/live/botStatsStore';
import { useBotFullStats } from '@/hooks/useBotFullStats';
import { BotTypesEnum, type BotStats, type BotSymbolsStats } from '@/types';

const BOT_ID = '6a9456d3cb09e28f98a19344'; // the reporter's SCS003

/** Shaped like the prod payload; `numerical.general` is what `hasFullStats` reads. */
const serverStats = () =>
  ({
    numerical: {
      general: { netProfit: { usd: 45.96 }, winRate: 1 },
      deals: { profit: 167, loss: 0 },
    },
    chart: [],
  }) as unknown as BotStats;

const serverSymbolStats = (): BotSymbolsStats[] =>
  ['BTC-USDC', 'ETH-USDC', 'SOL-USDC'].map(
    (symbol) =>
      ({
        symbol,
        numerical: {
          deals: { profit: 2, loss: 0 },
          general: { netProfit: { usd: 0.21 }, winRate: 1 },
        },
        duration: { maxDealDuration: 1, avgDealDuration: 1 },
      }) as unknown as BotSymbolsStats
  );

let requests = 0;
/** Flip to model a bot with no per-pair sample yet (no closed deals). */
let serveEmptySymbolStats = false;

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  class FakeGraphQLClient {
    async request() {
      requests += 1;
      return {
        getDCABot: {
          status: 'OK',
          data: {
            _id: BOT_ID,
            stats: serverStats(),
            symbolStats: serveEmptySymbolStats ? [] : serverSymbolStats(),
          },
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

/** Let the fetch resolve and React commit. */
async function settle() {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

/**
 * Exactly what `LiveUpdateContext`'s `bot stats update` subscriber does with a
 * `{ botId, data: { stats, symbolStats } }` frame today: forwards `data.stats`.
 */
const pushLiveTick = (symbolStats?: BotSymbolsStats[]) =>
  act(() => {
    useBotStatsStore.getState().updateBotStatsFromWebSocket({
      botId: BOT_ID,
      data: serverStats() as unknown as Record<string, unknown>,
      ...(symbolStats ? { symbolStats } : {}),
    });
  });

const renderTab = () =>
  renderHook(() =>
    useBotFullStats({
      botId: BOT_ID,
      type: BotTypesEnum.dca,
      shareId: null,
      enabled: true,
      // The drawer's bot comes from the LIST query, whose fragment strips
      // `stats` to a chart-only slice and carries no `symbolStats` at all.
      existing: undefined,
      existingSymbolStats: undefined,
    })
  );

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  requests = 0;
  serveEmptySymbolStats = false;
  queryClient.clear();
  useAuthStore.setState({
    tokens: { accessToken: 'test-token' },
    user: { id: 'u1', email: 'reporter@example.com' },
  } as never);
  useUIStore.setState({ isLiveTrading: true, tradingMode: 'live' } as never);
  useBotStatsStore.setState({ botStats: {}, botSymbolStats: {} } as never);
});

afterEach(() => {
  const r = root;
  if (r) act(() => r.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('bug #619 — the Pairs table survives a live stats tick', () => {
  it('fetches symbolStats when the tab opens cold', async () => {
    const result = renderTab();
    await settle();
    expect(result().stats).toBeTruthy();
    expect(result().symbolStats?.length).toBe(3);
  });

  it('keeps symbolStats when a live tick lands while the tab is open', async () => {
    const result = renderTab();
    await settle();
    expect(result().symbolStats?.length).toBe(3);

    await pushLiveTick();
    await settle();

    // The tick refreshes `stats`; it must not take the pairs down with it.
    expect(result().stats).toBeTruthy();
    expect(result().symbolStats?.length).toBe(3);
  });

  it('fetches symbolStats when the tab opens AFTER a tick already landed', async () => {
    // The common case on a busy bot: `bot stats update` fires long before the
    // user opens the drawer's Stats tab, so `botStatsStore` already holds full
    // stats at mount.
    await pushLiveTick();

    const result = renderTab();
    await settle();

    expect(result().stats).toBeTruthy();
    expect(result().symbolStats?.length).toBe(3);
    expect(requests).toBeGreaterThan(0);
  });

  it('refreshes the pairs from a tick that carries symbolStats', async () => {
    const result = renderTab();
    await settle();
    expect(result().symbolStats?.map((s) => s.symbol)).toEqual([
      'BTC-USDC',
      'ETH-USDC',
      'SOL-USDC',
    ]);

    // A closed deal on a 4th pair: main-app re-emits the WHOLE array.
    const grown = [
      ...serverSymbolStats(),
      { ...serverSymbolStats()[0], symbol: 'XRP-USDC' } as BotSymbolsStats,
    ];
    await pushLiveTick(grown);
    await settle();

    expect(result().symbolStats?.length).toBe(4);
    expect(result().symbolStats?.map((s) => s.symbol)).toContain('XRP-USDC');
  });

  it('a tick with no symbolStats does not wipe the pairs already held', async () => {
    const result = renderTab();
    await settle();
    await pushLiveTick(serverSymbolStats());
    await settle();
    expect(result().symbolStats?.length).toBe(3);

    // Not every frame has to carry pairs; an absent one is not a deletion.
    await pushLiveTick();
    await settle();
    expect(result().symbolStats?.length).toBe(3);
  });

  it('does not re-request in a loop when the bot genuinely has no pairs yet', async () => {
    // `needFetch` now stays true while `symbolStats` is missing, and for a bot
    // with no closed deals it is legitimately always missing. That must cost
    // one request, not a spin: the query is enabled, not polled.
    serveEmptySymbolStats = true;

    const result = renderTab();
    await settle();
    expect(result().stats).toBeTruthy();
    expect(result().symbolStats?.length ?? 0).toBe(0);

    const after = requests;
    await pushLiveTick();
    await settle();
    await settle();

    expect(requests).toBe(after);
    expect(after).toBeLessThanOrEqual(2);
  });
});
