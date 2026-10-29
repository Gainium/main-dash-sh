/**
 * Runner note: `.vitest.test.tsx` — collected by the parent's vitest config.
 * Run from the parent:
 *   NODE_ENV=development npx vitest run core/tests/refreshBalanceRefetchesBalances.vitest.test.tsx
 *
 * A successful "Refresh balance" must refetch the balances the portfolio widget
 * shows. The widget reads `getBalances` (cached under
 * `['getBalances', vars, userId, tradingContext]`, no polling, no refetch on
 * focus) and derives its stale-balance clock from each row's `updated`. The
 * mutation used to invalidate only `['user']`, so the widget kept rendering the
 * pre-refresh rows — and their clocks — until a full page reload, while a
 * success toast said the balances had been refreshed.
 */
import { describe, expect, it, vi } from 'vitest';
import { act, createElement, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useExchangeMutations } from '@/hooks/useExchangeMutations';

vi.mock('@/services/exchangeService', () => ({
  createExchangeService: () => ({
    updateBalance: async () => ({ message: 'Balances updated successfully' }),
  }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('updateBalance success', () => {
  it('invalidates every getBalances variant alongside the exchange list', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    // The portfolio widget's key, plus another variant, plus an unrelated one.
    const widgetKey = ['getBalances', '{input:{includeUsdValues:true,shouldSumBalance:false}}', 'u1', 'live'];
    const otherKey = ['getBalances', '{input:{shouldSumBalance:true}}', 'u1', 'live'];
    const userKey = ['user', 'no-vars', 'u1', 'live'];
    const unrelatedKey = ['botList', 'no-vars', 'u1', 'live'];
    for (const k of [widgetKey, otherKey, userKey, unrelatedKey]) qc.setQueryData(k, { ok: true });

    type Api = ReturnType<typeof useExchangeMutations>;
    let captured: Api | null = null;
    const onReady = (a: Api) => {
      captured = a;
    };
    const Probe = ({ ready }: { ready: (a: Api) => void }) => {
      const a = useExchangeMutations();
      useEffect(() => ready(a), [a, ready]);
      return null;
    };
    const root = createRoot(document.createElement('div'));
    await act(async () => {
      root.render(createElement(QueryClientProvider, { client: qc }, createElement(Probe, { ready: onReady }) as ReactNode));
    });
    const api = captured as Api | null;
    if (!api) throw new Error('hook did not render');
    await act(async () => {
      await api.updateBalance.mutateAsync({ skipSnapshot: false, uuid: 'ex-1' });
    });

    const invalidated = (k: unknown[]) => qc.getQueryState(k)?.isInvalidated;
    expect(invalidated(widgetKey)).toBe(true);
    expect(invalidated(otherKey)).toBe(true);
    expect(invalidated(userKey)).toBe(true);
    expect(invalidated(unrelatedKey)).toBe(false);
    act(() => root.unmount());
  });
});
