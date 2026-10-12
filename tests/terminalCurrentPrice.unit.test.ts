import { test, expect } from '@playwright/test';

import { formatPriceInQuote } from '@/utils/formatters';

/**
 * The Terminal's "Current price" hint under Limit Price (and the long/short
 * limit-direction errors) rendered `latestPrice.toFixed(2)` behind a hard-coded
 * "$", so a sub-cent pair read "Current price: $0.01" — off by ~100% and
 * useless as a reference for the limit price.
 */

test('a sub-cent price is shown at the pair precision, not rounded to cents', () => {
  expect(formatPriceInQuote(0.00509364, 'USDT', 6)).toBe('$0.005094');
  // The old rendering, kept to pin why this was wrong.
  expect(`$${(0.00509364).toFixed(2)}`).toBe('$0.01');
});

test('pair precision is honoured above $1 too', () => {
  expect(formatPriceInQuote(1.23456, 'USDT', 4)).toBe('$1.2346');
  expect(formatPriceInQuote(84139.6, 'USDT', 1)).toBe('$84139.6');
});

test('the unit is the quote asset, not a hard-coded dollar', () => {
  expect(formatPriceInQuote(0.00001234, 'BTC', 8)).toBe('0.00001234 BTC');
  expect(formatPriceInQuote(2067.5, 'EUR', 2)).toBe('€2067.50');
});

test('unknown precision falls back to adaptive decimals, never to cents', () => {
  // pairPrecisionMap is filled asynchronously and defaults to 0 when unknown.
  expect(formatPriceInQuote(0.00509364, 'USDT')).toBe('$0.005094');
  expect(formatPriceInQuote(0.00509364, 'USDT', 0)).toBe('$0.005094');
  expect(formatPriceInQuote(0.5, 'USDT', undefined)).toBe('$0.50000');
});
