/**
 * Runner note: `.vitest.test.tsx` (renders a hook, mocks the client). Run from
 * the parent: `NODE_ENV=development npx vitest run core/tests/baseFundingAccessHook.vitest.test.tsx`.
 *
 * Beta gate: one shared answer per session; "no" until it arrives; an API
 * without `baseFundingAccess` reads as not available.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({
  calls: 0,
  answer: (): unknown => ({ baseFundingAccess: { available: true } }),
}));

vi.mock('../src/hooks/useSinglePosition', () => ({
  useSinglePositionClient: () => ({
    enabled: true,
    paperContext: false,
    make: () => ({
      request: async () => {
        api.calls += 1;
        return api.answer();
      },
    }),
  }),
}));

import {
  __resetBaseFundingAccessForTests,
  useBaseFundingAccess,
} from '../src/hooks/useBaseFundingAccess';
import { useAuthStore } from '../src/stores/authStore';

const signIn = (token: string) =>
  useAuthStore.setState({
    tokens: { ...(useAuthStore.getState().tokens ?? {}), accessToken: token },
  } as never);

afterEach(() => {
  cleanup();
  __resetBaseFundingAccessForTests();
  api.calls = 0;
  api.answer = () => ({ baseFundingAccess: { available: true } });
});

describe('useBaseFundingAccess', () => {
  it('is false until the answer arrives, then shared by every caller', async () => {
    signIn('token-a');
    const first = renderHook(() => useBaseFundingAccess());
    expect(first.result.current).toBe(false);
    await waitFor(() => expect(first.result.current).toBe(true));
    const second = renderHook(() => useBaseFundingAccess());
    expect(second.result.current).toBe(true);
    expect(api.calls).toBe(1);
  });

  it('an API without the query: not available', async () => {
    signIn('token-b');
    api.answer = () => {
      throw new Error('HTTP error! status: 400 - Cannot query field "baseFundingAccess" on type "Query".');
    };
    const { result } = renderHook(() => useBaseFundingAccess());
    await waitFor(() => expect(api.calls).toBe(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current).toBe(false);
  });

  it('signed out: never asks, not available', async () => {
    signIn('');
    const { result } = renderHook(() => useBaseFundingAccess());
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current).toBe(false);
    expect(api.calls).toBe(0);
  });
});
