import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * A combo deal projects two kinds of not-yet-placed levels, each behind its
 * own switch: DCA levels (smart orders / DCA by market keep all but a few off
 * the exchange) and minigrid levels (smart grids). The projection used to run
 * only with smart grids on, and only for grid levels — so a combo with smart
 * orders on and smart grids off drew its one resting DCA order and none of the
 * DCA levels still to come.
 */

vi.mock('@/contexts/ExchangeDataContext', () => ({
  useTradingPairsFromContext: () => ({
    pairsByExchange: {
      bybit: [
        {
          pair: 'ADAUSDT',
          baseAsset: { name: 'ADA' },
          quoteAsset: { name: 'USDT' },
          priceAssetPrecision: 4,
        },
      ],
    },
  }),
}));
vi.mock('@/hooks/useUsdRate', () => ({ useUsdRate: () => ({ rate: 1 }) }));
vi.mock('@/hooks/useUserFeesService', () => ({
  useUserFees: () => ({ getCachedFee: () => ({ maker: 0.001 }) }),
}));
vi.mock('@/stores/live/balanceStore', () => ({
  useBalanceStore: (select: (s: { balances: unknown[] }) => unknown) =>
    select({ balances: [] }),
}));

// The combo ladder generator, reduced to what the projection filters on:
// a SHORT deal's DCA levels above the entry and one minigrid level.
vi.mock('@/utils/bots/dca/example-orders-core', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/utils/bots/dca/example-orders-core')
    >();
  const { DCAOrderTypeEnum } = await import('@/types');
  const level = (type: string, price: number) => ({ type, price, qty: 10 });
  return {
    ...actual,
    resolveSettingsVars: async (s: unknown) => s,
    createComboOrders: vi.fn(async () => [
      level(DCAOrderTypeEnum.dca, 0.23),
      level(DCAOrderTypeEnum.dca, 0.245),
      level(DCAOrderTypeEnum.dca, 0.2614),
      level(DCAOrderTypeEnum.grid, 0.28),
      level(DCAOrderTypeEnum.dca, 0.29),
      level(DCAOrderTypeEnum.dca, 0.32),
      level(DCAOrderTypeEnum.dca, 0.35),
    ]),
  };
});

import { useDealSmartOrders } from '@/hooks/bots/dca/useDealSmartOrders';
import type { DCABotSettings, DCADeals } from '@/types';
import type { ViewOrder } from '@/types/bots';

const deal = {
  _id: 'deal-1',
  status: 'open',
  exchange: 'bybit',
  initialPrice: 0.23,
  symbol: { symbol: 'ADAUSDT', baseAsset: 'ADA', quoteAsset: 'USDT' },
  settings: {},
} as unknown as DCADeals;

const order = (price: number, typeOrder: string) =>
  ({ price, typeOrder, dealId: 'deal-1' }) as unknown as ViewOrder;

// The one DCA order the bot keeps resting (active orders = 1), and the
// filled entry + DCA levels below it.
const pendingOrders = [order(0.2614, 'dealRegular')];
const completedOrders = [
  order(0.23, 'dealRegular'),
  order(0.245, 'dealRegular'),
];

type Result = ReturnType<typeof useDealSmartOrders>;
const latest: { current: Result | null } = { current: null };

function Harness({ settings }: { settings: Partial<DCABotSettings> }) {
  const result = useDealSmartOrders({
    bot: {
      settings: { strategy: 'SHORT', ...settings } as DCABotSettings,
      exchangeUUID: 'ex-1',
      vars: null,
    },
    deal,
    pendingOrders,
    completedOrders,
    isCombo: true,
  });
  useEffect(() => {
    latest.current = result;
  });
  return null;
}

let root: Root;
let host: HTMLDivElement;

const renderWith = async (settings: Partial<DCABotSettings>) => {
  await act(async () => {
    root.render(createElement(Harness, { settings }));
  });
  // Let the async ladder compute settle.
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  const grey = latest.current?.smartChartOrders ?? [];
  return grey.map((o) => [o.price, o.greyLabel]);
};

describe('combo deal projected levels', () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    latest.current = null;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  test('smart orders on, smart grids off: the DCA levels still to come are drawn grey', async () => {
    expect(
      await renderWith({ useSmartOrders: true, comboUseSmartGrids: false })
    ).toEqual([
      [0.29, 'Smart order'],
      [0.32, 'Smart order'],
      [0.35, 'Smart order'],
    ]);
  });

  test('smart grids alone still project only the minigrid levels', async () => {
    expect(
      await renderWith({ useSmartOrders: false, comboUseSmartGrids: true })
    ).toEqual([[0.28, 'Combo grid order']]);
  });

  test('both on: both projections, each with its own label', async () => {
    expect(
      await renderWith({ useSmartOrders: true, comboUseSmartGrids: true })
    ).toEqual([
      [0.28, 'Combo grid order'],
      [0.29, 'Smart order'],
      [0.32, 'Smart order'],
      [0.35, 'Smart order'],
    ]);
  });

  test('neither on: nothing projected', async () => {
    expect(
      await renderWith({ useSmartOrders: false, comboUseSmartGrids: false })
    ).toEqual([]);
  });
});
