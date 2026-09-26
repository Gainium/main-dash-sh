/**
 * Runner note: renders a real hook in jsdom and mocks a module, so it is a
 * Vitest file. Run from the parent:
 * `npx vitest run core/tests/tradingPairsContextSwitch.vitest.test.tsx`.
 */

/**
 * The bot Edit page showed no safety orders and 0.00% coverage for a PAPER bot
 * opened from inside the app, until the page was refreshed.
 *
 * Cause: `lib/queryClient` sets a global `placeholderData: (prev) => prev`.
 * `getAllPairs` is keyed on the trading context, so a live -> paper switch
 * (the edit page aligns the global mode to the bot's) replays the LIVE pair
 * list under the paper key. `useTradingPairs` wrote that placeholder into the
 * pairs store, which marks the store loaded and so disables the query before
 * the paper request is sent. The store kept `kraken`, `binance`, … while the
 * paper account's pairs live under `paperKraken`, `paperBinance`, …, so the
 * form found no metadata for the bot's pair and the preview had no symbol.
 *
 * The third test pins the case commit 2877cc38 fixed: when the store is
 * emptied while the query still holds real (non-placeholder) data for the
 * same key, the store is repopulated from that cache without a refetch.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';

import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useTradingPairsDataStore } from '@/stores/tradingPairsDataStore';
import { useTradingPairs } from '@/hooks/useTradingPairs';

const NETWORK_MS = 300;
const requests: Array<{ paper: boolean }> = [];

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  class FakeGraphQLClient {
    private paper: boolean;
    constructor(_endpoint: string, _token?: string, paperContext?: boolean) {
      this.paper = !!paperContext;
    }
    async request() {
      requests.push({ paper: this.paper });
      await new Promise((r) => setTimeout(r, NETWORK_MS));
      const exchange = this.paper ? 'paperKraken' : 'kraken';
      const pair = {
        pair: '0G-USD',
        exchange,
        code: '0G/USD',
        baseAsset: { name: '0G', minAmount: 1, maxAmount: 1e9, step: 1 },
        quoteAsset: { name: 'USD', minAmount: 1 },
        priceAssetPrecision: 4,
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

function mount() {
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
}

const providers = () =>
  Object.keys(useTradingPairsDataStore.getState().pairsByProvider);

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
  queryClient.clear();
  requests.length = 0;
  useAuthStore.setState({
    tokens: { accessToken: 'test-token' },
    user: { id: 'u1', email: 'reporter@example.com' },
  } as never);
  useUIStore.setState({ isLiveTrading: true, tradingMode: 'live' } as never);
  useTradingPairsDataStore.setState({
    pairsByProvider: {},
    timestamp: 0,
    context: null,
    isLoading: false,
    error: null,
    initialLoaded: false,
    _hasHydrated: true,
  } as never);
});

afterEach(() => {
  const r = root;
  if (r) act(() => r.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

describe('useTradingPairs — trading-context switch', () => {
  it('fetches the paper pair list after a live -> paper switch', async () => {
    mount();
    await step(NETWORK_MS + 200);
    expect(providers()).toEqual(['kraken']);

    act(() => useUIStore.getState().setTradingMode(false));
    await step(NETWORK_MS + 400);

    expect(requests.map((r) => r.paper)).toEqual([false, true]);
    expect(providers()).toEqual(['paperKraken']);
    expect(useTradingPairsDataStore.getState().context).toBe('paper');
  });

  it('never stamps the live list as loaded for the paper context', async () => {
    mount();
    await step(NETWORK_MS + 200);

    act(() => useUIStore.getState().setTradingMode(false));
    await step(50);

    // Mid-flight the previous list may still be displayed, but it must not be
    // recorded as the loaded paper list — that is what disabled the fetch.
    const s = useTradingPairsDataStore.getState();
    expect(s.initialLoaded && s.pairsByProvider['kraken'] !== undefined).toBe(
      false
    );
  });

  it('repopulates an emptied store from the cached same-context result', async () => {
    mount();
    await step(NETWORK_MS + 200);
    expect(providers()).toEqual(['kraken']);

    act(() =>
      useTradingPairsDataStore.setState({
        pairsByProvider: {},
        timestamp: 0,
        initialLoaded: false,
      } as never)
    );
    await step(50);

    expect(providers()).toEqual(['kraken']);
    expect(requests).toHaveLength(1);
  });
});
