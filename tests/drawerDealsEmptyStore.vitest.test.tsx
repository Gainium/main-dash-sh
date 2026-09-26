/**
 * Runner: `npx vitest run core/tests/drawerDealsEmptyStore.vitest.test.tsx`
 * from the cloud parent.
 *
 * Spec 067 §4 — the bot drawer's Deals tab (useDealTablePaging →
 * useDcaDeals({botId})) and the per-bot combo list read their bot's bucket of
 * the deal store. With deals loaded page by page and the persisted deal cache
 * bounded, that bucket is routinely ABSENT when the tab opens (a bot none of
 * whose deals is held yet). `Object.values(undefined)` then threw "Cannot
 * convert undefined or null to object" and took the page into the error
 * boundary. An absent bucket is an empty bucket.
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
import { useComboDeals } from '@/hooks/useComboDeals';
import { useDealTablePaging } from '@/hooks/useDealTablePaging';
import { DCADealStatusEnum } from '@/types';

const BOT_ID = 'bot-with-no-bucket';

// Server holds no deals for the bot; the request resolves empty.
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  class FakeGraphQLClient {
    async request() {
      return {
        dcaDealList: {
          status: 'OK',
          reason: null,
          total: 0,
          data: { page: null, totalPages: null, totalResults: null, result: [] },
        },
      };
    }
  }
  return { ...actual, GraphQLClient: FakeGraphQLClient };
});
vi.mock('@/hooks/useGraphQL', () => {
  const empty = {
    data: undefined,
    isLoading: true,
    isError: false,
    error: null,
    refetch: async () => undefined,
  };
  return { useGraphQL: () => empty };
});
vi.mock('@/helper/price', () => ({
  default: () => () => {},
  getLocalPrices: () => [],
}));

let root: Root | null = null;
let host: HTMLElement | null = null;
function render<R>(hook: () => R): () => R {
  const ref: { current: R | null } = { current: null };
  let error: unknown = null;
  function Probe() {
    try {
      ref.current = hook();
    } catch (e) {
      error = e;
    }
    return null;
  }
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(
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
  if (error) throw error;
  return () => ref.current as R;
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
  // Other bots have buckets; this bot has none.
  useDealStore.setState({
    deals: { 'other-bot': {} },
    _hasHydrated: true,
  } as never);
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe('per-bot deal lists with no store bucket (spec 067 §4)', () => {
  it('useDcaDeals({botId}) renders an empty list instead of throwing', () => {
    const get = render(() =>
      useDcaDeals({ botId: BOT_ID, status: DCADealStatusEnum.closed })
    );
    expect(get().deals).toEqual([]);
  });

  it('the drawer Deals tab paging hook (open and closed) renders empty', () => {
    for (const status of ['open', 'closed'] as const) {
      const get = render(() =>
        useDealTablePaging({ status, terminal: false, botId: BOT_ID })
      );
      expect(Array.isArray(get().deals)).toBe(true);
      act(() => root?.unmount());
      host?.remove();
    }
  });

  it('useComboDeals({botId}) renders an empty list instead of throwing', () => {
    const get = render(() => useComboDeals({ botId: BOT_ID }));
    expect(get().deals).toEqual([]);
  });
});
