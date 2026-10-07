/**
 * Run from the parent:
 *   NODE_ENV=development npx vitest run core/tests/notificationsPanelUnreadInbox.vitest.test.tsx
 *
 * The bell panel is the unread inbox for every feed (spec 094 revision): a
 * read News item or Update must leave it, like a read bot message does, and
 * stay reachable on the Notifications page (which asks without unreadOnly).
 * News and Updates are cloud-only feeds, so IS_CLOUD is forced on here.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/config/mode', () => ({
  MODE: 'cloud',
  IS_CLOUD: true,
  IS_SH: false,
}));

import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useNotifications } from '@/hooks/useNotifications';

/** Announcement watermark: ids <= LAST are read. */
const LAST = 2;
const ANNOUNCEMENTS = [1, 2, 3].map((id) => ({
  id,
  type: 'announcement',
  title: `News ${id}`,
  description: 'body',
  date: new Date(1_790_000_000_000 + id).toISOString(),
}));
/** Newest first; the first UNREAD_CHANGELOGS are unread. */
const CHANGELOGS = [3, 2, 1].map((id) => ({
  id,
  title: `Update ${id}`,
  shortDescription: 'body',
  fullDescription: '',
  type: 'feature',
  date: new Date(1_790_000_000_000 + id).toISOString(),
}));
const UNREAD_CHANGELOGS = 1;

const announcementInputs: Array<{ unreadOnly?: boolean }> = [];

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  class FakeGraphQLClient {
    async request(query: string, variables?: unknown) {
      const input = (variables as { input?: Record<string, unknown> })?.input;
      if (query.includes('getPlatformNotifications')) {
        announcementInputs.push(input ?? {});
        const rows = ANNOUNCEMENTS.filter(
          (a) => !input?.['unreadOnly'] || a.id > LAST
        ).map((a) => ({ ...a, isRead: a.id <= LAST }));
        return {
          getPlatformNotifications: {
            status: 'OK',
            reason: null,
            data: {
              data: rows,
              total: rows.length,
              totalUnread: ANNOUNCEMENTS.filter((a) => a.id > LAST).length,
            },
          },
        };
      }
      if (query.includes('getUnreadChangeLogs')) {
        return {
          getUnreadChangeLogs: {
            status: 'OK',
            reason: null,
            data: { result: UNREAD_CHANGELOGS },
          },
        };
      }
      if (query.includes('getChangeLogs')) {
        return {
          getChangeLogs: {
            status: 'OK',
            reason: null,
            data: { result: CHANGELOGS },
            total: CHANGELOGS.length,
          },
        };
      }
      if (query.includes('getMessageBot')) {
        return {
          getMessageBot: {
            status: 'OK',
            reason: null,
            data: { result: [] },
            total: 0,
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

async function settle(ms = 250) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  announcementInputs.length = 0;
  queryClient.clear();
  useAuthStore.setState({
    tokens: { accessToken: 'test-token' },
    user: { id: 'u1', email: 'user@example.com' },
  } as never);
  useUIStore.setState({ isLiveTrading: true, tradingMode: 'live' } as never);
});

afterEach(() => {
  const r = root;
  if (r) act(() => r.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('notifications panel — unread inbox for every feed', () => {
  it('unread-only: read News and read Updates are not listed', async () => {
    const get = renderHook(() =>
      useNotifications({ type: 'all', unreadOnly: true })
    );
    await settle();
    expect(announcementInputs.at(-1)?.unreadOnly).toBe(true);
    const titles = get()
      .notifications.filter((n) => n.notificationType !== 'bot')
      .map((n) => n.title);
    expect(titles.sort()).toEqual(['News 3', 'Update 3']);
  });

  it('history (no unreadOnly) still lists read News and Updates', async () => {
    const get = renderHook(() => useNotifications({ type: 'all' }));
    await settle();
    const titles = get()
      .notifications.filter((n) => n.notificationType !== 'bot')
      .map((n) => n.title);
    expect(titles).toHaveLength(6);
  });
});
