/**
 * Runner: Vitest (jsdom). `npx vitest run core/tests/dealListServerSupport.vitest.test.tsx`.
 *
 * The deal-list backend probe (old vs new server) and the mapping of the
 * server's filtered-set totals onto footer columns.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useDealFilterBackend } from '@/hooks/useDealListServerSupport';
import {
  DEALS_TAB_TOTALS_COLUMNS,
  mapDealTotals,
} from '@/hooks/useDealTablePaging';

let mode: 'old' | 'new' | 'down' = 'old';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  class FakeGraphQLClient {
    async request(query: string) {
      if (/dealListFilterProbe/.test(query)) {
        if (mode === 'old')
          throw new Error(
            'HTTP error! status: 400 - Cannot query field "totals" on type "getDCADealsResponse".'
          );
        if (mode === 'down') throw new Error('Failed to fetch');
        return { dcaDealList: { total: 5, totals: { count: 5 } } };
      }
      return {};
    }
  }
  return { ...actual, GraphQLClient: FakeGraphQLClient };
});

let root: Root | null = null;
let host: HTMLElement | null = null;

async function probe(): Promise<string> {
  const ref = { current: '' };
  function Probe({ onValue }: { onValue: (v: string) => void }) {
    const v = useDealFilterBackend();
    useEffect(() => onValue(v), [v, onValue]);
    return null;
  }
  const onValue = (v: string) => {
    ref.current = v;
  };
  const client = new QueryClient();
  host = document.createElement('div');
  document.body.appendChild(host);
  const r = createRoot(host);
  root = r;
  act(() => {
    r.render(
      createElement(QueryClientProvider, { client }, createElement(Probe, { onValue }) as ReactNode)
    );
  });
  for (let i = 0; i < 20; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
  return ref.current;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  useAuthStore.setState({ tokens: { accessToken: 't' } } as never);
  useUIStore.setState({ isLiveTrading: true, tradingMode: 'live' } as never);
});

afterEach(() => {
  const r = root;
  if (r) act(() => r.unmount());
  host?.remove();
  root = null;
});

describe('useDealFilterBackend', () => {
  it('an older backend (schema rejects `totals`) reads as old', async () => {
    mode = 'old';
    expect(await probe()).toBe('old');
  });
  it('a newer backend reads as new', async () => {
    mode = 'new';
    expect(await probe()).toBe('new');
  });
  it('a transport failure reads as old (safe), not new', async () => {
    mode = 'down';
    expect(await probe()).toBe('old');
  });
});

describe('mapDealTotals', () => {
  it('maps filtered-set totals onto the Deals tab columns, with USD coverage', () => {
    const m = mapDealTotals(
      {
        count: 120,
        cost: 5000,
        costUsd: 4800,
        costUsdDeals: 118,
        realizedProfitUsd: 321.5,
        unrealizedProfitNet: -12,
        unrealizedProfitNetDeals: 90,
      },
      DEALS_TAB_TOTALS_COLUMNS
    );
    expect(m.cost).toEqual({ value: 5000 });
    expect(m.realizedProfit).toEqual({ value: 321.5 });
    expect(m.unrealizedProfit).toEqual({
      value: -12,
      coverage: { covered: 90, count: 120 },
    });
  });
});
