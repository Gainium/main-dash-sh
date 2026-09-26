/**
 * Runner: Vitest (jsdom). From the cloud parent:
 * `npx vitest run core/tests/botListStoreMerge.vitest.test.tsx`.
 *
 * Spec: specs/065.large-account-ui-and-bot-list-paging.md §1–§3 (parent repo).
 *
 * §1.2(2): the live bot stores REPLACED their whole record with each list
 * response, and callers asked for different status sets — so whichever query
 * landed last decided what every reader saw (the list page lost its closed
 * bots after visiting a page whose widgets fetch open/range/monitoring).
 * §1.2(1): the list was fetched without `dataGridInput`, capped at 500 by the
 * server, and the true `total` was ignored.
 *
 * The fake client below answers like the backend: it honours the requested
 * `status` set, caps at 500 rows without `dataGridInput`, and returns the true
 * `total`.
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
import { mergeBotListSnapshot } from '@/stores/live/botListMerge';

type FakeBot = {
  _id: string;
  status: string;
  paperContext?: boolean;
  updated: string;
  created: string;
  settings: { name: string; type: string };
};

const mkBot = (i: number, status: string): FakeBot => ({
  _id: `bot-${i}`,
  status,
  created: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(),
  updated: '2026-09-01T00:00:00.000Z',
  settings: { name: `Bot ${i}`, type: 'regular' },
});

let SERVER_BOTS: FakeBot[] = [];
const requests: Array<{ status?: string[]; dataGridInput?: { page?: number; pageSize?: number } }> = [];

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  class FakeGraphQLClient {
    async request(query: string, variables?: { input?: { status?: string[]; dataGridInput?: { page?: number; pageSize?: number } } }) {
      if (!/dcaBotList/.test(query)) return {};
      const input = variables?.input ?? {};
      requests.push({ status: input.status, dataGridInput: input.dataGridInput });
      const matching = SERVER_BOTS.filter((b) => !input.status || input.status.includes(b.status));
      const page = input.dataGridInput?.page ?? 0;
      const size = input.dataGridInput ? (input.dataGridInput.pageSize ?? 100) : 500;
      const data = matching.slice(page * size, page * size + size);
      // Deep-copy so every response carries fresh objects, like the network.
      return {
        dcaBotList: { status: 'OK', reason: null, total: matching.length, data: JSON.parse(JSON.stringify(data)) },
      };
    }
  }
  return { ...actual, GraphQLClient: FakeGraphQLClient };
});

let root: Root | null = null;
let host: HTMLElement | null = null;

function renderHooks<T extends Record<string, () => unknown>>(hooks: T) {
  const ref: { current: Record<string, unknown> } = { current: {} };
  function Probe() {
    const out: Record<string, unknown> = {};
    for (const [name, hook] of Object.entries(hooks)) out[name] = hook();
    ref.current = out;
    return null;
  }
  host = document.createElement('div');
  document.body.appendChild(host);
  const r = createRoot(host);
  root = r;
  act(() => {
    r.render(
      createElement(
        MemoryRouter,
        null,
        createElement(QueryClientProvider, { client: queryClient }, createElement(Probe) as ReactNode) as ReactNode
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

type HookOut = { bots: FakeBot[]; total: number; isPartial: boolean; loadedCount: number };

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  queryClient.clear();
  requests.length = 0;
  useAuthStore.setState({
    tokens: { accessToken: 'test-token' },
    user: { id: 'u1', email: 'user@example.com', paperContext: false },
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

describe('bot list store — merge, not replace (§1.2(2), §3.1, §3.2)', () => {
  it('a status-subset caller does not change what the list page shows', async () => {
    // 4 open + 2 closed, as in the evidence trace (§2).
    SERVER_BOTS = [mkBot(1, 'open'), mkBot(2, 'open'), mkBot(3, 'open'), mkBot(4, 'open'), mkBot(5, 'closed'), mkBot(6, 'closed')];
    // List page first, Overview widget second: the widget's response writes last.
    const ref = renderHooks({
      useList: () => useDcaBots({ status: [] }),
      useWidget: () => useDcaBots({ status: ['open', 'range', 'monitoring'] }),
    });
    await settle();

    const list = ref.current.useList as HookOut;
    const widget = ref.current.useWidget as HookOut;
    expect(list.bots.map((b) => b._id).sort()).toEqual(['bot-1', 'bot-2', 'bot-3', 'bot-4', 'bot-5', 'bot-6']);
    // The subset caller gets its subset, from the same canonical data.
    expect(widget.bots.map((b) => b._id).sort()).toEqual(['bot-1', 'bot-2', 'bot-3', 'bot-4']);
  });

  it('every store-sharing caller issues the SAME canonical request (one per context)', async () => {
    SERVER_BOTS = [mkBot(1, 'open'), mkBot(2, 'closed')];
    renderHooks({
      a: () => useDcaBots(),
      b: () => useDcaBots({ status: ['open'] }),
      c: () => useDcaBots({ status: ['open', 'range', 'monitoring'] }),
    });
    await settle();
    const distinct = new Set(requests.map((r) => JSON.stringify(r)));
    expect(distinct.size).toBe(1);
    expect(requests[0].dataGridInput).toEqual({ page: 0, pageSize: 500 });
  });
});

describe('bot list — never silently capped (§1.2(1), §3.3)', () => {
  it('exposes the server total and isPartial when the account holds more than one window', async () => {
    SERVER_BOTS = Array.from({ length: 1497 }, (_, i) => mkBot(i, 'open'));
    const ref = renderHooks({ useList: () => useDcaBots() });
    await settle();
    const list = ref.current.useList as HookOut;
    expect(list.bots.length).toBe(500);
    expect(list.loadedCount).toBe(500);
    expect(list.total).toBe(1497);
    expect(list.isPartial).toBe(true);
  });

  it('is not partial when everything fits', async () => {
    SERVER_BOTS = [mkBot(1, 'open'), mkBot(2, 'open')];
    const ref = renderHooks({ useList: () => useDcaBots() });
    await settle();
    const list = ref.current.useList as HookOut;
    expect(list.isPartial).toBe(false);
    expect(list.total).toBe(2);
  });
});

describe('mergeBotListSnapshot (§3.2)', () => {
  const held = (id: string, status: string, paperContext = false) =>
    ({ ...mkBot(Number(id.replace(/\D/g, '')) || 0, status), _id: id, paperContext });

  it('a complete response removes held bots in its scope (deleted / archived)', () => {
    const existing = { a: held('a', 'open'), b: held('b', 'open') };
    const next = mergeBotListSnapshot(existing, [held('a', 'open')], { paperContext: false, statuses: ['open', 'closed'], complete: true });
    expect(Object.keys(next)).toEqual(['a']);
  });

  it('a partial (capped / paged) response never removes', () => {
    const existing = { a: held('a', 'open'), b: held('b', 'open') };
    const next = mergeBotListSnapshot(existing, [held('a', 'open')], { paperContext: false, statuses: ['open'], complete: false });
    expect(Object.keys(next).sort()).toEqual(['a', 'b']);
  });

  it('a complete response for a status subset leaves other statuses alone', () => {
    const existing = { a: held('a', 'open'), c: held('c', 'closed') };
    const next = mergeBotListSnapshot(existing, [held('a', 'open')], { paperContext: false, statuses: ['open'], complete: true });
    expect(Object.keys(next).sort()).toEqual(['a', 'c']);
  });

  it('a complete response for one context leaves the other context alone', () => {
    const existing = { a: held('a', 'open', false), p: held('p', 'open', true) };
    const next = mergeBotListSnapshot(existing, [], { paperContext: false, statuses: ['open'], complete: true });
    expect(Object.keys(next)).toEqual(['p']);
  });

  it('returns the same record when nothing changed, and upserts without scope', () => {
    const a = held('a', 'open');
    const existing = { a };
    expect(mergeBotListSnapshot(existing, [a])).toBe(existing);
    const next = mergeBotListSnapshot(existing, [held('b', 'open')]);
    expect(Object.keys(next).sort()).toEqual(['a', 'b']);
  });

  it('keeps the held copy when the incoming one is older (stale replay)', () => {
    const fresh = { ...held('a', 'open'), updated: '2026-09-02T00:00:00.000Z' };
    const stale = { ...held('a', 'closed'), updated: '2026-09-01T00:00:00.000Z' };
    const next = mergeBotListSnapshot({ a: fresh }, [stale], { paperContext: false, statuses: ['open', 'closed'], complete: true });
    expect(next.a).toBe(fresh);
  });
});
