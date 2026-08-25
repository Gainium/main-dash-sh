import { test, expect } from '@playwright/test';

import { calculateEnhancedBalances } from '@/utils/balanceCalculations';
import type { Asset } from '@/types';

/**
 * Portfolio balances used to be valued by matching the exchange's ticker
 * against the market screener's coin symbols. That match is a guess: a coin
 * renamed upstream (a venue still lists Toncoin as `TON` while the screener
 * carries the post-rebrand `gram`) or a long-tail listing the screener does not
 * carry at all matched nothing, priced at 0, and rendered a real holding as
 * `$0.00` — silently understating the portfolio total.
 *
 * `getBalances(input: { includeUsdValues: true })` now returns the venue's own
 * rate per holding. These tests pin the ladder: venue rate first, screener only
 * as a fallback, and an explicit "unpriced" flag rather than a confident zero
 * when neither can value the asset.
 */

const balance = (asset: string, free: string, price?: string | null): Asset =>
  ({
    asset,
    free,
    locked: '0',
    exchange: 'coinbase',
    exchangeUUID: 'uuid-1',
    exchangeName: 'Coinbase',
    ...(price === undefined ? {} : { price }),
  }) as Asset;

const calc = (balances: Asset[], prices: { symbol: string; price: number }[]) =>
  calculateEnhancedBalances(
    { portfolioAssets: [], bots: [], exchanges: [], prices, balances },
    false
  );

test.describe('portfolio balances prefer the venue rate over the screener', () => {
  test('a screener miss is priced by the venue instead of rendering $0.00', () => {
    // The reported case: the screener carries no `TON` at all.
    const [row] = calc([balance('TON', '13.72', '1.4629')], []);

    expect(row.currentPrice).toBeCloseTo(1.4629, 8);
    expect(row.totalUsd).toBeCloseTo(20.07, 2);
    expect(row.priceUnavailable).toBe(false);
  });

  test('the venue rate wins even when the screener also has a price', () => {
    const [row] = calc(
      [balance('TON', '10', '1.5')],
      [{ symbol: 'TON', price: 99 }]
    );

    expect(row.currentPrice).toBe(1.5);
    expect(row.totalUsd).toBeCloseTo(15, 2);
  });

  test('the screener still prices a holding the venue publishes no rate for', () => {
    // `null` is what the backend sends when its rate table has no entry.
    const [row] = calc(
      [balance('GALA', '100', null)],
      [{ symbol: 'GALA', price: 0.02 }]
    );

    expect(row.currentPrice).toBe(0.02);
    expect(row.totalUsd).toBeCloseTo(2, 2);
    expect(row.priceUnavailable).toBe(false);
  });

  test('no price source at all is flagged, not reported as zero', () => {
    const [row] = calc([balance('SYND', '3.54', null)], []);

    expect(row.priceUnavailable).toBe(true);
    expect(row.total).toBeCloseTo(3.54, 8);
  });

  test('a backend that predates includeUsdValues degrades to the old behaviour', () => {
    // No `price` field on the row at all — the pre-1.53.5 response shape.
    const [row] = calc([balance('BTC', '2')], [{ symbol: 'BTC', price: 50000 }]);

    expect(row.currentPrice).toBe(50000);
    expect(row.totalUsd).toBeCloseTo(100000, 2);
  });

  test('aggregating venues keeps the rate when only one of them could price', () => {
    const rows = calculateEnhancedBalances(
      {
        portfolioAssets: [],
        bots: [],
        exchanges: [],
        prices: [],
        balances: [
          { ...balance('TON', '10', '1.5'), exchangeUUID: 'uuid-1' },
          { ...balance('TON', '5', null), exchangeUUID: 'uuid-2' },
        ] as Asset[],
      },
      true
    );

    expect(rows).toHaveLength(1);
    // 10 TON priced at 1.5; the venue that publishes no rate contributes
    // nothing to the value, but must not zero out the whole holding.
    expect(rows[0].total).toBeCloseTo(15, 8);
    expect(rows[0].totalUsd).toBeCloseTo(15, 2);
    expect(rows[0].priceUnavailable).toBe(false);
  });
});
