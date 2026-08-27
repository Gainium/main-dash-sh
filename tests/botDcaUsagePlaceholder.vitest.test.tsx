/**
 * Runner note: same as `botSpecificDealsPaging.vitest.test.tsx` — this file
 * renders a real hook in jsdom and mocks a module, so it is a Vitest file, not
 * one of core's Playwright `.unit.test.ts` pure-function tests. Run from the
 * parent: `npx vitest run core/tests/botDcaUsagePlaceholder.vitest.test.tsx`.
 */

/**
 * DCA Analysis showed ANOTHER BOT'S deal counts after switching bots.
 *
 * Reported on community topic 5015 as figures that "go back to only a portion
 * and then back again", which reads as a refresh glitch but is not: the numbers
 * are a different bot's, held until the new bot's request answers.
 *
 * Cause: `lib/queryClient` sets a GLOBAL `placeholderData: (prev) => prev`.
 * That callback is not keyed on anything — the moment the query key changes,
 * and for this hook the key changes because the BOT changed, react-query
 * replays the previous bot's payload under the new key with a success status
 * and `isLoading` false. The widget renders it as settled fact, with no
 * spinner, until the network answers. Measured against production that was
 * about seven seconds of confidently wrong numbers.
 *
 * This is the same trap that produced bug #510 one layer down, where the
 * replayed payload was the previous PAGE rather than the previous bot.
 *
 * The hook opts out (`placeholderData: undefined`). Nothing is lost: when the
 * new key already has cached data, react-query serves that cache without
 * consulting placeholderData at all — which the third test pins, so the fix
 * cannot be "fixed" by making every bot switch flash a spinner.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useBotDcaUsage } from '@/hooks/bots/dca/useBotDcaUsage';

const BOT_BIG = '699d6a0726b562500581e0d3'; // 794 finished
const BOT_SMALL = '699d687326b562500581aebb'; // 704 finished
const NETWORK_MS = 400;

/** finished-deal totals the fake backend reports per bot */
const TOTALS: Record<string, number> = { [BOT_BIG]: 794, [BOT_SMALL]: 704 };

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  class FakeGraphQLClient {
    async request(_query: string, variables: unknown) {
      const id = (variables as { input?: { id?: string } })?.input?.id ?? '';
      await new Promise((r) => setTimeout(r, NETWORK_MS));
      const payload = {
        status: 'OK',
        data: {
          finished: [{ dcas: 0, deals: TOTALS[id] ?? 0, configured: 5 }],
          active: [],
          maxConfiguredDcas: 5,
        },
      };
      return { getBotDcaUsage: payload, getComboBotDcaUsage: payload };
    }
  }
  return { ...actual, GraphQLClient: FakeGraphQLClient };
});

let root: Root | null = null;
let host: HTMLElement | null = null;

/**
 * Mounts the hook and re-renders it with a different `botId` on demand — the
 * drawer switching bots without unmounting the widget. The bot is a PROP driven
 * by the test's own `render` call rather than component state, so nothing is
 * assigned to an outer variable during render.
 */
function renderHook<R>(hook: () => R): {
  get: () => R;
  rerender: () => void;
} {
  const ref: { current: R | null } = { current: null };
  function Probe() {
    ref.current = hook();
    return null;
  }
  const el = document.createElement('div');
  document.body.appendChild(el);
  host = el;
  const r = createRoot(el);
  root = r;
  const rerender = () =>
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
  rerender();
  return {
    get: () => {
      if (ref.current === null) throw new Error('hook did not render');
      return ref.current;
    },
    rerender,
  };
}

/** Total finished deals the widget would render, or null while it has none. */
const shown = (r: ReturnType<typeof useBotDcaUsage> | null): number | null => {
  const f = r?.usage?.finished;
  if (!f) return null;
  return f.reduce((s, b) => s + b.deals, 0);
};

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
  useAuthStore.setState({
    tokens: { accessToken: 'test-token' },
    user: { id: 'u1', email: 'reporter@example.com' },
  } as never);
  useUIStore.setState({ isLiveTrading: true, tradingMode: 'live' } as never);
});

afterEach(() => {
  const r = root;
  if (r) act(() => r.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

describe('useBotDcaUsage — no cross-bot placeholder replay (topic 5015)', () => {
  it('never reports one bot’s deal counts while another bot is selected', async () => {
    let bot = BOT_BIG;
    const h = renderHook(() => useBotDcaUsage({ botId: bot, isComboBot: false }));
    const get = h.get;
    const show = (id: string) => {
      bot = id;
      h.rerender();
    };
    await step(NETWORK_MS + 200);
    expect(shown(get())).toBe(TOTALS[BOT_BIG]);

    // Switch bots and sample the whole in-flight window.
    show(BOT_SMALL);
    const seen: Array<number | null> = [];
    for (let t = 0; t < NETWORK_MS + 400; t += 50) {
      await step(50);
      seen.push(shown(get()));
    }

    // The big bot's number must never appear once the small bot is selected.
    expect(seen).not.toContain(TOTALS[BOT_BIG]);
    // And it must land on the right one.
    expect(shown(get())).toBe(TOTALS[BOT_SMALL]);
  });

  it('reports nothing (so the widget shows its loading state) while in flight', async () => {
    let bot = BOT_BIG;
    const h = renderHook(() => useBotDcaUsage({ botId: bot, isComboBot: false }));
    const get = h.get;
    const show = (id: string) => {
      bot = id;
      h.rerender();
    };
    await step(NETWORK_MS + 200);

    show(BOT_SMALL);
    await step(50);
    // Mid-flight for a bot with no cached data: no usage at all, rather than
    // someone else's. `usage === undefined` is what makes DrawerDCAMetrics
    // render "Loading DCA analysis..." instead of a settled wrong number.
    expect(shown(get())).toBeNull();
  });

  it('still serves a previously loaded bot from cache, with no refetch gap', async () => {
    let bot = BOT_BIG;
    const h = renderHook(() => useBotDcaUsage({ botId: bot, isComboBot: false }));
    const get = h.get;
    const show = (id: string) => {
      bot = id;
      h.rerender();
    };
    await step(NETWORK_MS + 200);
    show(BOT_SMALL);
    await step(NETWORK_MS + 200);
    expect(shown(get())).toBe(TOTALS[BOT_SMALL]);

    // Back to the first bot: its data is cached, so it must be there on the
    // very next render — opting out of placeholderData must not have cost us
    // the cache hit.
    show(BOT_BIG);
    await step(0);
    expect(shown(get())).toBe(TOTALS[BOT_BIG]);
  });
});
