import { test, expect } from '@playwright/test';

import {
  basePrecisionFromStep,
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

/**
 * The engine rounds the order to the pair's lot step and checks it against the
 * exchange minimums; the preview must say what the engine will do, not what
 * the raw arithmetic says.
 */
const BTC = { step: 0.001, minBase: 0.001, minQuote: 5 };
const DCA_BASIS = {
  perHundred: 0.005,
  remainingBase: 0.005,
  perHundredQuote: 400,
  avgPrice: 80000,
};

test('lot step decimals mirror the engine', () => {
  expect(basePrecisionFromStep(0.001)).toBe(3);
  expect(basePrecisionFromStep(1)).toBe(0);
  expect(basePrecisionFromStep(10)).toBe(0);
  expect(basePrecisionFromStep(0.5)).toBe(0);
  // The engine's own reading of a step that is not a power of ten.
  expect(basePrecisionFromStep(0.05)).toBe(1);
  expect(basePrecisionFromStep(0.005)).toBe(3);
  expect(basePrecisionFromStep(1e-8)).toBe(8);
});

test('dca reduce 50% is rounded to the lot step the way the engine rounds it', () => {
  // 0.0025 BTC rounds half-up to 0.003 at a 0.001 step.
  const o = must(
    dcaFundsOutcome(
      'reduce',
      DCA_BASIS,
      { qty: 50, asset: 'quote', perc: true, price: 82000 },
      true,
      BTC
    )
  );
  expect(o.orderBase).toBe(0.003);
  expect(o.belowMinimum).toBeNull();
});

test('dca percentage below the minimum is raised to it, not refused', () => {
  const o = must(
    dcaFundsOutcome(
      'add',
      DCA_BASIS,
      { qty: 5, asset: 'quote', perc: true, price: 82000 },
      true,
      BTC
    )
  );
  expect(o.raisedToMinimum).toBe(true);
  expect(o.orderBase).toBe(0.001);
  expect(o.belowMinimum).toBeNull();
});

test('dca fixed amount below the minimum is refused', () => {
  const o = must(
    dcaFundsOutcome(
      'add',
      DCA_BASIS,
      { qty: 30, asset: 'quote', perc: false, price: 82000 },
      true,
      BTC
    )
  );
  expect(o.orderBase).toBe(0);
  expect(o.belowMinimum).toBe('order');
});

test('combo add whose market order rounds below the minimum is refused', () => {
  // A 0.06 ETH position: +13% is 0.0078 ETH, 0.008 at a 0.001 step, under a
  // 0.01 ETH minimum.
  const eth = { step: 0.001, minBase: 0.01, minQuote: 1 };
  const basis = {
    perHundred: 0.06,
    remainingBase: 0.06,
    perHundredQuote: 240,
    avgPrice: 4000,
  };
  const o = must(
    comboFundsOutcome(
      'add',
      basis,
      { qty: 13, asset: 'quote', perc: true, price: 4000 },
      NONE,
      true,
      eth
    )
  );
  expect(o.orderBase).toBe(0.008);
  expect(o.belowMinimum).toBe('order');
});

test('combo scale follows the rounded order', () => {
  const o = must(
    comboFundsOutcome(
      'add',
      BASIS,
      { qty: 50, asset: 'quote', perc: true, price: 90 },
      NONE,
      true,
      { step: 0.1, minBase: 0, minQuote: 0 }
    )
  );
  expect(o.orderBase).toBe(4.2);
  expect(o.scale).toBeCloseTo(1 + 4.2 / BASE, 10);
});

test('combo reduce that leaves a resting line below the minimum is refused with the largest reduction', () => {
  // A 0.02-unit line at 100 with a 1 USDT notional minimum: k ≥ 0.5.
  const pending = {
    base: 0,
    quote: 0,
    lines: [
      { qty: 0.02, price: 100 },
      { qty: 1, price: 100 },
    ],
  };
  const limits = { step: 0.0001, minBase: 0, minQuote: 1 };
  const refused = must(
    comboFundsOutcome(
      'reduce',
      BASIS,
      { qty: 70, asset: 'quote', perc: true, price: 90 },
      pending,
      true,
      limits
    )
  );
  expect(refused.belowMinimum).toBe('level');
  expect(refused.maxReducePerc).toBe(50);
  const allowed = must(
    comboFundsOutcome(
      'reduce',
      BASIS,
      { qty: 50, asset: 'quote', perc: true, price: 90 },
      pending,
      true,
      limits
    )
  );
  expect(allowed.belowMinimum).toBeNull();
});
