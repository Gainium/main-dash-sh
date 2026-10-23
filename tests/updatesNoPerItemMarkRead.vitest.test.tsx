/**
 * Run from the parent:
 *   NODE_ENV=development npx vitest run core/tests/updatesNoPerItemMarkRead.vitest.test.tsx
 *
 * Updates (changelog entries) have no per-item read state: `readChangeLog`
 * takes no id and moves the user's single read watermark to the newest entry.
 * A per-item "Mark as read" on an Update therefore marks every Update read.
 * Only bot messages and News get a per-item control; Updates are cleared from
 * their tab's "Mark all read", as in the legacy dashboard. See specs/133.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent } from '@testing-library/react';

vi.mock('@/config/mode', () => ({
  MODE: 'cloud',
  IS_CLOUD: true,
  IS_SH: false,
}));

vi.mock('@/components/layout/MainLayout', () => ({
  default: ({
    children,
    pageActions,
  }: {
    children: ReactNode;
    pageActions?: ReactNode;
  }) => createElement('div', null, pageActions, children),
}));

vi.mock('@/components/notifications/NotificationMarket', () => ({
  NotificationMarket: () => null,
}));

import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import {
  useNotificationsStore,
  type UnifiedNotification,
} from '@/stores/notificationsStore';
import NotificationPanel from '@/components/notifications/NotificationPanel';
import { MessageBox } from '@/components/notifications/MessageBox';
import { NotificationItem } from '@/components/notifications/NotificationItem';
import NotificationsPage from '@/pages/Notifications';

const T0 = 1_790_000_000_000;

const BOT_MESSAGES = [
  {
    _id: 'msg-1',
    botId: 'bot-1',
    botName: 'Bot one',
    message: 'Bot message',
    time: T0,
    type: 'info',
    symbol: 'BTC-USDT',
    exchange: 'binance',
    isDeleted: false,
    isRead: false,
  },
];
/** Unread News (watermark below them). */
const ANNOUNCEMENTS = [
  {
    id: 7,
    type: 'announcement',
    title: 'News 7',
    description: 'body',
    date: new Date(T0 + 7).toISOString(),
    isRead: false,
  },
];
/** Two unread Updates. */
const CHANGELOGS = [12, 11].map((id) => ({
  id,
  title: `Update ${id}`,
  shortDescription: 'body',
  fullDescription: '',
  type: 'feature',
  date: new Date(T0 + id).toISOString(),
}));

const mutations: string[] = [];

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  class FakeGraphQLClient {
    async request(query: string) {
      if (query.includes('mutation')) {
        mutations.push(query);
        return {};
      }
      if (query.includes('getPlatformNotifications')) {
        return {
          getPlatformNotifications: {
            status: 'OK',
            reason: null,
            data: {
              data: ANNOUNCEMENTS,
              total: ANNOUNCEMENTS.length,
              totalUnread: ANNOUNCEMENTS.length,
            },
          },
        };
      }
      if (query.includes('getUnreadChangeLogs')) {
        return {
          getUnreadChangeLogs: {
            status: 'OK',
            reason: null,
            data: { result: CHANGELOGS.length },
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
            data: { result: BOT_MESSAGES },
            total: BOT_MESSAGES.length,
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

function render(node: ReactNode) {
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
        createElement(MemoryRouter, null, node)
      ) as ReactNode
    );
  });
}

async function settle(ms = 400) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

/** Whether the timeline card titled `title` carries a per-item mark-read. */
function cardHasMarkRead(title: string): boolean {
  const heading = Array.from(document.querySelectorAll('h4')).find(
    (h) => h.textContent?.endsWith(title)
  );
  if (!heading)
    throw new Error(
      `no card titled ${title}; have ${Array.from(document.querySelectorAll('h4')).map((h) => h.textContent)}`
    );
  // h4 → title row → title column → header row (title + actions).
  const header = heading.parentElement?.parentElement?.parentElement;
  return !!header?.querySelector('button[title="Mark as read"]');
}

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??=
  FakeResizeObserver;

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  mutations.length = 0;
  queryClient.clear();
  useAuthStore.setState({
    tokens: { accessToken: 'test-token' },
    user: { id: 'u1', email: 'user@example.com' },
  } as never);
  useUIStore.setState({ isLiveTrading: true, tradingMode: 'live' } as never);
  useNotificationsStore.setState({
    isNotificationsPanelOpen: false,
    selectedFilter: 'all',
    searchQuery: '',
  } as never);
});

afterEach(() => {
  const r = root;
  if (r) act(() => r.unmount());
  host?.remove();
  root = null;
  host = null;
  document.body.innerHTML = '';
});

describe('Updates have no per-item mark-read (spec 133)', () => {
  it('§1.1a bell panel: Updates get none; bot messages and News keep theirs', async () => {
    useNotificationsStore.setState({ isNotificationsPanelOpen: true } as never);
    render(createElement(NotificationPanel));
    await settle();
    expect(cardHasMarkRead('Update 12')).toBe(false);
    expect(cardHasMarkRead('Update 11')).toBe(false);
    expect(cardHasMarkRead('News 7')).toBe(true);
    expect(cardHasMarkRead('Bot one')).toBe(true);
  });

  it('§1.1b Notifications page: the Updates tab has no per-item control', async () => {
    render(createElement(NotificationsPage));
    await settle();
    expect(cardHasMarkRead('Bot one')).toBe(true);

    const tab = Array.from(document.querySelectorAll('[role="tab"]')).find(
      (t) => t.textContent?.includes('Updates')
    ) as HTMLElement;
    act(() => {
      fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
    });
    await settle();
    expect(cardHasMarkRead('Update 12')).toBe(false);
    expect(cardHasMarkRead('Update 11')).toBe(false);

    const news = Array.from(document.querySelectorAll('[role="tab"]')).find(
      (t) => t.textContent?.includes('News')
    ) as HTMLElement;
    act(() => {
      fireEvent.mouseDown(news, { button: 0, ctrlKey: false });
    });
    await settle();
    expect(cardHasMarkRead('News 7')).toBe(true);
  });

  it('§1.1d the Updates "Mark all read" still sends readChangeLog', async () => {
    render(createElement(NotificationsPage));
    await settle();
    const tab = Array.from(document.querySelectorAll('[role="tab"]')).find(
      (t) => t.textContent?.includes('Updates')
    ) as HTMLElement;
    act(() => {
      fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
    });
    await settle();
    const markAll = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Mark all read')
    ) as HTMLElement;
    expect(markAll).toBeTruthy();
    await act(async () => {
      markAll.click();
    });
    await settle();
    expect(mutations.some((q) => q.includes('readChangeLog'))).toBe(true);
  });

  it('§1.1c MessageBox / NotificationItem hide it for Updates only', () => {
    const base: UnifiedNotification = {
      id: 'x',
      type: 'info',
      title: 't',
      message: 'm',
      time: T0,
      isRead: false,
      notificationType: 'changelog',
    } as UnifiedNotification;
    const onMarkRead = () => {};
    for (const [notificationType, expected] of [
      ['changelog', 0],
      ['announcement', 1],
      ['bot', 1],
    ] as const) {
      const n = { ...base, notificationType };
      render(
        createElement(
          'div',
          null,
          createElement(MessageBox, { notification: n, onMarkRead }),
          createElement(NotificationItem, { notification: n, onMarkRead })
        )
      );
      expect(
        document.querySelectorAll('button[title="Mark as read"]').length
      ).toBe(expected * 2);
      act(() => root?.unmount());
      host?.remove();
      root = null;
      host = null;
    }
  });
});
