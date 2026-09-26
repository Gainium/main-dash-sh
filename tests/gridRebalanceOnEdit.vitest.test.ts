import { beforeEach, describe, expect, it, vi } from 'vitest';

const prices: Array<{ symbol: string; exchange: string; price: number }> = [];
vi.mock('@/helper/price', () => ({
  default: () => () => undefined,
  getLocalPrices: () => prices,
}));

import { GRID_FORM_DEFAULTS } from '@/contexts/bots/form/formDefaults';
import { ExchangeEnum, type Bot } from '@/types';
import type { BotFormData } from '@/types/bots/form';
import {
  createGridBotOrders,
  defaultContext,
  getEstimateGridBalance,
} from '@/utils/bots/dca/example-orders-core';
import { gridEditNeedsRebalance } from '@/utils/bots/grid/rebalance-on-edit';

/**
 * Editing a running grid: when the new settings need different balances than
 * the bot holds, the save asks how to cover the difference (start dialog in
 * update mode) instead of saving straight away — legacy gridbot `changeBot`.
 */

const PAIR = 'BTCUSDT';
const symbol = {
  pair: PAIR,
  exchange: ExchangeEnum.binance,
  baseAsset: { name: 'BTC', minAmount: 0.00001, maxAmount: 1000, step: 0.00001 },
  quoteAsset: { name: 'USDT', minAmount: 1 },
  priceAssetPrecision: 2,
};

const grid = {
  ...GRID_FORM_DEFAULTS,
  topPrice: 110,
  lowPrice: 90,
  levels: 10,
  budget: 1000,
};

const formData = (overrides: Partial<BotFormData['grid']> = {}) =>
  ({
    pair: [PAIR],
    pairMetadata: { [PAIR]: symbol },
    grid: { ...grid, ...overrides },
    userFee: { makerCommission: 0, takerCommission: 0 },
  }) as unknown as BotFormData;

/** What the grid needs for `settings`, computed the way the check does. */
const needed = (settings: BotFormData['grid']) => {
  const grids = createGridBotOrders(
    { all: true, nosplice: false, withoutErrorCheck: true, initialPrice: 100 },
    {
      ...defaultContext,
      gridSettings: settings,
      symbol: { ...symbol, maxOrders: 200 },
      inputLatestPrice: 100,
      userFee: 0,
    }
  );
  return getEstimateGridBalance(
    grids,
    { ...settings, pair: PAIR, name: '' },
    { ...symbol, maxOrders: 200 },
    undefined,
    true
  );
};

const bot = (overrides: Record<string, unknown> = {}) =>
  ({
    status: 'open',
    initialPriceStart: 100,
    settings: { useOrderInAdvance: false },
    currentBalances: needed(grid as BotFormData['grid']),
    ...overrides,
  }) as unknown as Bot;

describe('gridEditNeedsRebalance', () => {
  beforeEach(() => {
    prices.length = 0;
    prices.push({ symbol: PAIR, exchange: ExchangeEnum.binance, price: 100 });
  });

  it('is false when the edited grid needs what the bot already holds', () => {
    expect(gridEditNeedsRebalance(formData(), bot())).toBe(false);
  });

  it('is true when the edited grid needs a different balance', () => {
    expect(gridEditNeedsRebalance(formData({ budget: 3000 }), bot())).toBe(
      true
    );
  });

  it('is true when smart orders are switched off', () => {
    expect(
      gridEditNeedsRebalance(
        formData(),
        bot({ settings: { useOrderInAdvance: true } })
      )
    ).toBe(true);
  });

  it('never asks for a closed or archived bot', () => {
    expect(
      gridEditNeedsRebalance(formData({ budget: 3000 }), bot({ status: 'closed' }))
    ).toBe(false);
    expect(
      gridEditNeedsRebalance(
        formData({ budget: 3000 }),
        bot({ status: 'archive' })
      )
    ).toBe(false);
  });

  it('falls back to a plain save when there is no price yet', () => {
    prices.length = 0;
    expect(gridEditNeedsRebalance(formData({ budget: 3000 }), bot())).toBe(
      false
    );
  });
});
