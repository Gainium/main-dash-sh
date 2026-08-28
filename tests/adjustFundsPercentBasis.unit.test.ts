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
 * (`percentFundsBasis` in main-app core `dcaHelper`, shared by `addDealFunds`
 * and `reduceDealFunds`) — the preview is a promise about the order that will
 * be placed, so the two must never disagree.
 *
 * WHAT CHANGED, AND WHY THESE FIXTURES ARE KEPT
 *
 * These same deals used to demonstrate the opposite: the engine divided the
 * deal's cost basis by `lastPrice`, which reads like a live price but is a
 * running MINIMUM (long) / MAXIMUM (short) of fill prices, so 100% resolved to
 * MORE base than the deal held — by exactly the drawdown ratio
 * `avgPrice/lastPrice`, widening as the ladder filled. ONDO (3 levels) resolved
 * to 47.40 against 46.5 held; XPL (8 levels) to 1937.996 against 1794.3, so a
 * 93% reduce was a full close.
 *
 * The fixtures keep their real `lastPrice`, and the assertions below still name
 * those old numbers — as values the basis must NOT produce. That way a revert
 * to the old divisor fails loudly here rather than silently re-shipping it.
 *
 * `avgPrice` for a spot long is the VWAP over the deal's filled orders, and the
 * cost basis in `usageCurrentQuote` is precisely what those fills spent to
 * acquire `remainingBase` — so `usageCurrentQuote / remainingBase` IS the
 * deal's avgPrice, not a value reverse-engineered to make a test pass.
 */

const spot = (over: Partial<PercentBasisInput>): PercentBasisInput => ({
  usageCurrentBase: 0,
  usageCurrentQuote: 0,
  avgPrice: 1,
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
  avgPrice: 17.54758000000001 / 46.5,
  lastPrice: 0.3702,
  remainingBase: 46.5,
});

// XPL/USDT, 8 of 9 levels filled. Held 1794.3 XPL — the widest gap observed.
const XPL = spot({
  usageCurrentQuote: 165.873052,
  avgPrice: 165.873052 / 1794.2999999999997,
  lastPrice: 0.08559,
  remainingBase: 1794.2999999999997,
});

// BTC-USD USD-M futures long, 2 of 6 levels. Held 0.0024 BTC.
const BTC_FUTURES = spot({
  usageCurrentQuote: 193.8936,
  avgPrice: 193.8936 / 0.0024,
  lastPrice: 80383,
  remainingBase: 0.0024,
  futures: true,
  marginType: 'isolated',
  leverage: 1,
});

test('100% resolves to the base actually held, on a real deal', () => {
  const basis = percentBasis(ONDO);
  const full = resolvePercentQuantity(basis, '100');

  expect(full).toBeCloseTo(ONDO.remainingBase, 6);
  // The number this used to produce, kept so a revert cannot pass quietly.
  expect(full ?? 0).toBeLessThan(47.4003);
});

test('a deep ladder no longer over-resolves — 93% of an 8-level deal is not a close', () => {
  const basis = percentBasis(XPL);

  expect(resolvePercentQuantity(basis, '100')).toBeCloseTo(
    XPL.remainingBase,
    4
  );
  // Used to resolve to 1937.996, which made anything from ~92.6% a full close.
  expect(resolvePercentQuantity(basis, '100') ?? 0).toBeLessThan(1937.9);
  expect(percentClosesDeal(basis, resolvePercentQuantity(basis, '93'))).toBe(
    false
  );
  // 100% still closes the deal — that behaviour is intended and unchanged.
  expect(percentClosesDeal(basis, resolvePercentQuantity(basis, '100'))).toBe(
    true
  );
});

test('a futures long resolves to its position too', () => {
  const full = resolvePercentQuantity(percentBasis(BTC_FUTURES), '100');
  expect(full).toBeCloseTo(BTC_FUTURES.remainingBase, 9);
  // Used to resolve to 0.0024122 off the running-minimum fill price.
  expect(full ?? 0).toBeLessThan(0.0024122);
});

test('a short reads the base side, not quote/price — unchanged', () => {
  const basis = percentBasis(
    spot({
      long: false,
      usageCurrentBase: 8,
      usageCurrentQuote: 999,
      avgPrice: 6,
      lastPrice: 7,
      remainingBase: 8,
    })
  );
  expect(resolvePercentQuantity(basis, '50')).toBe(4);
});

test('leverage only multiplies when the bot set a margin type of its own', () => {
  const base = {
    usageCurrentQuote: 100,
    avgPrice: 10,
    lastPrice: 10,
    remainingBase: 5,
    futures: true,
    leverage: 3,
  };

  // marginType 'inherit' means the bot declared no leverage — multiplier 1.
  expect(
    resolvePercentQuantity(
      percentBasis(spot({ ...base, marginType: 'inherit' })),
      '100'
    )
  ).toBe(10);
  expect(
    resolvePercentQuantity(
      percentBasis(spot({ ...base, marginType: 'isolated' })),
      '100'
    )
  ).toBe(30);
});

test('falls back to lastPrice only when the deal has no avgPrice yet', () => {
  // Mirrors the engine's `deal.avgPrice || deal.lastPrice`. A deal with no
  // filled orders has neither a VWAP nor a position; before anything fills the
  // two coincide anyway, so the fallback cannot reintroduce the old skew.
  const basis = percentBasis(
    spot({ usageCurrentQuote: 100, avgPrice: 0, lastPrice: 20, remainingBase: 5 })
  );
  expect(resolvePercentQuantity(basis, '100')).toBe(5);
});

test('unusable inputs produce no preview rather than a zero', () => {
  // A deal with nothing spent yet, or no price at all, must render blank — a
  // confident "0 SOL" would be read as "this order does nothing".
  expect(
    percentBasis(spot({ usageCurrentQuote: 0, avgPrice: 5, lastPrice: 5 }))
  ).toBeNull();
  expect(
    percentBasis(spot({ usageCurrentQuote: 10, avgPrice: 0, lastPrice: 0 }))
  ).toBeNull();
  expect(resolvePercentQuantity(null, '50')).toBeNull();
  expect(resolvePercentQuantity(percentBasis(ONDO), '')).toBeNull();
  expect(resolvePercentQuantity(percentBasis(ONDO), 'abc')).toBeNull();
});

test('the close warning stays off when the position is unknown', () => {
  const basis = percentBasis(
    spot({ usageCurrentQuote: 100, avgPrice: 10, lastPrice: 10, remainingBase: 0 })
  );
  expect(percentClosesDeal(basis, 10)).toBe(false);
});
