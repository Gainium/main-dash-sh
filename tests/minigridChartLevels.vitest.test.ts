import { test, expect } from 'vitest';

import { createMinigridChartLevels } from '@/utils/bots/dca/example-orders-core';
import { StrategyEnum, type Symbols } from '@/types';

/**
 * A combo deal's not-placed grid levels are drawn from each live minigrid's
 * own stored range, so they land where the engine places them.
 *
 * The deal's projected ladder anchors a minigrid on a projected DCA price;
 * a minigrid really starts where its DCA order filled. When the two differ the
 * chart used to leave that minigrid's levels out entirely. The two fixtures
 * below are live minigrids of one spot long combo deal (synthetic ids), with
 * every price the engine placed for them.
 */

const symbol = {
  pair: 'PUMPUSDT',
  exchange: 'bitget',
  priceAssetPrecision: 6,
  baseAsset: { name: 'PUMP', minAmount: 1, step: 0.01, maxAmount: 1e12 },
  quoteAsset: { name: 'USDT', minAmount: 1, step: 0.000001 },
} as unknown as Symbols;

const settings = {
  strategy: StrategyEnum.long,
  futures: false,
  coinm: false,
  profitCurrency: 'quote',
} as const;

const levelsOf = (minigrid: Parameters<typeof createMinigridChartLevels>[0]) =>
  createMinigridChartLevels(minigrid, { symbol, userFee: 0.001, settings })
    .map((g) => g.price)
    .sort((a, b) => a - b);

test('levels of a minigrid in range match the prices the engine placed', () => {
  const engine = [0.004054, 0.004123, 0.004192, 0.004262, 0.004331];
  const prices = levelsOf({
    initialPrice: 0.003977,
    lastPrice: 0.003977,
    settings: {
      topPrice: 0.0043216624499999995,
      lowPrice: 0.003977,
      levels: 5,
      budget: 49.99999733,
      sellDisplacement: 0.002,
    },
  });
  expect(prices).toHaveLength(engine.length);
  for (const p of engine) {
    expect(prices).toContain(p);
  }
});

test('an active minigrid keeps a buy below its last fill and sells above', () => {
  const prices = levelsOf({
    initialPrice: 0.002218,
    lastPrice: 0.002324,
    settings: {
      topPrice: 0.002722620293045,
      lowPrice: 0.002218,
      levels: 5,
      budget: 49.99999694,
      sellDisplacement: 0.002,
    },
  });
  expect(prices).toEqual([0.002218, 0.002425, 0.002526, 0.002627, 0.002728]);
});

test('nothing for a minigrid without a usable range', () => {
  expect(
    levelsOf({
      initialPrice: 0.002218,
      lastPrice: 0.002218,
      settings: {
        topPrice: 0,
        lowPrice: 0.002218,
        levels: 5,
        budget: 50,
        sellDisplacement: 0.002,
      },
    })
  ).toEqual([]);
});
