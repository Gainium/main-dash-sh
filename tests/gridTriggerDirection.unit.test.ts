import { test, expect } from '@playwright/test';

import { validateGridFormData } from '@/utils/bots/grid/validation';

/**
 * A grid bot's `priceReached` take profit and stop loss are two prices, and
 * which side of the range each belongs on depends on the grid's direction.
 * Setting them the wrong way round is silent and total: every price inside
 * the range already satisfies the trigger, so the bot stops on its first
 * candle before a single level fills. A backtest of it returns no results and
 * no transactions, which reads as a broken backtest rather than a bot that
 * did exactly what it was told.
 *
 * These cases pin the guard that rejects such a pair at the form.
 */

const TOP = '0.20859';
const LOW = '0.12231';

const base = {
  name: 'ARK Natural',
  exchangeUUID: 'acc-1',
  pair: ['ARKUSDT'],
  grid: {
    budget: 300,
    topPrice: TOP,
    lowPrice: LOW,
    levels: 21,
    tpSl: true,
    tpSlCondition: 'priceReached',
    tpPerc: 10,
    tpTopPrice: TOP,
    sl: true,
    slCondition: 'priceReached',
    slLowPrice: LOW,
    slPerc: -100,
    strategy: 'LONG',
    useStartPrice: false,
    startPrice: '',
    useOrderInAdvance: false,
    ordersInAdvance: 3,
    futures: true,
    leverage: 1,
    marginType: 'isolated',
  },
} as unknown as Parameters<typeof validateGridFormData>[0];

const validate = (grid: Record<string, unknown>) =>
  validateGridFormData({
    ...base,
    grid: { ...base.grid, ...grid },
  } as unknown as Parameters<typeof validateGridFormData>[0]).errors;

test.describe('grid priceReached trigger direction', () => {
  test('accepts a long grid with the triggers on their own sides', () => {
    const errors = validate({});
    expect(errors['tpSl']).toBeUndefined();
    expect(errors['sl']).toBeUndefined();
  });

  test('rejects a long grid whose take profit sits at the low price', () => {
    // the reported configuration: take profit set to the bottom of the range,
    // so any price in the range is already at or above it
    const errors = validate({ tpTopPrice: LOW });
    expect(errors['tpSl']).toContain('above the low price');
  });

  test('rejects a long grid whose stop loss sits at the top price', () => {
    const errors = validate({ slLowPrice: TOP });
    expect(errors['sl']).toContain('below the top price');
  });

  test('allows a long grid to stop inside its own range', () => {
    // a take profit below the top and a stop loss above the low are both
    // ordinary — the bot ends early, it does not fail to start
    const errors = validate({ tpTopPrice: '0.18', slLowPrice: '0.13' });
    expect(errors['tpSl']).toBeUndefined();
    expect(errors['sl']).toBeUndefined();
  });

  test('mirrors the rule for a short grid', () => {
    const short = { strategy: 'SHORT', tpTopPrice: LOW, slLowPrice: TOP };
    const ok = validate(short);
    expect(ok['tpSl']).toBeUndefined();
    expect(ok['sl']).toBeUndefined();

    const flipped = validate({
      strategy: 'SHORT',
      tpTopPrice: TOP,
      slLowPrice: LOW,
    });
    expect(flipped['tpSl']).toContain('below the top price');
    expect(flipped['sl']).toContain('above the low price');
  });

  test('leaves a valueChanged trigger alone', () => {
    const errors = validate({
      tpSlCondition: 'valueChanged',
      slCondition: 'valueChanged',
      tpTopPrice: LOW,
      slLowPrice: TOP,
    });
    expect(errors['tpSl']).toBeUndefined();
    expect(errors['sl']).toBeUndefined();
  });

  test('says nothing extra while the range is still incomplete', () => {
    const errors = validate({ topPrice: '', lowPrice: '', tpTopPrice: LOW });
    expect(errors['tpSl']).toBeUndefined();
  });
});
