/**
 * Runner: Vitest — `npx vitest run core/tests/pairPickerFit.vitest.test.ts`.
 *
 * Spec 115 (parent repo) §3.5 min order and §4.1 "fits this bot": the pure
 * rules behind the pair picker's Min order column and its disabled rows.
 */
import { describe, expect, test } from 'vitest';
import {
  formatLeverageRange,
  pairMinOrderQuote,
  pairFitReason,
  resolveBotFirstOrderQuote,
  resolveBotSmallestOrderQuote,
} from '@/utils/pairPicker';

const spot = {
  exchange: 'binance',
  baseAsset: { name: 'BTC', minAmount: 0.00001, maxAmount: 9000, step: 0.00001 },
  quoteAsset: { name: 'USDT', minAmount: 5 },
};

describe('§3.5 pairMinOrderQuote', () => {
  test('quote minimum wins when it is the larger', () => {
    expect(pairMinOrderQuote(spot, 60000)).toBe(5);
  });
  test('base minimum × price wins when it is the larger', () => {
    const pair = { ...spot, baseAsset: { ...spot.baseAsset, minAmount: 0.001 } };
    expect(pairMinOrderQuote(pair, 60000)).toBe(60);
  });
  test('a base minimum with no price is not computed (null, not a guess)', () => {
    const pair = { ...spot, baseAsset: { ...spot.baseAsset, minAmount: 0.001 } };
    expect(pairMinOrderQuote(pair, undefined)).toBeNull();
  });
  test('quote minimum alone needs no price', () => {
    const pair = { ...spot, baseAsset: { ...spot.baseAsset, minAmount: 0 } };
    expect(pairMinOrderQuote(pair, undefined)).toBe(5);
  });
  test('coin-margined contracts are not computed (quote minimum is the contract size)', () => {
    expect(
      pairMinOrderQuote({ ...spot, exchange: 'binanceCoinm' }, 60000)
    ).toBeNull();
  });
  test('no minimums at all → null', () => {
    const pair = {
      ...spot,
      baseAsset: { ...spot.baseAsset, minAmount: 0 },
      quoteAsset: { name: 'USDT', minAmount: 0 },
    };
    expect(pairMinOrderQuote(pair, 60000)).toBeNull();
  });
});

describe('§4.1 resolveBotSmallestOrderQuote', () => {
  const dca = {
    orderSizeType: 'quote',
    baseOrderSize: '20',
    orderSize: '10',
    useDca: true,
    allowRaiseToExchangeMin: false,
  };
  test('smallest of base order and DCA order', () => {
    expect(resolveBotSmallestOrderQuote(dca)).toBe(10);
  });
  test('DCA order ignored when DCA is off', () => {
    expect(resolveBotSmallestOrderQuote({ ...dca, useDca: false })).toBe(20);
  });
  test('raise-to-exchange-minimum on → no minimum check (null)', () => {
    expect(
      resolveBotSmallestOrderQuote({ ...dca, allowRaiseToExchangeMin: true })
    ).toBeNull();
  });
  test('non-quote order sizes → no minimum check (null)', () => {
    expect(
      resolveBotSmallestOrderQuote({ ...dca, orderSizeType: 'percFree' })
    ).toBeNull();
  });
  test('unparseable sizes → null', () => {
    expect(
      resolveBotSmallestOrderQuote({ ...dca, baseOrderSize: '', orderSize: '' })
    ).toBeNull();
  });
});

describe('§4.1 pairFitReason', () => {
  const bot = { smallestOrderQuote: 10, leverage: 20 };
  test('fits → null', () => {
    expect(pairFitReason({ minOrder: 5, maxLeverage: 50, quote: 'USDT' }, bot)).toBeNull();
  });
  test('order below the exchange minimum → reason', () => {
    expect(
      pairFitReason({ minOrder: 50, maxLeverage: 50, quote: 'USDT' }, bot)
    ).toMatch(/50 USDT/);
  });
  test('bot leverage above the pair max → reason', () => {
    expect(
      pairFitReason({ minOrder: 5, maxLeverage: 10, quote: 'USDT' }, bot)
    ).toMatch(/10×/);
  });
  test('§4.3 missing data never makes a pair not fit', () => {
    expect(
      pairFitReason({ minOrder: null, maxLeverage: null, quote: 'USDT' }, bot)
    ).toBeNull();
    expect(
      pairFitReason(
        { minOrder: 50, maxLeverage: 10, quote: 'USDT' },
        { smallestOrderQuote: null, leverage: null }
      )
    ).toBeNull();
  });
});

describe('§4.1(c) not enough balance for the base order', () => {
  const bot = { smallestOrderQuote: null, leverage: null, firstOrderQuote: 10 };
  test('free quote balance below the base order → reason', () => {
    expect(
      pairFitReason(
        { minOrder: null, maxLeverage: null, quote: 'USDC', freeQuote: 3.2 },
        bot
      )
    ).toMatch(/Not enough USDC/);
  });
  test('enough balance → fits', () => {
    expect(
      pairFitReason(
        { minOrder: null, maxLeverage: null, quote: 'USDT', freeQuote: 50 },
        bot
      )
    ).toBeNull();
  });
  test('unknown balance never makes a pair unfit', () => {
    expect(
      pairFitReason({ minOrder: null, maxLeverage: null, quote: 'USDT' }, bot)
    ).toBeNull();
  });
  test('first order is the base order, quote-denominated only', () => {
    expect(
      resolveBotFirstOrderQuote({ orderSizeType: 'quote', baseOrderSize: '25' })
    ).toBe(25);
    expect(
      resolveBotFirstOrderQuote({ orderSizeType: 'base', baseOrderSize: '25' })
    ).toBeNull();
  });
});

describe('§2.1 card leverage text: min–max×', () => {
  test('both limits', () => {
    expect(formatLeverageRange(1, 100)).toBe('1–100×');
    expect(formatLeverageRange(0.01, 12.5)).toBe('0.01–12.5×');
  });
  test('one limit', () => {
    expect(formatLeverageRange(undefined, 50)).toBe('Up to 50×');
    expect(formatLeverageRange(2, undefined)).toBe('From 2×');
  });
  test('none → null (nothing rendered)', () => {
    expect(formatLeverageRange(undefined, undefined)).toBeNull();
  });
});
