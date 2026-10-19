import { test, expect } from '@playwright/test';

import {
  comboFundsOutcome,
  dcaFundsOutcome,
} from '@/features/bots/shared/runtime/dialogs/fundsOutcome';

/**
 * The add / reduce funds dialog states what the order does to the deal. These
 * pin the arithmetic against a worked combo example: long, opened at 100,
 * base order 100 USDT, DCA levels 100 / 200 / 400 USDT at 98 / 96 / 94, all
 * filled — 8.3590 base for 800 USDT (average 95.705) — price now 90.
 */
const BASE = 1 + 100 / 98 + 200 / 96 + 400 / 94;
const BASIS = {
  perHundred: BASE,
  remainingBase: BASE,
  perHundredQuote: 800,
  avgPrice: 800 / BASE,
};
const NONE = { base: 0, quote: 0 };

function must<T>(value: T | null): T {
  if (value === null) throw new Error('no outcome');
  return value;
}

test('combo +50%: tops every filled rung up at market and lowers the average', () => {
  const o = must(comboFundsOutcome(
    'add',
    BASIS,
    { qty: 50, asset: 'quote', perc: true, price: 90 },
    NONE,
    true
  ));
  expect(o.scale).toBeCloseTo(1.5, 10);
  expect(o.orderBase).toBeCloseTo(4.1795, 3);
  expect(o.orderQuote).toBeCloseTo(376.16, 1);
  expect(o.avgAfter).toBeCloseTo(93.8, 1);
});

test('combo fixed amount is the total commitment, pending levels included', () => {
  // Two levels still resting: 300 USDT worth. 452.31 = 50% of (752.31 + 300).
  const pending = { base: 300 / 95, quote: 300 };
  const o = must(comboFundsOutcome(
    'add',
    BASIS,
    { qty: (BASE * 90 + 300) / 2, asset: 'quote', perc: false, price: 90 },
    pending,
    true
  ));
  expect(o.scale).toBeCloseTo(1.5, 10);
  expect(o.pendingQuoteDelta).toBeCloseTo(150, 6);
});

test('combo reduce 25% sells a quarter at market and realizes the loss', () => {
  const o = must(comboFundsOutcome(
    'reduce',
    BASIS,
    { qty: 25, asset: 'quote', perc: true, price: 90 },
    NONE,
    true
  ));
  expect(o.orderBase).toBeCloseTo(2.0898, 3);
  expect(o.avgAfter).toBeCloseTo(BASIS.avgPrice, 10);
  expect(must(o.realized)).toBeCloseTo(-11.92, 1);
  expect(o.closesDeal).toBe(false);
});

test('combo reduce of 100% closes the deal', () => {
  const o = must(comboFundsOutcome(
    'reduce',
    BASIS,
    { qty: 100, asset: 'quote', perc: true, price: 90 },
    NONE,
    true
  ));
  expect(o.closesDeal).toBe(true);
});

test('dca add folds the order into the average', () => {
  const o = must(dcaFundsOutcome(
    'add',
    BASIS,
    { qty: 400, asset: 'quote', perc: false, price: 90 },
    true
  ));
  expect(o.orderBase).toBeCloseTo(4.4444, 3);
  expect(o.avgAfter).toBeCloseTo(1200 / (BASE + 400 / 90), 6);
});

test('dca reduce keeps the average and closes at or above the position', () => {
  const o = must(dcaFundsOutcome(
    'reduce',
    BASIS,
    { qty: 1, asset: 'base', perc: false, price: 90 },
    true
  ));
  expect(o.avgAfter).toBe(BASIS.avgPrice);
  expect(o.positionAfter).toBeCloseTo(BASE - 1, 10);
  expect(
    must(
      dcaFundsOutcome(
        'reduce',
        BASIS,
        { qty: 100, asset: 'base', perc: false, price: 90 },
        true
      )
    ).closesDeal
  ).toBe(true);
});
