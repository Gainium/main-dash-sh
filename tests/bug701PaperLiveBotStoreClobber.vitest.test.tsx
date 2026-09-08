/**
 * Runner note: `.vitest.test.tsx`, not `.unit.test.ts` — core's
 * `playwright.unit.config.ts` only collects `.unit.test.{js,ts}` (pure
 * functions); this file renders the real hooks in jsdom and mocks modules,
 * which only Vitest can do. Run it from the cloud parent:
 * `npx vitest run core/tests/bug701PaperLiveBotStoreClobber.vitest.test.tsx`.
 *
 * Bug #701 — Subscription → Active Bots read "0 Live / 0 Paper" for a reporter
 * with 4 running live DCA bots and no paper bots.
 *
 * The page mounts a live-pinned and a paper-pinned instance of the same bot
 * list hook side by side. Both used to push their response through the shared
 * REPLACE-on-write bot store and read the counts back out of it, so the empty
 * paper response wiped the 4 live bots a millisecond after they landed.
 *
 * The fake client below mirrors the real backend: it answers per the
 * `paperContext` the hook passed to the `GraphQLClient` constructor (which is
 * exactly what becomes the `paper-context` request header), and the bot
 * payloads carry NO `paperContext` field — `fullDCABot` does not expose one.
 *
 * Spec: specs/007.paper-live-bot-list-store-cross-clobber.md (§1.1, §1.3, §3)
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useDcaBotsStore } from '@/stores/live';
import { useDcaBots, useDcaBotStats } from '@/hooks/useDcaBots';

/** The reporter's shape: 4 live regular bots, 0 paper bots. */
const LIVE_BOTS = Array.from({ length: 4 }, (_, i) => ({
  _id: `live-bot-${i}`,
  userId: 'u1',
  status: 'open',
  exchange: 'binance',
  created: '2026-08-01T00:00:00.000Z',
  updated: '2026-09-01T00:00:00.000Z',
  settings: { name: `Bot ${i}`, type: 'regular' },
  profit: { totalUsd: 0 },
  profitToday: { totalTodayUsd: 0 },
  dealsInBot: { all: 0, active: 1 },
  // No `paperContext` — `dcaBotList` cannot return one (spec §2.4).
}));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  class FakeGraphQLClient {
    private readonly paperContext: boolean;
    constructor(
      _endpoint: string,
      _token: string,
      paperContext?: boolean
    ) {
      this.paperContext = !!paperContext;
    }
    async request(query: string) {
      if (!/dcaBotList/.test(query)) return {};
      const data = this.paperContext ? [] : LIVE_BOTS;
      return {
        dcaBotList: {
          status: 'OK',
          reason: null,
          total: data.length,
          data,
        },
      };
    }
  }
  return { ...actual, GraphQLClient: FakeGraphQLClient };
});

let root: Root | null = null;
let host: HTMLElement | null = null;

/** Render several hooks inside ONE component, in the given order — the
 * ordering is load-bearing: React flushes effects in declaration order, so it
 * decides which response writes the shared store last. */
function renderHooks<T extends Record<string, () => unknown>>(hooks: T) {
  const ref: { current: Record<string, unknown> } = { current: {} };
  function Probe() {
    const out: Record<string, unknown> = {};
    for (const [name, hook] of Object.entries(hooks)) out[name] = hook();
    ref.current = out;
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
  return ref;
}

async function settle(rounds = 40) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

const ACTIVE = ['open', 'range', 'monitoring', 'error'] as const;
const liveFilter = { status: [...ACTIVE], paperContext: false, terminal: false };
const paperFilter = { status: [...ACTIVE], paperContext: true, terminal: false };

/** What Subscription.tsx reduces the row from. */
const totalOf = (stats: { statusCounts?: Record<string, number> }) =>
  Object.values(stats.statusCounts || {}).reduce((a, b) => a + b, 0);

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  queryClient.clear();
  useAuthStore.setState({
    tokens: { accessToken: 'test-token' },
    user: { id: 'u1', email: 'reporter@example.com', paperContext: false },
  } as never);
  useUIStore.setState({ isLiveTrading: true, tradingMode: 'live' } as never);
  useDcaBotsStore.setState({ bots: {}, _hasHydrated: true } as never);
});

afterEach(() => {
  const r = root;
  if (r) act(() => r.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('useDcaBots — live/paper cross-context clobber (bug #701)', () => {
  it('§1.1 keeps the live count when an empty paper query is mounted alongside it', async () => {
    // Declaration order as on Subscription.tsx: live first, paper second — so
    // the empty paper response is the one that writes last.
    const ref = renderHooks({
      live: () => useDcaBotStats(liveFilter),
      paper: () => useDcaBotStats(paperFilter),
    });
    await settle();

    // Before the fix: 0 and 0.
    expect(totalOf(ref.current.live as never)).toBe(4);
    expect(totalOf(ref.current.paper as never)).toBe(0);
  });

  it('§1.1 is independent of which context is declared first', async () => {
    const ref = renderHooks({
      paper: () => useDcaBotStats(paperFilter),
      live: () => useDcaBotStats(liveFilter),
    });
    await settle();

    expect(totalOf(ref.current.live as never)).toBe(4);
    expect(totalOf(ref.current.paper as never)).toBe(0);
  });

  it('§1.3 holds while the app is globally in paper mode', async () => {
    useUIStore.setState({ isLiveTrading: false, tradingMode: 'paper' } as never);
    useAuthStore.setState({
      tokens: { accessToken: 'test-token' },
      user: { id: 'u1', email: 'reporter@example.com', paperContext: true },
    } as never);

    const ref = renderHooks({
      live: () => useDcaBotStats(liveFilter),
      paper: () => useDcaBotStats(paperFilter),
    });
    await settle();

    expect(totalOf(ref.current.live as never)).toBe(4);
    expect(totalOf(ref.current.paper as never)).toBe(0);
  });

  it('§1.3 a context-pinned query does not empty the store the ambient list reads', async () => {
    // Ambient caller (no explicit paperContext) = the bot-list pages; it owns
    // the shared store. A paper-pinned widget mounted next to it must not wipe
    // the live bots it is showing.
    const ref = renderHooks({
      ambient: () => useDcaBots({ status: [...ACTIVE], terminal: false }),
      paperPinned: () => useDcaBots(paperFilter),
    });
    await settle();

    expect((ref.current.ambient as { bots: unknown[] }).bots.length).toBe(4);
    expect(Object.keys(useDcaBotsStore.getState().bots).length).toBe(4);
  });
});
