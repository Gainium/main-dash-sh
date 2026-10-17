/**
 * Runner note: `.vitest.test.tsx` — renders the real Settings page in jsdom
 * with a mocked GraphQL client. Run it from the cloud parent:
 * `NODE_ENV=development npx vitest run core/tests/settings2FACloudOnly.vitest.test.tsx`.
 *
 * app-sh exposes no OTP mutations (generateOTP / verifyOTP / disableOTP), so
 * on a self-hosted build the 2FA switch could only ever fail with
 * `Cannot query field "generateOTP" on type "Mutation"`. The card is therefore
 * cloud-only, like the recovery-codes and passkeys blocks next to it.
 */
import { describe, expect, it, afterEach, beforeAll, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mode = vi.hoisted(() => ({ cloud: false }));

vi.mock('@/config/mode', () => ({
  get MODE() {
    return mode.cloud ? 'cloud' : 'sh';
  },
  get IS_CLOUD() {
    return mode.cloud;
  },
  get IS_SH() {
    return !mode.cloud;
  },
}));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  class FakeGraphQLClient {
    async request() {
      return {};
    }
  }
  return { ...actual, GraphQLClient: FakeGraphQLClient };
});

import { queryClient } from '@/lib/queryClient';
import Settings from '@/pages/Settings';

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

let root: Root | null = null;
let host: HTMLElement | null = null;

async function renderSecuritySection(): Promise<string> {
  const el = document.createElement('div');
  document.body.appendChild(el);
  host = el;
  const r = createRoot(el);
  root = r;
  await act(async () => {
    r.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          MemoryRouter,
          { initialEntries: ['/settings/login-security'] },
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: '/settings/*',
              element: createElement(Settings),
            })
          )
        )
      )
    );
  });
  return el.textContent ?? '';
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  queryClient.clear();
});

describe('Settings → Login & Security 2FA card', () => {
  it('is not rendered on a self-hosted build', async () => {
    mode.cloud = false;
    const text = await renderSecuritySection();
    expect(text).toContain('Change Password');
    expect(text).not.toContain('Two-Factor Authentication (2FA)');
  });

  it('is rendered on the cloud build', async () => {
    mode.cloud = true;
    const text = await renderSecuritySection();
    expect(text).toContain('Change Password');
    expect(text).toContain('Two-Factor Authentication (2FA)');
  });
});
