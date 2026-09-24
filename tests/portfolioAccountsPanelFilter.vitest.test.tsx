/**
 * Runner note: run from the parent —
 * `NODE_ENV=development npx vitest run core/tests/portfolioAccountsPanelFilter.vitest.test.tsx`.
 *
 * My Accounts (Portfolio page) doubles as the page-wide account filter: every
 * Portfolio widget follows its selection. The only cue that a filter was on
 * used to be a slightly different row background, so the page could look
 * like "everything" while showing one account. Spec 052 §2.7: while a
 * selection is active the header says so and offers Show all, selected rows
 * carry a check, and the rest are muted; the default list is unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('../src/contexts/ExchangeDataContext', () => ({
  useTransformedExchangesFromContext: () => ({
    isLoading: false,
    exchanges: [
      { id: 'ALL', key: 'ALL', name: 'All Exchanges', provider: 'all', icon: 'A', type: 'aggregate', balance: 600, status: true, rotationRequired: false },
      { id: 'f1', key: 'f1', name: 'Futures one', provider: 'binanceUsdm', icon: 'B', type: 'exchange', balance: 100, status: true, rotationRequired: false },
      { id: 's1', key: 's1', name: 'Spot one', provider: 'binance', icon: 'B', type: 'exchange', balance: 500, status: true, rotationRequired: false },
    ],
  }),
}));

vi.mock('../src/lib/demoMode', () => ({ isReadOnly: () => false }));

import { AccountsPanel } from '../src/components/portfolio/AccountsPanel';
import { PortfolioProvider } from '../src/contexts/PortfolioContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const noop = () => undefined;
const props = {
  settingsDialog: { isOpen: false, exchangeId: null },
  setSettingsDialog: noop,
  addExchangeDialog: false,
  setAddExchangeDialog: noop,
  newExchange: { exchange: '', apiKey: '', apiSecret: '' },
  setNewExchange: noop,
  exchangeSettings: {},
  setExchangeSettings: noop,
  onEditExchange: noop,
  handleDeleteExchange: noop,
  updateExchangeBalance: async () => undefined,
  updateAllBalances: async () => undefined,
  isUpdatingBalance: false,
} as unknown as React.ComponentProps<typeof AccountsPanel>;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(PortfolioProvider, null, createElement(AccountsPanel, props)));
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const row = (name: string) =>
  [...container.querySelectorAll('[data-testid="account-row"]')].find((r) =>
    r.textContent?.includes(name)
  ) as HTMLElement | undefined;

const filterLine = () => container.querySelector('[data-testid="accounts-filter-status"]');

describe('My Accounts filter visibility (spec 052 §2.7)', () => {
  it('§2.7.3 default "All Exchanges": no filter line, no checks, nothing muted', () => {
    expect(filterLine()).toBeNull();
    expect(container.querySelectorAll('[data-selected-check]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-muted="true"]')).toHaveLength(0);
  });

  it('§2.7.1/§2.7.2 selecting an account: header says so, the row is checked, the others are muted', () => {
    act(() => row('Futures one')?.click());
    expect(filterLine()?.textContent).toContain('Filtered: 1 account');
    expect(row('Futures one')?.querySelector('[data-selected-check]')).not.toBeNull();
    expect(row('Futures one')?.getAttribute('data-muted')).toBe('false');
    expect(row('Spot one')?.getAttribute('data-muted')).toBe('true');
    expect(row('All Exchanges')?.getAttribute('data-muted')).toBe('true');

    act(() => row('Spot one')?.click());
    expect(filterLine()?.textContent).toContain('Filtered: 2 accounts');
  });

  it('§2.7.1 Show all resets to "All Exchanges"', () => {
    act(() => row('Futures one')?.click());
    const showAll = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Show all')
    );
    act(() => showAll?.click());
    expect(filterLine()).toBeNull();
    expect(container.querySelectorAll('[data-selected-check]')).toHaveLength(0);
  });
});
