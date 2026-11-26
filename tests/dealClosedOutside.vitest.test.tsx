/**
 * Runner note: renders real components in jsdom, so it is a Vitest file. Run
 * from the parent: `npx vitest run core/tests/dealClosedOutside.vitest.test.tsx`.
 *
 * When a futures position is closed on the exchange without the bot, the
 * backend closes the deal with the `closedExternally` flag, plus
 * `profitUnknown` when the exchange's fills could not price the close. A
 * `profitUnknown` deal's stored profit is only what it had realised before
 * the close, not its result, so the dashboard must not present it as the
 * deal's profit. Every other deal renders exactly as before.
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

import { queryClient } from '@/lib/queryClient';
import {
  dealClosedOutside,
  isDealProfitUnknown,
} from '@/lib/utils/dealClosedOutside';
import { dcaDealToOpenTrade } from '@/lib/utils/dcaDealToOpenTrade';
import { comboDealToOpenTrade } from '@/lib/utils/comboDealToOpenTrade';
import { TradeDetailContent } from '@/components/trades/TradeDetailContent';
import { TradeCard } from '@/components/trades/TradeCard';
import type { DCADeals } from '@/types';

// The card's pair chip reads the venue pair list; an empty one is enough here.
vi.mock('@/contexts/ExchangeDataContext', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  useExchangeDataContext: () => ({}),
  useTradingPairsFromContext: () => ({ pairsByExchange: {} }),
  useExchangesFromContext: () => ({ exchanges: [] }),
  useTransformedExchangesFromContext: () => ({ exchanges: [] }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const UNKNOWN = ['futuresPrecision', 'closedExternally', 'profitUnknown'];

describe('dealClosedOutside (spec 167 §1)', () => {
  it('returns null for a deal the bot closed itself', () => {
    expect(dealClosedOutside({ flags: ['futuresPrecision'] })).toBeNull();
    expect(dealClosedOutside({ flags: undefined })).toBeNull();
    expect(dealClosedOutside({ flags: null, closeTrigger: 'liquidation' })).toBeNull();
  });
  it('marks profit unknown when both flags are set', () => {
    expect(dealClosedOutside({ flags: UNKNOWN })).toMatchObject({
      profitUnknown: true,
      label: 'Profit unknown',
    });
  });
  it('labels a priced external close by its close trigger', () => {
    expect(
      dealClosedOutside({ flags: ['closedExternally'], closeTrigger: 'liquidation' })
    ).toMatchObject({ profitUnknown: false, label: 'Liquidated' });
    expect(
      dealClosedOutside({ flags: ['closedExternally'], closeTrigger: 'manual' })
    ).toMatchObject({ profitUnknown: false, label: 'Closed on exchange' });
  });
  it('never hides the profit of an open deal', () => {
    expect(isDealProfitUnknown({ flags: UNKNOWN, active: true })).toBe(false);
    expect(isDealProfitUnknown({ flags: UNKNOWN, active: false })).toBe(true);
    expect(isDealProfitUnknown({ flags: ['closedExternally'] })).toBe(false);
  });
});

const rawDeal = {
  _id: 'deal-1',
  botId: 'bot-1',
  botName: 'Bot',
  status: 'closed',
  strategy: 'LONG',
  exchange: 'bitgetUsdm',
  exchangeUUID: 'ex-1',
  symbol: { symbol: 'XUSDT', baseAsset: 'X', quoteAsset: 'USDT' },
  createTime: Date.now() - 3_600_000,
  closeTime: Date.now(),
  levels: { complete: 2, all: 5 },
  profit: { total: -0.0151, totalUsd: -0.0151, pureBase: 0, pureQuote: -0.0151 },
  usage: { current: { base: 0, quote: 38 }, max: { base: 0, quote: 100 }, currentUsd: 38 },
  settings: { futures: true, coinm: false },
  flags: UNKNOWN,
} as unknown as DCADeals;

describe('deal mappers carry flags (spec 167 §2)', () => {
  it('dcaDealToOpenTrade', () => {
    expect(dcaDealToOpenTrade(rawDeal).flags).toEqual(UNKNOWN);
  });
  it('comboDealToOpenTrade', () => {
    expect(comboDealToOpenTrade(rawDeal as never).flags).toEqual(UNKNOWN);
  });
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});
function render(el: ReactElement): HTMLDivElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  const r = createRoot(host);
  root = r;
  act(() => {
    r.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, null, el)
      )
    );
  });
  return host;
}

const detailTrade = (flags: string[] | undefined, closeTrigger?: string) => ({
  ...dcaDealToOpenTrade({ ...rawDeal, flags, closeTrigger } as DCADeals),
  type: 'DCA' as const,
  botId: undefined, // no cost waterfall fetch in jsdom
});

const renderDetail = (flags: string[] | undefined, closeTrigger?: string) =>
  render(
    createElement(TradeDetailContent, {
      trade: detailTrade(flags, closeTrigger) as never,
      pendingOrders: [],
      completedOrders: [],
      isLoadingOrders: false,
    })
  );

describe('deal drawer — Realized Profit (spec 167 §3)', () => {
  it('shows Unknown, not the stored figure, for a profitUnknown deal', () => {
    const el = renderDetail(UNKNOWN);
    expect(el.querySelector('[data-testid="deal-profit-unknown"]')).not.toBeNull();
    expect(el.textContent).toContain('Profit unknown');
    expect(el.textContent).not.toMatch(/0\.02/);
  });
  it('keeps the figure and adds a Liquidated badge for a priced external close', () => {
    const el = renderDetail(['closedExternally'], 'liquidation');
    expect(el.querySelector('[data-testid="deal-profit-unknown"]')).toBeNull();
    expect(el.textContent).toContain('Liquidated');
    expect(el.textContent).toMatch(/\$0\.02/);
  });
  it('renders an ordinary closed deal exactly as before', () => {
    const el = renderDetail(['futuresPrecision']);
    expect(el.querySelector('[data-testid="deal-profit-unknown"]')).toBeNull();
    expect(el.querySelector('[data-testid="deal-closed-outside-badge"]')).toBeNull();
    expect(el.textContent).toMatch(/\$0\.02/);
  });
});

describe('deal card — Realized box (spec 167 §3)', () => {
  const renderCard = (flags: string[] | undefined) =>
    render(
      createElement(TradeCard, {
        trade: detailTrade(flags) as never,
        enableEnhancedView: false,
      })
    );
  it('shows Unknown for a profitUnknown deal', () => {
    const el = renderCard(UNKNOWN);
    expect(el.querySelector('[data-testid="deal-profit-unknown"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="deal-closed-outside-badge"]')).not.toBeNull();
  });
  it('shows the figure for an ordinary closed deal', () => {
    const el = renderCard(['futuresPrecision']);
    expect(el.querySelector('[data-testid="deal-profit-unknown"]')).toBeNull();
    expect(el.querySelector('[data-testid="deal-closed-outside-badge"]')).toBeNull();
  });
});
