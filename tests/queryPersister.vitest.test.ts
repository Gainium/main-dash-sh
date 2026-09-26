// Spec 064 §2 — the React Query persister keeps only small allowlisted queries
// and caps the blob.
import { describe, expect, it } from 'vitest';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
import { capPersistedClient, shouldPersistQuery } from '../src/lib/queryClient';

const q = (key: string, status = 'success') => ({ queryKey: [key, 'vars'], state: { status } });

describe('React Query persistence policy (§2)', () => {
  it('persists successful queries except the large/volatile ones', () => {
    expect(shouldPersistQuery(q('user-settings'))).toBe(true);
    // The Overview's cheap dashboard queries render from the cache on reload.
    for (const small of ['getProfitByUser', 'dcaDealDashboardStats', 'getPortfolioByUser', 'inPositions:dca']) {
      expect(shouldPersistQuery(q(small))).toBe(true);
    }
    expect(shouldPersistQuery(q('user-settings', 'pending'))).toBe(false);
    expect(shouldPersistQuery(q('user-settings', 'error'))).toBe(false);
    for (const big of ['dcaBotList', 'getMessageBot', 'getAllPairs', 'dcaDealList', 'getDCADeals']) {
      expect(shouldPersistQuery(q(big))).toBe(false);
    }
    expect(shouldPersistQuery({ ...q('user-settings'), meta: { persist: false } })).toBe(false);
  });

  it('drops a query over the per-query cap, strips meta, never keeps mutations', () => {
    const mk = (hash: string, data: unknown) => ({
      queryKey: [hash],
      queryHash: hash,
      state: { data, status: 'success' },
      meta: { fn: () => 1 },
    });
    const client = {
      timestamp: 1,
      buster: 'x',
      clientState: {
        mutations: [{}],
        queries: [mk('small', { a: 1 }), mk('huge', 'x'.repeat(300 * 1024))],
      },
    } as unknown as PersistedClient;
    const out = capPersistedClient(client);
    expect(out.clientState.queries.map((x) => x.queryHash)).toEqual(['small']);
    expect('meta' in (out.clientState.queries[0] ?? {})).toBe(false);
    expect(out.clientState.mutations).toEqual([]);
  });
});
