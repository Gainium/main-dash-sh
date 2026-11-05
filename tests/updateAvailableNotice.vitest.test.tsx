/**
 * Runner note: `.vitest.test.tsx` — renders the layout's update notice in
 * jsdom with admin-sh's /api/updates mocked. Run it from the cloud parent:
 * `NODE_ENV=development npx vitest run core/tests/updateAvailableNotice.vitest.test.tsx`.
 *
 * Self-hosted operators could not see that their install was behind unless
 * they opened Admin → Updates. The notice surfaces it on every page, carries
 * the running dashboard version, and a dismissal only holds until a newer
 * version is published.
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

import type { AdminUpdate } from '@/lib/api/adminClient';

const state = vi.hoisted(() => ({
  cloud: false,
  configured: true,
  updates: [] as AdminUpdate[],
}));

vi.mock('@/config/mode', () => ({
  get MODE() {
    return state.cloud ? 'cloud' : 'sh';
  },
  get IS_CLOUD() {
    return state.cloud;
  },
  get IS_SH() {
    return !state.cloud;
  },
}));

vi.mock('@/lib/api/adminClient', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    isAdminApiConfigured: () => state.configured,
    adminApi: {
      ...(actual['adminApi'] as object),
      listUpdates: vi.fn(async () => state.updates),
    },
  };
});

import { UpdateAvailableNotice } from '@/components/layout/UpdateAvailableNotice';
import {
  runningFrontendVersion,
  updatesSignature,
} from '@/components/layout/updateAvailable';

const row = (
  service: string,
  repo: string,
  current: string,
  latest: string
): AdminUpdate =>
  ({
    service,
    containerId: service,
    image: `${repo}:${current}`,
    repo,
    current,
    latest,
    hasUpdate: current !== latest,
  }) as AdminUpdate;

let root: Root | null = null;
let host: HTMLElement | null = null;

async function render(path = '/overview'): Promise<HTMLElement> {
  const el = document.createElement('div');
  document.body.appendChild(el);
  host = el;
  const r = createRoot(el);
  root = r;
  const client = new QueryClient();
  await act(async () => {
    r.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(
          MemoryRouter,
          { initialEntries: [path] },
          createElement(UpdateAvailableNotice)
        )
      )
    );
  });
  // Let the query resolve.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return el;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  state.cloud = false;
  state.configured = true;
  state.updates = [];
  localStorage.clear();
});

describe('UpdateAvailableNotice', () => {
  it('shows the count, the running version and a link to the Updates tab', async () => {
    state.updates = [
      row('frontend', 'gainium/main-dash-sh', '2.107.8', '2.127.2'),
      row('bots-dca', 'gainium/main-app-sh', '1.80.0', '1.90.0'),
      row('bots-grid', 'gainium/main-app-sh', '1.80.0', '1.90.0'),
      row('redis', 'redis', '7', '7'),
    ];
    const el = await render();
    expect(el.textContent).toContain('Updates available for 3 services');
    expect(el.textContent).toContain(`running dashboard ${runningFrontendVersion()}`);
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/admin?tab=updates');
  });

  it('renders nothing when everything is up to date', async () => {
    state.updates = [row('frontend', 'gainium/main-dash-sh', '2.127.2', '2.127.2')];
    const el = await render();
    expect(el.textContent).toBe('');
  });

  it('never shows on cloud, nor without admin-sh', async () => {
    state.updates = [row('frontend', 'gainium/main-dash-sh', '2.107.8', '2.127.2')];
    state.cloud = true;
    expect((await render()).textContent).toBe('');
    act(() => root?.unmount());
    state.cloud = false;
    state.configured = false;
    expect((await render()).textContent).toBe('');
  });

  it('stays out of the admin page, which lists the same updates', async () => {
    state.updates = [row('frontend', 'gainium/main-dash-sh', '2.107.8', '2.127.2')];
    expect((await render('/admin')).textContent).toBe('');
  });

  it('a dismissal holds for that version and lapses when a newer one appears', async () => {
    state.updates = [row('frontend', 'gainium/main-dash-sh', '2.107.8', '2.127.2')];
    const el = await render();
    const dismiss = el.querySelector('button[aria-label="Dismiss update notice"]');
    await act(async () => {
      (dismiss as HTMLButtonElement).click();
    });
    expect(el.textContent).toBe('');
    act(() => root?.unmount());

    expect((await render()).textContent).toBe('');
    act(() => root?.unmount());

    state.updates = [row('frontend', 'gainium/main-dash-sh', '2.107.8', '2.127.3')];
    expect((await render()).textContent).toContain('Update available for 1 service');
  });

  it('signature ignores up-to-date rows and order', () => {
    const a = row('a', 'r/a', '1', '2');
    const b = row('b', 'r/b', '1', '3');
    const c = row('c', 'r/c', '1', '1');
    expect(updatesSignature([a, b, c])).toBe(updatesSignature([b, a]));
    expect(updatesSignature([c])).toBe('');
  });
});
