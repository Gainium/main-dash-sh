import { test, expect } from '@playwright/test';

import {
  formatBound,
  getPaperTradingAssets,
  paperBalanceBounds,
} from '@/components/exchanges/exchangeConfig';

/**
 * Funding a paper account used to be validated against a flat 100 /
 * 1,000,000 with a "$" in the message, which assumed every top-up asset was a
 * stablecoin. A COIN-M futures account is margined in the base coin, so
 * `Paper Binance COIN-M Futures` funded with 0.2 BTC (~$12k) was rejected for
 * being "below $100" — the account could not be created at all.
 */
test.describe('paperBalanceBounds', () => {
  const binance = getPaperTradingAssets('binance');

  test('a USD-denominated asset keeps the historical 100 / 1,000,000', () => {
    // This is the compatibility anchor: whatever the derivation, a stablecoin
    // must land on exactly the bounds that shipped before.
    for (const symbol of ['USDT', 'USDC', 'FDUSD']) {
      const { min, max } = paperBalanceBounds(symbol, binance);
      expect(min, symbol).toBe(100);
      expect(max, symbol).toBe(1_000_000);
    }
  });

  test('BTC scales to its own unit, so 0.2 BTC is accepted', () => {
    const { min, max, asset } = paperBalanceBounds('BTC', binance);
    expect(asset).toBe('BTC');
    expect(min).toBe(0.01);
    expect(max).toBe(100);
    // The reported case.
    expect(0.2).toBeGreaterThanOrEqual(min);
    expect(0.2).toBeLessThanOrEqual(max);
  });

  test('ETH scales off its own suggested balance', () => {
    const { min, max } = paperBalanceBounds('ETH', binance);
    expect(min).toBe(0.1);
    expect(max).toBe(1000);
  });

  test('an unknown asset falls back to the stablecoin scale', () => {
    // Never leave a user unable to fund an account because an asset list
    // changed underneath the form.
    const { min, max, asset } = paperBalanceBounds('WHAT', binance);
    expect(asset).toBe('WHAT');
    expect(min).toBe(100);
    expect(max).toBe(1_000_000);
  });

  test('no selection falls back to the list default', () => {
    const { asset } = paperBalanceBounds(undefined, binance);
    expect(asset).toBe(binance[0].symbol);
  });

  test('an empty asset list does not throw', () => {
    const { min, max, asset } = paperBalanceBounds(undefined, []);
    expect(asset).toBe('USDT');
    expect(min).toBe(100);
    expect(max).toBe(1_000_000);
  });

  test('every configured asset admits its own suggested balance', () => {
    // A default the validator would reject would make the form fail on open.
    for (const brand of ['binance', 'bybit', 'okx', 'kucoin', 'coinbase']) {
      const assets = getPaperTradingAssets(brand);
      for (const a of assets) {
        const { min, max } = paperBalanceBounds(a.symbol, assets);
        const suggested = parseFloat(a.defaultBalance);
        expect(suggested, `${brand}/${a.symbol}`).toBeGreaterThanOrEqual(min);
        expect(suggested, `${brand}/${a.symbol}`).toBeLessThanOrEqual(max);
      }
    }
  });
});

test.describe('formatBound', () => {
  test('renders derived bounds without float noise', () => {
    expect(formatBound(0.01)).toBe('0.01');
    expect(formatBound(0.1)).toBe('0.1');
    expect(formatBound(100)).toBe('100');
    expect(formatBound(1_000_000)).toBe('1,000,000');
  });

  test('a division-derived bound does not leak binary rounding', () => {
    // 10 / 100 is 0.1 exactly, but 1 / 100 style derivations can produce
    // trailing noise that would show up in the user-facing message.
    expect(formatBound(3 / 100)).toBe('0.03');
    expect(formatBound(0.1 + 0.2)).toBe('0.3');
  });
});
