/**
 * Runner: `npx vitest run core/tests/positionTotalsUnsupported.vitest.test.tsx`
 * from the cloud parent.
 *
 * Spec 067 §6 — "In positions" comes only from the server's
 * `botDashboardStats.inPositionsUsd`. On a backend without that field (the
 * query fails with a GraphQL validation error) it must be `null` — rendered as
 * NotCalculated — never a number from some other source.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

type Q = {
  data?: unknown;
  isError: boolean;
  isLoading: boolean;
  error: Error | null;
};

let supported = false;
let inFlight = false;
const cache = new Map<string, Q>();
const answer = (key: string, query: string): Q => {
  const id = `${supported}|${key}`;
  const hit = cache.get(id);
  if (hit) return hit;
  let q: Q;
  const newField = /inPositionsUsd|unrealizedProfitNet/.test(query);
  if (newField && !supported) {
    q = {
      data: undefined,
      isError: true,
      isLoading: false,
      error: new Error(
        'HTTP error! status: 400 - Cannot query field "inPositionsUsd" on type "botDashboardStats".'
      ),
    };
  } else if (/inPositionsUsd/.test(query)) {
    q = {
      data: {
        status: 'OK',
        data: { inPositionsUsd: 100, inPositionsCount: 2, inPositionsUnpriced: 0 },
      },
      isError: false,
      isLoading: false,
      error: null,
    };
  } else {
    q = {
      data: {
        status: 'OK',
        data: {
          result: [{ normal: 3, unrealizedProfit: -5, unrealizedProfitNet: -6 }],
        },
      },
      isError: false,
      isLoading: false,
      error: null,
    };
  }
  cache.set(id, q);
  return q;
};

type Opts = { enabled?: boolean; staleTime?: number; gcTime?: number };
/** Every enabled request per render: key + options (spec 064 follow-up). */
const requested: Array<{ key: string; opts: Opts | undefined }> = [];
vi.mock('@/hooks/useGraphQL', () => ({
  useGraphQL: (key: string, gql: { query: string }, opts?: Opts) => {
    if (opts?.enabled === false) {
      return { data: undefined, isError: false, isLoading: false, error: null };
    }
    requested.push({ key, opts });
    // In-flight mode: nothing has answered yet (the real first render).
    if (inFlight) return { data: undefined, isError: false, isLoading: true, error: null };
    return answer(key, gql.query);
  },
}));

import { usePositionTotals } from '@/hooks/usePositionTotals';

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
  act(() => root?.render(createElement(Probe)));
  return () => ref.current as R;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  cache.clear();
  requested.length = 0;
  inFlight = false;
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe('usePositionTotals — backend without the new fields (spec 067 §6)', () => {
  it('In positions is null (not calculated), never a number', () => {
    supported = false;
    const get = render(() => usePositionTotals(SCOPES));
    expect(get().inPositionsUsd).toBeNull();
    // uPnL falls back to the legacy server sum, labelled as not fee-inclusive
    expect(get().unrealizedIsNet).toBe(false);
    expect(get().unrealizedUsd).toBe(-20);
  });

  it('with the fields, sums the server values per type', () => {
    supported = true;
    const get = render(() => usePositionTotals(SCOPES));
    expect(get().inPositionsUsd).toBe(600);
    expect(get().inPositionsCount).toBe(12);
    expect(get().unrealizedIsNet).toBe(true);
    expect(get().unrealizedUsd).toBe(-24);
  });

  it('fires every scope in parallel with the probe (no sequential round-trip)', () => {
    supported = false;
    inFlight = true; // the dca probe has not answered yet
    render(() => usePositionTotals(SCOPES));
    const firstRenderKeys = new Set(requested.map((q) => q.key));
    // All six in-position scopes and the four net scopes were requested on
    // the FIRST render, before any probe answer could exist.
    for (const scope of SCOPES.positions) {
      expect(firstRenderKeys.has(`inPositions:${scope}`)).toBe(true);
    }
    expect([...firstRenderKeys].filter((k) => k.endsWith(':net'))).toHaveLength(
      SCOPES.pnl.length
    );
  });

  it('the probe stays cached for the session; unknown fields still end at NotCalculated / legacy', () => {
    supported = false;
    const get = render(() => usePositionTotals(SCOPES));
    const probe = requested.find(
      (q) => q.key === 'inPositions:dca' && q.opts?.staleTime === Infinity
    );
    expect(probe?.opts?.gcTime).toBe(Infinity);
    expect(get().inPositionsUsd).toBeNull();
    expect(get().unrealizedIsNet).toBe(false);
    expect(get().unrealizedUsd).toBe(-20);
  });
});
