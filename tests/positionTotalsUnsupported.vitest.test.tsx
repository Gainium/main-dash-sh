/**
 * Runner: `npx vitest run core/tests/positionTotalsUnsupported.vitest.test.tsx`
 * from the cloud parent.
 *
 * Spec 067 §6 — "In positions" comes only from the server's
 * `botDashboardStats.inPositionsUsd`. On a backend without that field it must
 * be `null` (rendered as NotCalculated), never a number from another source,
 * and uPnL falls back to the legacy server sum.
 *
 * Batched documents (spec 067 §6.1): the stats are fetched as three GraphQL
 * documents — legacy stats, In positions, fee-inclusive uPnL — all fired on
 * the first render. A new field never shares a document with the legacy
 * fields (a document with an unknown field fails whole), and once a backend
 * has rejected a new-field document it is not re-sent this session.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';

let supported = false;
/** Every document sent, in order. */
const sent: string[] = [];
/** Resolve nothing until released (the real first render). */
let hold: Promise<void> | null = null;

const aliasesOf = (query: string) =>
  [...query.matchAll(/(\w+): (\w+)\(input:/g)].map((m) => ({
    alias: m[1],
    field: m[2],
  }));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  class FakeGraphQLClient {
    async request(query: string) {
      sent.push(query);
      if (hold) await hold;
      const isNew = /inPositionsUsd|unrealizedProfitNet/.test(query);
      if (isNew && !supported) {
        throw new Error(
          'HTTP error! status: 400 - Cannot query field "inPositionsUsd" on type "botDashboardStats". GRAPHQL_VALIDATION_FAILED'
        );
      }
      const out: Record<string, unknown> = {};
      for (const { alias, field } of aliasesOf(query)) {
        if (/inPositionsUsd/.test(query)) {
          out[alias] = {
            status: 'OK',
            data: {
              inPositionsUsd: 100,
              inPositionsCount: 2,
              inPositionsUnpriced: 0,
            },
          };
        } else if (/unrealizedProfitNet/.test(query)) {
          out[alias] = {
            status: 'OK',
            data: { result: [{ unrealizedProfitNet: -6 }] },
          };
        } else if (field === 'dealDashboardStats') {
          out[alias] = {
            status: 'OK',
            data: { result: [{ normal: 3, unrealizedProfit: -5 }] },
          };
        } else if (field === 'botDashboardStats') {
          out[alias] = { status: 'OK', data: { result: [] } };
        } else {
          out[alias] = { status: 'OK', data: { result: [{ quote: 1 }] } };
        }
      }
      return out;
    }
  }
  return { ...actual, GraphQLClient: FakeGraphQLClient };
});

import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { usePositionTotals } from '@/hooks/usePositionTotals';
import { __resetFieldSupportForTests } from '@/hooks/useDashboardStatsBatch';

const SCOPES = {
  positions: ['dca', 'terminal', 'combo', 'grid', 'hedgeDca', 'hedgeCombo'],
  pnl: ['dca', 'terminal', 'combo', 'hedgeCombo'],
} as const;

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
  act(() =>
    root?.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(Probe) as ReactNode
      )
    )
  );
  return () => ref.current as R;
}
function unmount() {
  act(() => root?.unmount());
  host?.remove();
}
async function settle() {
  for (let i = 0; i < 20; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  queryClient.clear();
  __resetFieldSupportForTests();
  sent.length = 0;
  hold = null;
  useAuthStore.setState({
    tokens: { accessToken: 'test-token' },
    user: { id: 'u1', email: 'user@example.com' },
  } as never);
  useUIStore.setState({ isLiveTrading: true, tradingMode: 'live' } as never);
});
afterEach(() => unmount());

describe('usePositionTotals — backend without the new fields (spec 067 §6)', () => {
  it('In positions is null (not calculated), never a number', async () => {
    supported = false;
    const get = render(() => usePositionTotals(SCOPES));
    await settle();
    expect(get().inPositionsUsd).toBeNull();
    // uPnL falls back to the legacy server sum, labelled as not fee-inclusive
    expect(get().unrealizedIsNet).toBe(false);
    expect(get().unrealizedUsd).toBe(-20);
    expect(get().openDeals).toBe(12);
  });

  it('with the fields, sums the server values per type', async () => {
    supported = true;
    const get = render(() => usePositionTotals(SCOPES));
    await settle();
    expect(get().inPositionsUsd).toBe(600);
    expect(get().inPositionsCount).toBe(12);
    expect(get().unrealizedIsNet).toBe(true);
    expect(get().unrealizedUsd).toBe(-24);
  });
});

describe('batched documents (spec 067 §6.1)', () => {
  it('fires exactly three documents, all on the first render (no sequential round-trip)', async () => {
    supported = true;
    let release: () => void = () => {};
    hold = new Promise<void>((r) => (release = r));
    render(() => usePositionTotals(SCOPES));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    // Nothing has answered yet, and all three are already in flight.
    expect(sent).toHaveLength(3);
    release();
    await settle();
    expect(sent).toHaveLength(3);
  });

  it('keeps every new field out of the legacy document, and each document carries all its scopes', async () => {
    supported = true;
    render(() => usePositionTotals(SCOPES));
    await settle();
    const legacy = sent.filter(
      (q) => !/inPositionsUsd|unrealizedProfitNet/.test(q)
    );
    const inPos = sent.filter((q) => /inPositionsUsd/.test(q));
    const net = sent.filter((q) => /unrealizedProfitNet/.test(q));
    expect(legacy).toHaveLength(1);
    expect(inPos).toHaveLength(1);
    expect(net).toHaveLength(1);
    expect(inPos[0]).not.toMatch(/unrealizedProfitNet/);
    expect(aliasesOf(inPos[0]).map((a) => a.alias)).toEqual([
      'dca',
      'terminal',
      'combo',
      'grid',
      'hedgeDca',
      'hedgeCombo',
    ]);
    expect(aliasesOf(net[0])).toHaveLength(4);
    // botDashboardStats ×4, dealDashboardStats ×4, getProfitByUser ×5
    expect(aliasesOf(legacy[0])).toHaveLength(13);
  });

  it('a second consumer shares the cached batches (no new requests)', async () => {
    supported = true;
    render(() => usePositionTotals(SCOPES));
    await settle();
    unmount();
    render(() =>
      usePositionTotals({ positions: ['grid'], pnl: [] })
    );
    await settle();
    expect(sent).toHaveLength(3);
  });

  it('after a rejection the new-field documents are not re-sent this session; the result still ends at NotCalculated / legacy', async () => {
    supported = false;
    render(() => usePositionTotals(SCOPES));
    await settle();
    unmount();
    queryClient.clear();
    sent.length = 0;
    const get = render(() => usePositionTotals(SCOPES));
    await settle();
    expect(sent.filter((q) => /inPositionsUsd|unrealizedProfitNet/.test(q))).toHaveLength(0);
    expect(get().inPositionsUsd).toBeNull();
    expect(get().unrealizedUsd).toBe(-20);
    expect(get().unrealizedIsNet).toBe(false);
  });
});
