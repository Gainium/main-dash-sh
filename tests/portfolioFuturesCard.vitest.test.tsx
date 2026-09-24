/**
 * Runner note: run from the parent —
 * `NODE_ENV=development npx vitest run core/tests/portfolioFuturesCard.vitest.test.tsx`.
 *
 * Portfolio futures card: what the user sees. The numbers are pinned in
 * `portfolioFuturesSummary.vitest.test.ts`; this file covers visibility, the
 * "Other N" fold, the single terminal link, the positions-error state and
 * privacy mode.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import { ExchangeEnum } from '../src/types/exchange.types';
import {
  summarizeFutures,
  type FuturesSummary,
} from '../src/components/portfolio/futures/futuresSummary';
import { useUIStore } from '../src/stores/uiStore';

const hook = vi.hoisted(() => ({
  state: {
    hasFutures: false,
    hasSelectedFutures: false,
    summary: undefined as unknown,
    error: null as Error | null,
    isLoading: false,
  },
}));

vi.mock('../src/components/portfolio/futures/useFuturesSummary', () => ({
  useFuturesSummary: () => hook.state,
}));

import FuturesSummaryCard, {
  FuturesSummaryView,
  POSITIONS_HREF,
} from '../src/components/portfolio/futures/FuturesSummaryCard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  useUIStore.setState({ privacyMode: false });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (el: React.ReactElement) =>
  act(() => {
    root.render(createElement(MemoryRouter, null, el));
  });

const linearPos = (exchangeUUID: string, base: string, net: number) => ({
  exchangeUUID,
  exchange: ExchangeEnum.binanceUsdm,
  side: net >= 0 ? 'LONG' : 'SHORT',
  quantity: String(Math.abs(net) / 10),
  baseAssetName: base,
  quoteAssetName: 'USDT',
  markPrice: 10,
  pnl: { entryNotional: Math.abs(net), pnlQuote: 0, pricePct: 0, roiPct: 0 },
  symbolFull: undefined,
});

const summaryWith = (
  nets: Array<[string, number]>,
  positionsKnown = true
): FuturesSummary =>
  summarizeFutures({
    accounts: [
      { id: 'a', name: 'My futures', provider: ExchangeEnum.binanceUsdm, balance: 1000 },
      { id: 'b', name: 'KC', provider: ExchangeEnum.kucoinLinear, balance: 400 },
    ],
    positions: nets.map(([base, n]) => linearPos('a', base, n)) as never,
    positionsKnown,
  });

describe('FuturesSummaryCard', () => {
  it('§2.1.1 renders nothing without a futures account', () => {
    hook.state = { hasFutures: false, hasSelectedFutures: false, summary: summaryWith([]), error: null, isLoading: false };
    render(createElement(FuturesSummaryCard));
    expect(container.textContent).toBe('');
  });

  it('§2.1.4 renders nothing when the account selection holds no futures account', () => {
    hook.state = { hasFutures: true, hasSelectedFutures: false, summary: summaryWith([]), error: null, isLoading: false };
    render(createElement(FuturesSummaryCard));
    expect(container.textContent).toBe('');
  });

  it('§2.1.1/§2.2.1 renders one row per futures account, labelled with the account name', () => {
    hook.state = { hasFutures: true, hasSelectedFutures: true, summary: summaryWith([['BTC', 5000]]), error: null, isLoading: false };
    render(createElement(FuturesSummaryCard));
    const rows = container.querySelectorAll('[data-testid="futures-account-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('My futures');
    expect(rows[1]?.textContent).toContain('KC');
  });

  it('§2.1.2 futures account with no positions → rows plus "No open positions"', () => {
    render(createElement(FuturesSummaryView, { summary: summaryWith([]), error: null }));
    expect(container.querySelectorAll('[data-testid="futures-account-row"]')).toHaveLength(2);
    expect(container.textContent).toContain('No open positions');
  });

  it('§2.3.2 "Other N" folds the tail and expands to it', () => {
    const nets: Array<[string, number]> = [
      ['BTC', 10000], ['ETH', -3000], ['SOL', 1800], ['XRP', -1400],
      ['DOGE', 900], ['LINK', 400], ['AVAX', -300],
    ];
    render(createElement(FuturesSummaryView, { summary: summaryWith(nets), error: null }));
    expect(container.textContent).toContain('Other 2');
    expect(container.textContent).not.toContain('LINK');
    const btn = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Other 2')
    );
    act(() => btn?.click());
    const other = container.querySelector('[data-testid="futures-exposure-other"]');
    expect(other?.textContent).toContain('LINK');
    expect(other?.textContent).toContain('AVAX');
  });

  it('§2.3.3 bars scale to the largest asset row; the Other row has no bar', () => {
    const nets: Array<[string, number]> = [
      ['BTC', 400], ['ETH', -200], ['SOL', 300], ['XRP', 100], ['DOGE', 100],
      // a long tail whose sum (6 × 90 = 540) exceeds every single asset
      ['A1', 90], ['A2', 90], ['A3', 90], ['A4', 90], ['A5', 90], ['A6', 90],
    ];
    render(createElement(FuturesSummaryView, { summary: summaryWith(nets), error: null }));
    const bar = (asset: string) =>
      [...container.querySelectorAll('[data-testid="exposure-row"]')]
        .find((r) => r.textContent?.startsWith(asset))
        ?.querySelector<HTMLElement>('[data-testid="exposure-bar"]');
    expect(bar('BTC')?.style.width).toBe('50%');
    expect(bar('SOL')?.style.width).toBe('37.5%');
    expect(bar('ETH')?.style.width).toBe('25%');
    const otherRow = [...container.querySelectorAll('[data-testid="exposure-row"]')].find((r) =>
      r.textContent?.includes('Other 6')
    );
    expect(otherRow).toBeDefined();
    expect(otherRow?.querySelector('[data-testid="exposure-bar"]')).toBeNull();
    expect(otherRow?.textContent).toContain('+$540.00');
  });

  it('§2.4.1 the only action is the Manage in Terminal link', () => {
    render(createElement(FuturesSummaryView, { summary: summaryWith([['BTC', 5000]]), error: null }));
    const links = container.querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute('href')).toBe(POSITIONS_HREF);
    expect(POSITIONS_HREF).toBe('/terminal?view=positions');
    // no action buttons (the Other toggle only appears with > 5 assets)
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('§2.6.4 positions error → balance in its basis column, the rest "—", error line, no exposure', () => {
    render(
      createElement(FuturesSummaryView, {
        summary: summaryWith([], false),
        error: new Error('boom'),
      })
    );
    const [walletRow, equityRow] = [
      ...container.querySelectorAll('[data-testid="futures-account-row"]'),
    ];
    expect(walletRow?.textContent).toContain('$1,000.00');
    expect(equityRow?.textContent).toContain('$400.00');
    expect(walletRow?.textContent).toContain('—');
    expect(container.textContent).toContain("Couldn't load open positions");
    expect(container.textContent).not.toContain('Net exposure');
  });

  it('§4.3 privacy mode masks every figure', () => {
    useUIStore.setState({ privacyMode: true });
    render(createElement(FuturesSummaryView, { summary: summaryWith([['BTC', 5000]]), error: null }));
    expect(container.textContent).not.toMatch(/\$\d/);
    expect(container.textContent).toContain('***');
  });
});
