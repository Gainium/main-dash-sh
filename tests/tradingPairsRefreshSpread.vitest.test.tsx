/**
 * Runner note: renders a real hook in jsdom under fake timers and mocks a
 * module, so it is a Vitest file. Run from the parent:
 * `npx vitest run core/tests/tradingPairsRefreshSpread.vitest.test.tsx`.
 */

/**
 * The pair list used to be refreshed by a timer aligned to wall-clock minute
 * :25. Every open tab emptied its store at the same second and re-sent
 * `getAllPairs`, so the backend received the whole fleet's pair-list loads in
 * one burst every hour. The refresh is now relative to when the tab loaded
 * its list, with a per-tab jitter, and keeps the list on screen meanwhile.
 *
 * The store installs its refresh timer at import, so each test imports the
 * modules fresh after the fake clock is set.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const NETWORK_MS = 300;
const MINUTE = 60 * 1000;
const requests: number[] = [];

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  class FakeGraphQLClient {
    async request() {
      requests.push(Date.now());
      await new Promise((r) => setTimeout(r, NETWORK_MS));
      const pair = {
        pair: 'BTC-USDT',
        exchange: 'binance',
        code: 'BTC/USDT',
        baseAsset: { name: 'BTC', minAmount: 1, maxAmount: 1e9, step: 1 },
        quoteAsset: { name: 'USDT', minAmount: 1 },
        priceAssetPrecision: 2,
      };
      return {
        getAllPairs: { status: 'OK', reason: null, data: { result: [pair] } },
      };
    }
  }
  return { ...actual, GraphQLClient: FakeGraphQLClient };
});

let root: Root | null = null;
let host: HTMLElement | null = null;

type Store = typeof import('@/stores/tradingPairsDataStore');

async function mountAt(localTime: Date): Promise<Store> {
  vi.setSystemTime(localTime);
  vi.resetModules();
  const { QueryClientProvider } = await import('@tanstack/react-query');
  const { queryClient } = await import('@/lib/queryClient');
  const { useAuthStore } = await import('@/stores/authStore');
  const { useUIStore } = await import('@/stores/uiStore');
  const store = await import('@/stores/tradingPairsDataStore');
  const { useTradingPairs } = await import('@/hooks/useTradingPairs');

  queryClient.clear();
  useAuthStore.setState({
    tokens: { accessToken: 'test-token' },
    user: { id: 'u1', email: 'reporter@example.com' },
  } as never);
  useUIStore.setState({ isLiveTrading: true, tradingMode: 'live' } as never);
  store.useTradingPairsDataStore.setState({
    pairsByProvider: {},
    timestamp: 0,
    context: null,
    isLoading: false,
    error: null,
    initialLoaded: false,
    _hasHydrated: true,
  } as never);

  function Probe() {
    useTradingPairs();
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
        QueryClientProvider,
        { client: queryClient },
        createElement(Probe) as ReactNode
      )
    );
  });
  await step(NETWORK_MS + 200);
  return store;
}

async function step(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  requests.length = 0;
});

afterEach(() => {
  const r = root;
  if (r) act(() => r.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('trading-pair list refresh (spec 126)', () => {
  it('§1 / §1.1: a list loaded at :24 is not refetched at :25', async () => {
    await mountAt(new Date(2026, 9, 18, 12, 24, 0));
    expect(requests).toHaveLength(1);

    await step(2 * MINUTE);
    expect(requests).toHaveLength(1);
  });

  it('§1.1 / §1.3: refetches once between 45 and 75 min, never emptying the list', async () => {
    const store = await mountAt(new Date(2026, 9, 18, 12, 24, 0));
    const loadedAt = Date.now();
    const providers = () =>
      Object.keys(
        store.useTradingPairsDataStore.getState().pairsByProvider
      );

    for (let m = 1; m <= 80; m++) {
      await step(MINUTE);
      expect(providers()).toEqual(['binance']);
      if (m < 45) expect(requests).toHaveLength(1);
    }
    expect(requests).toHaveLength(2);
    const refetchAfter = requests[1] - loadedAt;
    expect(refetchAfter).toBeGreaterThanOrEqual(45 * MINUTE);
    expect(refetchAfter).toBeLessThanOrEqual(76 * MINUTE);
  });

  it('§1.2: two tabs loaded at the same moment expire at different moments', async () => {
    const { isPairsRefreshDue, PAIRS_REFRESH_MIN_MS, PAIRS_REFRESH_JITTER_MS } =
      await import('@/stores/tradingPairsDataStore');
    const t0 = Date.UTC(2026, 9, 18, 12, 0, 0);
    const tabA = 0.1 * PAIRS_REFRESH_JITTER_MS;
    const tabB = 0.9 * PAIRS_REFRESH_JITTER_MS;
    const probe = t0 + PAIRS_REFRESH_MIN_MS + 0.5 * PAIRS_REFRESH_JITTER_MS;

    expect(isPairsRefreshDue(t0, probe, tabA)).toBe(true);
    expect(isPairsRefreshDue(t0, probe, tabB)).toBe(false);
    expect(isPairsRefreshDue(0, t0, tabB)).toBe(true);
    expect(PAIRS_REFRESH_MIN_MS + PAIRS_REFRESH_JITTER_MS / 2).toBe(60 * MINUTE);
  });
});
