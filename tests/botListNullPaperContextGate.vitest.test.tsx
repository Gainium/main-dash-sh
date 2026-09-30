/**
 * Runner note: `.vitest.test.tsx` — renders the real hook in jsdom with a
 * mocked GraphQL client. Run it from the cloud parent:
 * `npx vitest run core/tests/botListNullPaperContextGate.vitest.test.tsx`.
 *
 * The DCA bot list holds its query until the UI trading mode agrees with the
 * profile's saved `paperContext`, so the heavy list fires once under the right
 * context on cold start. The profile field is `boolean | null`: an account
 * that never saved a mode is served `null`. `usePaperContext` never syncs the
 * UI from a `null` profile, so a gate that only treats `undefined` as "no
 * saved mode" waits for a sync that never happens — the query stays disabled
 * and the Trading Bots page reads as empty for a user who has bots.
 *
 * Spec: specs/078.bot-list-stuck-on-null-paper-context.md
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
import { useDcaBots } from '@/hooks/useDcaBots';

const BOTS = Array.from({ length: 3 }, (_, i) => ({
  _id: `bot-${i}`,
  userId: 'u1',
  status: 'open',
  exchange: 'binance',
  created: '2026-08-01T00:00:00.000Z',
  updated: '2026-09-01T00:00:00.000Z',
  settings: { name: `Bot ${i}`, type: 'regular' },
  profit: { totalUsd: 0 },
  profitToday: { totalTodayUsd: 0 },
  dealsInBot: { all: 0, active: 1 },
}));

const requests: boolean[] = [];

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  class FakeGraphQLClient {
    private readonly paperContext: boolean;
    constructor(_endpoint: string, _token: string, paperContext?: boolean) {
      this.paperContext = !!paperContext;
    }
    async request(query: string) {
      if (!/dcaBotList/.test(query)) return {};
      requests.push(this.paperContext);
      return {
        dcaBotList: { status: 'OK', reason: null, total: BOTS.length, data: BOTS },
      };
    }
  }
  return { ...actual, GraphQLClient: FakeGraphQLClient };
});

let root: Root | null = null;
let host: HTMLElement | null = null;

function renderList() {
  const resultRef: { current: { bots: unknown[] } | null } = { current: null };
  const record = (result: { bots: unknown[] }) => {
    resultRef.current = result;
  };
  function Probe() {
    record(useDcaBots({ status: ['open', 'range', 'monitoring', 'error'] }));
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
  return resultRef;
}

async function settle(rounds = 40) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

function setProfile(paperContext: boolean | null | undefined) {
  useAuthStore.setState({
    tokens: { accessToken: 'test-token' },
    user: { id: 'u1', email: 'user@example.com', paperContext },
  } as never);
}

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  queryClient.clear();
  requests.length = 0;
  // Cold-start default: the UI boots in paper mode.
  useUIStore.setState({ isLiveTrading: false, tradingMode: 'paper' } as never);
  useDcaBotsStore.setState({ bots: {}, _hasHydrated: true } as never);
});

afterEach(() => {
  const r = root;
  if (r) act(() => r.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('useDcaBots — trading-mode gate with no saved paperContext', () => {
  it('loads the list when the profile paperContext is null', async () => {
    setProfile(null);
    const ref = renderList();
    await settle();

    expect(requests.length).toBe(1);
    expect(ref.current?.bots.length).toBe(3);
  });

  it('loads the list when the profile paperContext is undefined', async () => {
    setProfile(undefined);
    const ref = renderList();
    await settle();

    expect(requests.length).toBe(1);
    expect(ref.current?.bots.length).toBe(3);
  });

  it('still holds the query while a saved mode disagrees with the UI', async () => {
    // Saved live, UI still on the paper default: wait for usePaperContext.
    setProfile(false);
    renderList();
    await settle();

    expect(requests.length).toBe(0);

    act(() => {
      useUIStore.setState({ isLiveTrading: true, tradingMode: 'live' } as never);
    });
    await settle();

    expect(requests).toEqual([false]);
  });
});
