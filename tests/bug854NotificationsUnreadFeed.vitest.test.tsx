/**
 * Runner note: `.vitest.test.tsx`, not `.unit.test.ts`. core's own
 * `playwright.unit.config.ts` only collects `.unit.test.*`, so it never sees
 * this file; the parent's `vitest.config.ts` includes core's `.vitest.test.*`
 * and supplies `import.meta.env`, which every module importing the logger needs.
 * Run from the parent:
 *   NODE_ENV=development npx vitest run core/tests/bug854NotificationsUnreadFeed.vitest.test.tsx
 * (`NODE_ENV=development` is required on the VPS, where the shell exports
 * `production` and React's prod build has no `act`.)
 *
 * Bug #854 — "Bot notifications aren't clearing". The reporter's dismissals had
 * all persisted (his unread feed was empty), but typing a search term in the
 * notifications panel brought four already-dismissed messages back, each with a
 * "New" chip, an unread badge and a mark-as-read control that could never
 * remove them. `useNotifications` asked for `unreadOnly: false` — the ARCHIVE —
 * on any parameterised fetch, while its own default page-1 load asks for the
 * unread feed.
 *
 * The fake client below mirrors the backend's `getBotMessage`: `unreadOnly`
 * defaults to true and only `unreadOnly: false` widens the `isDeleted` filter.
 * See specs/043.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';

import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useNotificationsStore } from '@/stores/notificationsStore';
import { useNotifications } from '@/hooks/useNotifications';

/** The reporter's shape: four SYND-USDC messages, all already dismissed. */
const DISMISSED = [0, 1, 2, 3].map((i) => ({
  _id: `msg-${i}`,
  botId: `bot-${i}`,
  botName: `SCS00${i}`,
  message: 'SYND-USDC is in limit-only mode on the exchange',
  time: 1_758_240_000_000 + i,
  type: 'error',
  symbol: 'SYND-USDC',
  exchange: 'coinbase',
  isDeleted: true,
}));

/** Extra live message so the bulk-clear case has something to clear. */
const UNREAD = {
  _id: 'msg-live',
  botId: 'bot-live',
  botName: 'LIVE',
  message: 'BTC-USDC order filled',
  time: 1_758_240_100_000,
  type: 'info',
  symbol: 'BTC-USDC',
  exchange: 'coinbase',
  isDeleted: false,
};

type BotInput = {
  unreadOnly?: boolean;
  page?: number;
  pageSize?: number;
  search?: string;
};

/** Inputs the hook actually sent for getMessageBot, in order. */
const botInputs: Array<BotInput | null | undefined> = [];
/** What deleteBotMessage should answer. */
let deleteStatus: 'OK' | 'NOTOK' = 'OK';
/** Messages the fake "database" holds. */
let store = [...DISMISSED];

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  class FakeGraphQLClient {
    async request(query: string, variables?: unknown) {
      const input = (variables as { input?: BotInput } | undefined)?.input;
      if (query.includes('getMessageBot')) {
        botInputs.push(input ?? null);
        // Mirror core/src/graphql/handlers/botMessage.handler.ts: unreadOnly
        // defaults to true, and only `false` lets isDeleted:true rows through.
        const unreadOnly = input?.unreadOnly ?? true;
        let rows = unreadOnly ? store.filter((m) => !m.isDeleted) : [...store];
        const search = input?.search?.trim();
        if (search) {
          const re = new RegExp(search, 'i');
          rows = rows.filter(
            (m) => re.test(m.message) || re.test(m.symbol) || re.test(m.botName)
          );
        }
        return {
          getMessageBot: {
            status: 'OK',
            reason: null,
            data: { result: rows },
            total: rows.length,
          },
        };
      }
      if (query.includes('deleteBotMessage')) {
        if (deleteStatus === 'OK') {
          const id = (variables as { input?: { id?: string } } | undefined)
            ?.input?.id;
          store = store.map((m) =>
            !id || m._id === id ? { ...m, isDeleted: true } : m
          );
        }
        return {
          deleteBotMessage: {
            status: deleteStatus,
            reason: deleteStatus === 'OK' ? null : 'db error',
          },
        };
      }
      return {};
    }
  }
  return { ...actual, GraphQLClient: FakeGraphQLClient };
});

let root: Root | null = null;
let host: HTMLElement | null = null;

function renderHook<R>(hook: () => R): () => R {
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
  act(() => {
    r.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(Probe) as ReactNode
      ) as ReactNode
    );
  });
  return () => {
    if (ref.current === null) throw new Error('hook did not render');
    return ref.current;
  };
}

/** Let react-query settle its (real-timer) fetches. */
async function settle(ms = 250) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  botInputs.length = 0;
  deleteStatus = 'OK';
  store = [...DISMISSED];
  queryClient.clear();
  useAuthStore.setState({
    tokens: { accessToken: 'test-token' },
    user: { id: 'u1', email: 'reporter@example.com' },
  } as never);
  useUIStore.setState({ isLiveTrading: true, tradingMode: 'live' } as never);
  useNotificationsStore.setState({
    unreadCounts: { bot: 0, announcement: 0, changelog: 0, total: 0 },
  } as never);
});

afterEach(() => {
  const r = root;
  if (r) act(() => r.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('useNotifications — bot feed is the unread feed (bug #854)', () => {
  it('a search does not re-list dismissed bot messages', async () => {
    const get = renderHook(() =>
      useNotifications({ type: 'bot', search: 'SYND', page: 1, pageSize: 20 })
    );
    await settle();

    // Spec §1.1: the search must filter the same set the empty box shows —
    // and that set is empty, because every SYND message was dismissed.
    expect(get().notifications).toHaveLength(0);

    // Spec §3: and it must not ask the backend for the archive to do it.
    expect(botInputs.length).toBeGreaterThan(0);
    for (const input of botInputs) {
      expect(input?.unreadOnly ?? true).toBe(true);
    }
  });

  it('dismissed messages do not reach the unread badge', async () => {
    renderHook(() =>
      useNotifications({ type: 'bot', search: 'SYND', page: 1, pageSize: 20 })
    );
    await settle();

    // Spec §1.2: the red "Bots" badge counted the archived rows.
    expect(useNotificationsStore.getState().unreadCounts.bot).toBe(0);
  });

  it('still returns the live messages a search matches', async () => {
    store = [...DISMISSED, UNREAD];
    const get = renderHook(() =>
      useNotifications({ type: 'bot', search: 'BTC', page: 1, pageSize: 20 })
    );
    await settle();

    expect(get().notifications.map((n) => n.id)).toEqual(['msg-live']);
  });

  it('markAllAsRead rejects when deleteBotMessage fails', async () => {
    store = [UNREAD];
    const get = renderHook(() => useNotifications({ type: 'bot' }));
    await settle();
    expect(get().notifications).toHaveLength(1);

    // Spec §2.3: a NOTOK bulk clear must not look like a success to the panel,
    // which toasts "Marked N notifications as read" on a resolved promise.
    deleteStatus = 'NOTOK';
    await expect(
      act(async () => {
        await get().markAllAsRead(get().notifications);
      })
    ).rejects.toThrow(/db error/);
  });
});
