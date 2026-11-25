import { test, expect } from '@playwright/test';

import { heldOrdersToChartLines } from '@/utils/bots/dca/held-order-lines';

const label = (t: string) => (t === 'dealGrid' ? 'Combo grid order' : t);
const dealHeldOrdersToChartLines = (
  ...a: [
    Parameters<typeof heldOrdersToChartLines>[0],
    Parameters<typeof heldOrdersToChartLines>[1],
    Parameters<typeof heldOrdersToChartLines>[2],
    string,
  ]
) => heldOrdersToChartLines(...a, label);
import { BotOrderSideEnum, StrategyEnum } from '@/types';
import type { ViewOrder } from '@/types/bots';

/**
 * Orders the exchange refuses this far from the price (its price band) are held
 * by the bot and placed once the price is near. The chart draws them grey at
 * the price they will rest, so the user can see they are there.
 */
const held = [
  { side: 'SELL', price: 621.88, qty: 0.0351, typeOrder: 'dealGrid' },
  { side: 'SELL', price: 576.66, qty: 0.0351, typeOrder: 'dealGrid' },
];

test('held orders draw as grey lines at their price', () => {
  const lines = dealHeldOrdersToChartLines(
    held,
    [],
    StrategyEnum.long,
    'RXYZUSDT'
  );
  expect(lines.map((l) => l.price)).toEqual([621.88, 576.66]);
  for (const l of lines) {
    expect(l.grey).toBe(true);
    expect(l.side).toBe(BotOrderSideEnum.sell);
    expect(l.qty).toBe(0.0351);
    expect(l.greyLabel).toBe('Combo grid order');
  }
});

test('a level that already rests on the exchange is not drawn twice', () => {
  const resting = [
    { side: 'sell', price: '576.66', origQty: '0.0351' } as unknown as ViewOrder,
  ];
  const lines = dealHeldOrdersToChartLines(
    held,
    resting,
    StrategyEnum.long,
    'RXYZUSDT'
  );
  expect(lines.map((l) => l.price)).toEqual([621.88]);
});

test('nothing held, nothing drawn', () => {
  expect(
    dealHeldOrdersToChartLines(null, [], StrategyEnum.long, 'X')
  ).toEqual([]);
});
