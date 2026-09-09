import { test, expect } from '@playwright/test';

import { calculateEnhancedBalances } from '../src/utils/balanceCalculations';
import type { BalanceCalculationInput } from '../src/types/enhancedBalance.types';

// Portfolio page regression: with the balances widget's "Aggregate" switch on
// and one or more exchanges selected in My Accounts, every token the user held
// on MORE THAN ONE venue vanished from the table while single-venue tokens
// stayed. Aggregation blanks `exchangeUUID` (an aggregate row spans venues and
// cannot name one), and the widget then filtered the RESULT by that field, so
// exactly the multi-venue rows failed the test. For a real account that is
// BTC / USDT / ETH — the largest holdings — which reads as "my positions are
// missing", not as "the filter is off".
//
// The fix restricts the input to the selection BEFORE aggregating, so the sums
// mean "across the selected exchanges" and nothing is dropped afterwards.

const BYBIT = 'bybit-uuid';
const BITGET = 'bitget-uuid';

const balance = (
  asset: string,
  exchangeUUID: string,
  free: string,
  price: string,
) => ({
  asset,
  free,
  locked: '0',
  exchange: 'bybit',
  exchangeName: 'name',
  exchangeUUID,
  price,
  usdValue: `${parseFloat(free) * parseFloat(price)}`,
});

const input = (selectedExchanges?: string[]): BalanceCalculationInput => ({
  portfolioAssets: [],
  bots: [],
  prices: [
    { symbol: 'BTC', price: 100000 },
    { symbol: 'USDT', price: 1 },
    { symbol: 'DOGE', price: 0.1 },
  ],
  coins: [],
  exchanges: [],
  balances: [
    // Held on BOTH venues — the rows that used to disappear.
    balance('BTC', BYBIT, '0.4', '100000'),
    balance('BTC', BITGET, '0.1', '100000'),
    balance('USDT', BYBIT, '2000', '1'),
    balance('USDT', BITGET, '500', '1'),
    // Held on ONE venue — these always survived, which is what made the bug
    // look like selective data loss rather than a broken filter.
    balance('DOGE', BYBIT, '1000', '0.1'),
  ],
  selectedExchanges,
});

test('aggregate + exchange selection keeps multi-venue tokens', () => {
  const rows = calculateEnhancedBalances(input([BYBIT]), true);
  const tokens = rows.map((r) => r.token).sort();

  expect(tokens).toEqual(['BTC', 'DOGE', 'USDT']);
});

test('aggregate sums only the selected exchanges', () => {
  const rows = calculateEnhancedBalances(input([BYBIT]), true);

  // 0.4 BTC on Bybit — the 0.1 on Bitget is outside the selection.
  expect(rows.find((r) => r.token === 'BTC')?.total).toBe(0.4);
  expect(rows.find((r) => r.token === 'USDT')?.total).toBe(2000);
});

test('aggregate across two selected exchanges sums both', () => {
  const rows = calculateEnhancedBalances(input([BYBIT, BITGET]), true);

  expect(rows.find((r) => r.token === 'BTC')?.total).toBe(0.5);
  expect(rows.find((r) => r.token === 'USDT')?.total).toBe(2500);
});

test('non-aggregated rows are restricted to the selection too', () => {
  const rows = calculateEnhancedBalances(input([BITGET]), false);

  expect(rows.map((r) => r.token).sort()).toEqual(['BTC', 'USDT']);
  expect(rows.every((r) => r.exchangeUUID === BITGET)).toBe(true);
});

test('ALL and an absent selection leave every row in place', () => {
  expect(calculateEnhancedBalances(input(['ALL']), false)).toHaveLength(5);
  expect(calculateEnhancedBalances(input(undefined), false)).toHaveLength(5);
  expect(calculateEnhancedBalances(input([]), false)).toHaveLength(5);
});

test('a selected exchange holding nothing renders empty, not portfolio-wide', () => {
  const rows = calculateEnhancedBalances(input(['empty-exchange-uuid']), false);

  expect(rows).toHaveLength(0);
});
