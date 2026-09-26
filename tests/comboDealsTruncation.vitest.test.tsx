/**
 * Runner: `npx vitest run core/tests/comboDealsTruncation.vitest.test.tsx`
 * from the cloud parent.
 *
 * Spec 067 §5 — useComboDeals issues ONE comboDealList request, which the
 * server caps at 500 rows. The per-page envelope is null on the live backend,
 * so the hook treated every response as complete: a 700-deal result showed
 * 500 with no indication and let the store absence-delete the other 200.
 * The operation's top-level `total` is the true count.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { useDealStore } from '@/stores/live';
import { useUIStore } from '@/stores/uiStore';
import { useComboDeals } from '@/hooks/useComboDeals';
import { DCADealStatusEnum } from '@/types';

const BOT_ID = 'combo-bot-1';
let serverTotal = 700;
const rows = () =>
  Array.from({ length: Math.min(500, serverTotal) }, (_, i) => ({
    _id: `c-${i}`,
    botId: BOT_ID,
    status: 'closed',
    paperContext: false,
    updateTime: 1_700_000_000_000,
  }));

// One stable response object per fixture, like React Query's cached data.
let response: unknown = null;
let responseFor = -1;
const stableResult = () => {
  if (responseFor !== serverTotal) {
    responseFor = serverTotal;
    response = {
      data: {
        status: 'OK',
        total: serverTotal,
        data: {
          page: null,
          totalPages: null,
          totalResults: null,
          result: rows(),
        },
        __fetchedAt: Date.now(),
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: async () => undefined,
    };
  }
  return response;
};
vi.mock('@/hooks/useGraphQL', () => ({
  useGraphQL: () => stableResult(),
}));

let root: Root | null = null;
let host: HTMLElement | null = null;
function render<R>(hook: () => R): () => R {
  const ref: { current: R | null } = { current: null };
  function Probe() {
    ref.current = hook();
    return null;
  }
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root?.render(createElement(Probe)));
  return () => ref.current as R;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  serverTotal = 700;
  useUIStore.setState({ isLiveTrading: true, tradingMode: 'live' } as never);
  useDealStore.setState({ deals: {}, _hasHydrated: true } as never);
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe('useComboDeals — 500-row cap (spec 067 §5)', () => {
  it('reports the server total and flags the subset instead of truncating silently', () => {
    const get = render(() =>
      useComboDeals({ paperContext: false, status: DCADealStatusEnum.closed })
    );
    expect(get().deals.length).toBe(500);
    expect(get().total).toBe(700);
    expect(get().isPartial).toBe(true);
  });

  it('a capped response does not absence-delete deals beyond the cap', () => {
    const beyond = {
      _id: 'c-beyond',
      botId: BOT_ID,
      status: 'closed',
      paperContext: false,
      dealType: 'combo',
      updateTime: 1_600_000_000_000,
    };
    useDealStore.setState({
      deals: { [BOT_ID]: { 'c-beyond': beyond } },
      _hasHydrated: true,
    } as never);
    render(() =>
      useComboDeals({ paperContext: false, status: DCADealStatusEnum.closed })
    );
    expect(useDealStore.getState().deals[BOT_ID]?.['c-beyond']).toBeTruthy();
  });

  it('a complete response is not partial', () => {
    serverTotal = 120;
    const get = render(() =>
      useComboDeals({ paperContext: false, status: DCADealStatusEnum.closed })
    );
    expect(get().isPartial).toBe(false);
    expect(get().total).toBe(120);
  });
});
