import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * A projected ("Smart order") level must never stand for a level the deal has
 * already filled. The projection used to decide that only by price: keep the
 * levels past the deepest resting DCA order, then drop any that sit exactly on
 * a real order's price. Once every DCA order has filled nothing rests, so the
 * first rule keeps the whole ladder — and the second misses any level the
 * venue filled one tick away from the client-side ladder's rounding, which
 * then shows as a pending "Smart order" next to its own fill.
 *
 * The ladder here is the REAL generator's, built from a live deal's settings:
 * 0.5% step x1.15, 8 levels, entry 592.58 on a 2-decimal pair, where level 4
 * projects 577.785 → 577.79 and the venue filled it at 577.78.
 */

vi.mock('@/contexts/ExchangeDataContext', () => ({
  useTradingPairsFromContext: () => ({
    pairsByExchange: {
      kraken: [
        {
          pair: 'XMR-USD',
          baseAsset: { name: 'XMR', minAmount: 0.001, step: 0.00000001 },
          quoteAsset: { name: 'USD', minAmount: 0.5 },
          priceAssetPrecision: 2,
        },
      ],
    },
  }),
}));
vi.mock('@/hooks/useUsdRate', () => ({ useUsdRate: () => ({ rate: 1 }) }));
vi.mock('@/hooks/useUserFeesService', () => ({
  useUserFees: () => ({ getCachedFee: () => ({ maker: 0.0025 }) }),
}));
vi.mock('@/stores/live/balanceStore', () => ({
  useBalanceStore: (select: (s: { balances: unknown[] }) => unknown) =>
    select({ balances: [] }),
}));

import { useDealSmartOrders } from '@/hooks/bots/dca/useDealSmartOrders';
import type { DCABotSettings, DCADeals } from '@/types';
import type { ViewOrder } from '@/types/bots';

const settings = {
  pair: ['XMR-USD'],
  strategy: 'LONG',
  dcaCondition: 'percentage',
  useDca: true,
  useSmartOrders: true,
  activeOrdersCount: 4,
  ordersCount: 8,
  step: '0.5',
  stepScale: '1.15',
  volumeScale: '1.15',
  minimumDeviation: '1',
  baseOrderSize: '50',
  orderSize: '50',
  orderSizeType: 'quote',
  orderFixedIn: 'quote',
  startOrderType: 'LIMIT',
  profitCurrency: 'quote',
  useTp: true,
  tpPerc: '1.500',
  useSl: false,
  slPerc: '-10',
  baseSlOn: 'avg',
  dealCloseCondition: 'tp',
  scaleDcaType: 'percentage',
  dcaVolumeBaseOn: 'scale',
  futures: false,
  coinm: false,
  leverage: 1,
  marginType: 'isolated',
} as unknown as DCABotSettings;

// The fills of the level-4 deal, in ladder order: base order, then DCA 1..8.
const FILLS = [
  592.58, 589.62, 586.21, 582.29, 577.78, 572.6, 566.64, 559.79, 551.91,
];

const order = (price: number, typeOrder: string) =>
  ({ price, typeOrder, dealId: 'deal-1' }) as unknown as ViewOrder;

const makeDeal = (complete: number) =>
  ({
    _id: 'deal-1',
    status: 'open',
    exchange: 'kraken',
    initialPrice: 592.58,
    lastPrice: FILLS[complete - 1],
    levels: { all: 9, complete },
    symbol: { symbol: 'XMR-USD', baseAsset: 'XMR', quoteAsset: 'USD' },
    settings: { ...settings },
    gridBreakpoints: [],
    tpSlTargetFilled: [],
    dynamicAr: [],
  }) as unknown as DCADeals;

type Result = ReturnType<typeof useDealSmartOrders>;
const latest: { current: Result | null } = { current: null };

function Harness(props: {
  deal: DCADeals;
  pendingOrders: ViewOrder[];
  completedOrders: ViewOrder[];
}) {
  const result = useDealSmartOrders({
    bot: { settings, exchangeUUID: 'ex-1', vars: null },
    ...props,
  });
  useEffect(() => {
    latest.current = result;
  });
  return null;
}

let root: Root;
let host: HTMLDivElement;

const render = async (props: Parameters<typeof Harness>[0]) => {
  await act(async () => {
    root.render(createElement(Harness, props));
  });
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  return latest.current as Result;
};

describe('projected DCA levels skip the levels the deal has filled', () => {
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

  test('the real ladder projects level 4 one tick off its fill', async () => {
    const res = await render({
      deal: makeDeal(9),
      pendingOrders: [order(579.24, 'dealTP')],
      completedOrders: [
        order(FILLS[0], 'dealStart'),
        ...FILLS.slice(1).map((p) => order(p, 'dealRegular')),
      ],
    });
    const dca = res.fullLadder
      .filter((o) => o.type === 'DCA order')
      .map((o) => o.price);
    expect(dca).toHaveLength(8);
    expect(dca[3]).toBe(577.79);
  });

  test('every DCA level filled: nothing is projected', async () => {
    const res = await render({
      deal: makeDeal(9),
      pendingOrders: [order(579.24, 'dealTP')],
      completedOrders: [
        order(FILLS[0], 'dealStart'),
        ...FILLS.slice(1).map((p) => order(p, 'dealRegular')),
      ],
    });
    expect(res.smartChartOrders.map((o) => o.price)).toEqual([]);
    expect(res.smartOrders).toEqual([]);
  });

  test('filled levels are skipped by number even with no resting DCA order', async () => {
    // Levels 1-4 filled (4 at 577.78), nothing resting yet: only 5-8 remain.
    const res = await render({
      deal: makeDeal(5),
      pendingOrders: [order(585, 'dealTP')],
      completedOrders: [
        order(FILLS[0], 'dealStart'),
        ...FILLS.slice(1, 5).map((p) => order(p, 'dealRegular')),
      ],
    });
    const dca = res.fullLadder
      .filter((o) => o.type === 'DCA order')
      .map((o) => o.price);
    expect(res.smartChartOrders.map((o) => o.price)).toEqual(dca.slice(4));
  });

  test('resting DCA orders still bound the projection', async () => {
    // Levels 1-2 filled, 3-6 resting on the venue: only 7-8 are projected.
    const deal = makeDeal(3);
    const ladder = (
      await render({ deal, pendingOrders: [], completedOrders: [] })
    ).fullLadder
      .filter((o) => o.type === 'DCA order')
      .map((o) => o.price);
    const res = await render({
      deal,
      pendingOrders: ladder
        .slice(2, 6)
        .map((p) => order(p, 'dealRegular'))
        .concat(order(590, 'dealTP')),
      completedOrders: [
        order(FILLS[0], 'dealStart'),
        ...FILLS.slice(1, 3).map((p) => order(p, 'dealRegular')),
      ],
    });
    expect(res.smartChartOrders.map((o) => o.price)).toEqual(ladder.slice(6));
  });
});
