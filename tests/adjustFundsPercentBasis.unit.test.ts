import { test, expect } from '@playwright/test';

import {
  percentBasis,
  percentClosesDeal,
  resolvePercentQuantity,
  type PercentBasisInput,
} from '@/features/bots/shared/runtime/dialogs/adjustFundsAmount';

/**
 * These numbers are not invented: each fixture is a real open deal read off the
 * platform on 2026-08-28, with the base the deal actually held recorded
 * alongside. They exist to pin the preview to what the ENGINE orders
 * (`addDealFunds` / `reduceDealFunds` in main-app core `dcaHelper`) rather than
 * to what a reasonable person would assume "% of position" means — the two
 * differ, and the gap grows as the DCA ladder fills.
 */

const spot = (over: Partial<PercentBasisInput>): PercentBasisInput => ({
  usageCurrentBase: 0,
  usageCurrentQuote: 0,
  lastPrice: 1,
  remainingBase: 0,
  long: true,
  futures: false,
  coinm: false,
  marginType: 'isolated',
  leverage: 1,
  ...over,
});

// ONDO/USDT, 3 of 9 levels filled. Held 46.5 ONDO.
const ONDO = spot({
  usageCurrentQuote: 17.54758000000001,
  lastPrice: 0.3702,
  remainingBase: 46.5,
});

// XPL/USDT, 8 of 9 levels filled. Held 1794.3 XPL — the widest gap observed.
const XPL = spot({
  usageCurrentQuote: 165.873052,
  lastPrice: 0.08559,
  remainingBase: 1794.2999999999997,
});

// BTC-USD USD-M futures long, 2 of 6 levels. Held 0.0024 BTC.
const BTC_FUTURES = spot({
  usageCurrentQuote: 193.8936,
  lastPrice: 80383,
  remainingBase: 0.0024,
  futures: true,
  marginType: 'isolated',
  leverage: 1,
});

test('100% resolves ABOVE the base actually held, on a real deal', () => {
  const basis = percentBasis(ONDO);
  const full = resolvePercentQuantity(basis, '100');

  expect(full).toBeCloseTo(47.4003, 3);
  // The whole point: 47.4 > the 46.5 held.
  expect(full ?? 0).toBeGreaterThan(ONDO.remainingBase);
});

test('the gap widens with ladder depth — 92.6% closes an 8-level deal', () => {
  const basis = percentBasis(XPL);

  expect(resolvePercentQuantity(basis, '100')).toBeCloseTo(1937.996, 2);
  // 1794.3 / 1937.996 = 92.58%, so anything from ~92.6% up is a full close.
  expect(percentClosesDeal(basis, resolvePercentQuantity(basis, '93'))).toBe(
    true
  );
  expect(percentClosesDeal(basis, resolvePercentQuantity(basis, '92'))).toBe(
    false
  );
});

test('a futures long uses the same quote/lastPrice basis', () => {
  const full = resolvePercentQuantity(percentBasis(BTC_FUTURES), '100');
  expect(full).toBeCloseTo(0.0024122, 6);
});

test('a short reads the base side, not quote/price', () => {
  const basis = percentBasis(
    spot({ long: false, usageCurrentBase: 8, usageCurrentQuote: 999, lastPrice: 7, remainingBase: 8 })
  );
  expect(resolvePercentQuantity(basis, '50')).toBe(4);
});

test('leverage only multiplies when the bot set a margin type of its own', () => {
  const base = { usageCurrentQuote: 100, lastPrice: 10, remainingBase: 5, futures: true, leverage: 3 };

  // marginType 'inherit' means the bot declared no leverage — multiplier 1.
  expect(
    resolvePercentQuantity(percentBasis(spot({ ...base, marginType: 'inherit' })), '100')
  ).toBe(10);
  expect(
    resolvePercentQuantity(percentBasis(spot({ ...base, marginType: 'isolated' })), '100')
  ).toBe(30);
});

test('unusable inputs produce no preview rather than a zero', () => {
  // A deal with nothing spent yet, or a missing price, must render blank — a
  // confident "0 SOL" would be read as "this order does nothing".
  expect(percentBasis(spot({ usageCurrentQuote: 0, lastPrice: 5 }))).toBeNull();
  expect(percentBasis(spot({ usageCurrentQuote: 10, lastPrice: 0 }))).toBeNull();
  expect(resolvePercentQuantity(null, '50')).toBeNull();
  expect(resolvePercentQuantity(percentBasis(ONDO), '')).toBeNull();
  expect(resolvePercentQuantity(percentBasis(ONDO), 'abc')).toBeNull();
});

test('the close warning stays off when the position is unknown', () => {
  const basis = percentBasis(spot({ usageCurrentQuote: 100, lastPrice: 10, remainingBase: 0 }));
  expect(percentClosesDeal(basis, 10)).toBe(false);
});
