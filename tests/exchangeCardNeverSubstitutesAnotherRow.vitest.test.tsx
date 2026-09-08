/**
 * Runner note: renders a component in jsdom and mocks modules, so this is a
 * Vitest file, not one of core's Playwright `.unit.test.ts` pure-function
 * tests. Run from the parent:
 * `npx vitest run core/tests/exchangeCardNeverSubstitutesAnotherRow.vitest.test.tsx`.
 */

/**
 * `ExchangeCard` used to resolve its exchange as
 * `exchanges.find(e => e.id === exchangeId) || exchanges[0] || null`.
 *
 * `exchanges[0]` is always the synthetic "All Exchanges" aggregate row (see
 * `useTransformedExchanges`), so a card pinned to an id that no longer
 * resolves — a removed account, a stale saved dashboard layout, an id that
 * outlived its connection — silently re-badged itself as All Exchanges and
 * rendered the user's WHOLE portfolio balance where a single account's
 * balance belonged.
 *
 * The label was the visible half. The dangerous half is that the Edit,
 * Delete and Refresh handlers receive `resolveExchangeData(exchange)`, so
 * with the fallback in place they were handed a synthesized `uuid: 'ALL'`
 * record — actions aimed at whatever row the card had silently become.
 *
 * These tests pin that an unresolvable id resolves to nothing at all rather
 * than to a neighbouring row, while a resolvable id still renders its own
 * account.
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';

import { queryClient } from '@/lib/queryClient';
import { ExchangeCard } from '@/components/widgets/ExchangeCard';

type TransformedExchange = {
  id: string;
  key: string;
  name: string;
  provider: string;
  type: string;
  balance: number;
  status: boolean;
  rotationRequired: boolean;
};

const REAL_ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const DEAD_ACCOUNT_ID = '99999999-9999-4999-8999-999999999999';

/** Mirrors useTransformedExchanges: the aggregate row is always index 0. */
const EXCHANGES: TransformedExchange[] = [
  {
    id: 'ALL',
    key: 'ALL',
    name: 'All Exchanges',
    provider: 'all',
    type: 'aggregate',
    balance: 5000,
    status: true,
    rotationRequired: false,
  },
  {
    id: REAL_ACCOUNT_ID,
    key: 'k1',
    name: 'A Connected Account',
    provider: 'binance',
    type: 'exchange',
    balance: 100,
    status: true,
    rotationRequired: false,
  },
];

vi.mock('@/contexts/ExchangeDataContext', () => ({
  useTransformedExchangesFromContext: () => ({
    exchanges: EXCHANGES,
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useGraphQL', () => ({
  useGraphQL: () => ({ data: undefined, isLoading: false, isError: false }),
}));

// uiStore is NOT mocked: WidgetWrapper reads several fields from it
// (fullscreen/selection state), and a partial stub silently breaks its render.
// The real store's defaults are fine here.

// Built inside the factory: `vi.mock` is hoisted, so it cannot close over
// anything declared at module top level.
vi.mock('@/stores/exchangesStore', () => ({
  useExchangesStore: Object.assign(
    (selector: (s: unknown) => unknown) =>
      selector({ exchanges: {}, getExchange: () => undefined }),
    { getState: () => ({ getExchange: () => undefined }) }
  ),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderCard(exchangeId: string): string {
  const mount = document.createElement('div');
  document.body.appendChild(mount);
  const mountedRoot = createRoot(mount);
  container = mount;
  root = mountedRoot;
  const ui: ReactNode = createElement(ExchangeCard, { exchangeId });
  act(() => {
    mountedRoot.render(
      createElement(QueryClientProvider, { client: queryClient }, ui)
    );
  });
  return mount.textContent ?? '';
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

describe('ExchangeCard never substitutes a different exchange row', () => {
  it('renders its own account for an id that resolves', () => {
    const text = renderCard(REAL_ACCOUNT_ID);
    expect(text).toContain('A Connected Account');
    expect(text).not.toContain('All Exchanges');
  });

  it('renders NO account for an id that no longer resolves', () => {
    // The old fallback re-badged this card as the aggregate row and showed
    // the whole portfolio here.
    const text = renderCard(DEAD_ACCOUNT_ID);
    expect(text).not.toContain('All Exchanges');
    expect(text).not.toContain('A Connected Account');
  });

  it('still renders the aggregate when the aggregate is what was asked for', () => {
    const text = renderCard('ALL');
    expect(text).toContain('All Exchanges');
  });
});
