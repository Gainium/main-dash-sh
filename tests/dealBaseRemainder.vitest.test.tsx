/**
 * Runner note: renders the real deal Orders section in jsdom, so it is a
 * Vitest file. Run from the parent:
 *   NODE_ENV=development npx vitest run \
 *     core/tests/dealBaseRemainder.vitest.test.tsx
 *
 * A part-filled LIMIT base order leaves its unfilled rest resting on the
 * exchange as a LIMIT add-funds order, reported as a `pendingAddFunds` entry
 * with `baseRemainder: true`. The Orders section shows a "Partially filled"
 * badge with filled / total in the base asset, and a "Buy rest at market"
 * action that goes through a confirmation before calling the mutation.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { MemoryRouter } from 'react-router-dom';

import {
  OrderSizeTypeEnum,
  StrategyEnum,
  type PendingAddFundsEntry,
} from '@/types';
import type { ViewOrder } from '@/types/bots';

const buyRest = vi.fn(async (_input: { dealId: string; botId: string }) => ({
  status: 'OK',
}));

vi.mock('@/hooks/useOrderActions', () => ({
  useCancelOrder: () => ({
    cancelTerminalOrder: async () => undefined,
    cancelPendingOrder: async () => undefined,
    isLoading: false,
  }),
  useBuyDealBaseRemainder: () => ({
    mutateAsync: buyRest,
    isPending: false,
  }),
}));

import { DealOrdersSection } from '@/components/trades/DealOrdersSection';

const BOT_ID = 'bot-1';
const DEAL_ID = 'deal-1';

const RESTING_REMAINDER: ViewOrder = {
  id: 'remainder-order',
  dealId: DEAL_ID,
  type: 'buy',
  status: 'pending',
  symbol: 'DOGE-USDT',
  baseAsset: 'DOGE',
  quoteAsset: 'USDT',
  amount: 337.1,
  price: 0.25,
  filled: 0,
  remaining: 337.1,
  total: 84.275,
  createTime: new Date('2026-09-01T00:00:00Z').toISOString(),
  side: 'buy',
  exchange: 'binance',
  origQty: '337.1',
  executedQty: '0',
  typeOrder: 'dealRegular',
  clientOrderId: 'remainder-order',
  time: Date.parse('2026-09-01T00:00:00Z'),
};

const remainderEntry: PendingAddFundsEntry = {
  id: 'pending-1',
  qty: '337.1',
  useLimitPrice: true,
  limitPrice: '0.25',
  asset: OrderSizeTypeEnum.base,
  baseRemainder: true,
  baseTotal: '341.2',
};

/** An ordinary manual add-funds request, as sent by an older backend. */
const plainEntry: PendingAddFundsEntry = {
  id: 'pending-2',
  qty: '10',
  useLimitPrice: true,
  limitPrice: '0.2',
  asset: OrderSizeTypeEnum.base,
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as Record<string, unknown>).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
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
});

beforeEach(() => {
  buyRest.mockClear();
});

afterEach(() => {
  const r = root;
  if (r) {
    act(() => r.unmount());
    root = null;
  }
  host?.remove();
  host = null;
  document.body.innerHTML = '';
});

const render = (pendingAddFunds: PendingAddFundsEntry[]) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  const r = createRoot(host);
  root = r;
  act(() => {
    r.render(
      createElement(
        MemoryRouter,
        null,
        createElement(DealOrdersSection, {
          dealId: DEAL_ID,
          botId: BOT_ID,
          botType: 'DCA',
          exchange: 'binance',
          isLoadingOrders: false,
          strategy: StrategyEnum.long,
          pendingOrders: [RESTING_REMAINDER],
          completedOrders: [],
          pendingAddFunds,
          baseAsset: 'DOGE',
        })
      )
    );
  });
  return host;
};

const badge = () =>
  document.querySelector<HTMLElement>('[data-testid="base-remainder-badge"]');

const buttonByText = (text: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (b) => (b.textContent || '').trim().toLowerCase() === text.toLowerCase()
  );

describe('base order remainder', () => {
  it('shows "Partially filled" with filled / total in the base asset', () => {
    render([remainderEntry]);
    expect(badge()?.textContent).toBe('Partially filled 4.1 / 341.2 DOGE');
  });

  it('renders neither badge nor action without a remainder entry', () => {
    render([plainEntry]);
    expect(badge()).toBeNull();
    expect(buttonByText('Buy rest at market')).toBeUndefined();
  });

  it('confirms before buying the rest, then calls the mutation', async () => {
    render([remainderEntry]);
    const action = buttonByText('Buy rest at market');
    expect(action).toBeTruthy();

    act(() => action?.click());
    expect(buyRest).not.toHaveBeenCalled();

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.textContent).toContain(
      'cancels the resting limit order and buys the remaining 337.1 DOGE at market price'
    );

    await act(async () => buttonByText('Buy at market')?.click());
    expect(buyRest).toHaveBeenCalledTimes(1);
    expect(buyRest).toHaveBeenCalledWith({ dealId: DEAL_ID, botId: BOT_ID });
  });
});
