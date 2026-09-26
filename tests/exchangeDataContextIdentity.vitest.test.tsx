/**
 * Runner: Vitest (jsdom). `npx vitest run core/tests/exchangeDataContextIdentity.vitest.test.tsx`
 *
 * Spec 064 §6 — the ExchangeDataContext value keeps its identity across a
 * provider re-render that changes nothing (react-query hands out a new result
 * proxy per render; the hooks used to depend on it).
 */
import { describe, expect, it } from 'vitest';
import { act, createElement, useEffect, useState, memo } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import {
  ExchangeDataProvider,
  useExchangeDataContext,
} from '@/contexts/ExchangeDataContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('ExchangeDataContext identity (§6)', () => {
  it('does not change when the provider re-renders with the same data', async () => {
    const seen: unknown[] = [];
    const Consumer = memo(function Consumer() {
      seen.push(useExchangeDataContext());
      return null;
    });
    let bump: () => void = () => undefined;
    function Harness() {
      const [, setN] = useState(0);
      useEffect(() => {
        bump = () => setN((n) => n + 1);
      }, []);
      // A new element each render, so the provider itself re-renders.
      return createElement(ExchangeDataProvider, null, createElement(Consumer));
    }
    const el = document.createElement('div');
    const root = createRoot(el);
    await act(async () => {
      root.render(
        createElement(QueryClientProvider, { client: queryClient }, createElement(Harness))
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    const before = seen.length;
    expect(before).toBeGreaterThan(0);
    const last = seen[seen.length - 1];
    await act(async () => bump());
    await act(async () => bump());
    // The memoized consumer re-renders only if the context value changed.
    expect(seen.length).toBe(before);
    expect(seen[seen.length - 1]).toBe(last);
    act(() => root.unmount());
  });
});
