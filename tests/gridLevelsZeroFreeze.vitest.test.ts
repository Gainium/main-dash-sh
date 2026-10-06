/**
 * Runner note: mocks a module, so this is a Vitest file. Run from the parent:
 * `npx vitest run core/tests/gridLevelsZeroFreeze.vitest.test.ts`
 *
 * Spec: `main-dash-redesign/specs/082.grid-levels-zero-freezes-tab.md`.
 *
 * The chart's example-order preview builds a geometric grid's price ladder by
 * multiplying by `1 + (top/low) ** (1/levels) - 1` until it passes the top. A
 * level count of 0 makes that factor Infinity, the price Infinity, and
 * `Infinity <= Infinity` never ends the loop: the tab spins, allocating a new
 * price every iteration, until the browser kills it (§3). Before the fix this
 * file never finishes.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/helper/price', () => ({
  default: () => () => undefined,
  getLocalPrices: () => [],
}));

import { GRID_FORM_DEFAULTS } from '@/contexts/bots/form/formDefaults';
import { ExchangeEnum } from '@/types';
import type { BotFormData } from '@/types/bots/form';
import {
  createGridBotOrders,
  defaultContext,
} from '@/utils/bots/dca/example-orders-core';

const symbol = {
  pair: 'BTCUSDT',
  exchange: ExchangeEnum.binance,
  baseAsset: { name: 'BTC', minAmount: 0.00001, maxAmount: 1000, step: 0.00001 },
  quoteAsset: { name: 'USDT', minAmount: 1 },
  priceAssetPrecision: 2,
  maxOrders: 200,
};

const orders = (levels: unknown, gridType: 'geometric' | 'arithmetic') =>
  createGridBotOrders(
    { all: true, initialPrice: 85000 },
    {
      ...defaultContext,
      gridSettings: {
        ...GRID_FORM_DEFAULTS,
        topPrice: 105000,
        lowPrice: 64000,
        budget: 1000,
        gridType,
        levels,
      } as unknown as BotFormData['grid'],
      symbol,
      inputLatestPrice: 85000,
      userFee: 0,
      // The race that reaches the loop: validation has already cleared the
      // `levels` error while the settings feed still carries the old count.
      errors: {},
    }
  );

describe('grid example orders with an unusable level count (§1.1, §3)', () => {
  for (const levels of [0, '0', '', 'abc', -3, Infinity]) {
    it(`geometric, levels ${JSON.stringify(levels)} → no orders, no hang`, () => {
      expect(orders(levels, 'geometric')).toEqual([]);
    });
  }

  it('arithmetic, levels 0 → no orders', () => {
    expect(orders(0, 'arithmetic')).toEqual([]);
  });

  it('a whole level count still builds the ladder (§1.4)', () => {
    expect(orders(20, 'geometric').length).toBeGreaterThan(10);
    expect(orders(20, 'arithmetic').length).toBeGreaterThan(10);
  });
});
