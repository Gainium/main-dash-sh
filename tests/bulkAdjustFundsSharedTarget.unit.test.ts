import { test, expect } from '@playwright/test';

import {
  sharedTargetValue,
  type BulkAdjustFundsTarget,
} from '@/components/deals/actions/bulkAdjustFundsTargets';

/**
 * The Add/Reduce funds dialog labels its amount picker with the pair's real
 * asset names and seeds the limit price from the pair's market price. Both
 * come from the SELECTION, and both are statements about one pair.
 *
 * Selecting Add funds from a single row in the table view goes through this
 * same bulk path, so refusing to resolve anything here — which is what the
 * first version did for the symbol — costs a single-deal user the market-price
 * default that the card view gives them. Resolving it across a MIXED selection
 * is worse: it puts one symbol's price on the other symbols' orders.
 */

const target = (over: Partial<BulkAdjustFundsTarget>): BulkAdjustFundsTarget => ({
  dealId: 'd',
  botId: 'b',
  status: 'open',
  type: 'DCA',
  baseAsset: 'SOL',
  quoteAsset: 'USDC',
  symbol: 'SOLUSDC',
  exchange: 'binance',
  ...over,
});

const symbolOf = (t: BulkAdjustFundsTarget) => t.symbol;

test('a single selected deal resolves — the table row menu lands here', () => {
  expect(sharedTargetValue([target({})], symbolOf)).toBe('SOLUSDC');
});

test('deals that all share a pair resolve', () => {
  expect(
    sharedTargetValue([target({ dealId: 'a' }), target({ dealId: 'b' })], symbolOf)
  ).toBe('SOLUSDC');
});

test('a mixed selection resolves to nothing rather than picking one', () => {
  const mixed = [target({}), target({ dealId: 'b', symbol: 'BTCUSDT' })];

  expect(sharedTargetValue(mixed, symbolOf)).toBeUndefined();
  // The failure this guards against is `targets[0].symbol`, which would have
  // seeded SOLUSDC's price into a BTCUSDT order.
  expect(sharedTargetValue(mixed, symbolOf)).not.toBe('SOLUSDC');
});

test('an empty selection resolves to nothing', () => {
  expect(sharedTargetValue([], symbolOf)).toBeUndefined();
});

test('a blank value is treated as unknown, not as a shared value', () => {
  // Deals whose symbol arrived as a bare string leave these undefined; the
  // dialog must fall back to its generic labels rather than render "Base ()".
  expect(
    sharedTargetValue([target({ baseAsset: undefined })], (t) => t.baseAsset)
  ).toBeUndefined();
  expect(
    sharedTargetValue([target({ baseAsset: '' })], (t) => t.baseAsset)
  ).toBeUndefined();
});
