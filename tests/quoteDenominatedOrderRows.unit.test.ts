import { test, expect } from '@playwright/test';

import {
  formatOrderTime,
  formatPriceWithPrecision,
  formatQuoteAmount,
  quoteUnits,
} from '@/utils/formatters';

/**
 * Two defects reported together off one screenshot of a Kraken ETH-EUR deal
 * (bot 6a8fe465160f48e574ebaa8b, 2026-08-27). The Pending tab merges real
 * exchange orders with the projected smart-order ladder, and every projected
 * row rendered as "$1,521.81" at "01/01/1970, 01:00:00" — wrong currency on a
 * EUR pair, and a date for an order that was never placed.
 */

/* ------------------------------------------------------------------ *
 * 1. Epoch is "not placed", never a date.
 * ------------------------------------------------------------------ */

test('a projected ladder level renders no time at all', () => {
  // Exactly what useDealSmartOrders stamps on every projected row.
  expect(formatOrderTime(new Date(0).toISOString())).toBeNull();
  expect(formatOrderTime(0)).toBeNull();
});

test('the epoch string is truthy — the old `if (!raw)` guard could not catch it', () => {
  // Pins the reason the bug existed: this is why the guard had to change from
  // a falsiness check to a value check.
  expect(Boolean(new Date(0).toISOString())).toBe(true);
});

test('missing and unparseable times render nothing', () => {
  expect(formatOrderTime(undefined)).toBeNull();
  expect(formatOrderTime(null)).toBeNull();
  expect(formatOrderTime('')).toBeNull();
  expect(formatOrderTime('not a date')).toBeNull();
});

test('a real placed order still renders its timestamp', () => {
  // The base order of the reported deal.
  const when = formatOrderTime('2026-08-27T07:16:58.291Z');
  expect(when).not.toBeNull();
  expect(when).toBe(new Date('2026-08-27T07:16:58.291Z').toLocaleString());
});

/* ------------------------------------------------------------------ *
 * 2. Amounts carry the pair's own quote asset, not a hardcoded "$".
 * ------------------------------------------------------------------ */

test('EUR pairs render in euro, not dollars', () => {
  expect(formatQuoteAmount(1521.81, 'EUR')).toBe('€1,521.81');
  expect(quoteUnits('EUR')).toEqual({ prefix: '€', suffix: '' });
});

test('dollar stablecoins keep the dollar glyph', () => {
  for (const asset of ['USD', 'USDT', 'USDC', 'BUSD', 'FDUSD', 'DAI']) {
    expect(formatQuoteAmount(1521.81, asset)).toBe('$1,521.81');
  }
});

test('an asset with no glyph gets its ticker appended rather than a wrong symbol', () => {
  // A bare number or a "$" would both be wrong on a BTC-quoted pair.
  expect(formatQuoteAmount(0.0234, 'BTC', 4)).toBe('0.0234 BTC');
  expect(quoteUnits('BTC')).toEqual({ prefix: '', suffix: ' BTC' });
});

test('with no quote asset the behaviour is unchanged from before the fix', () => {
  // Every call site passed nothing and got "$". Callers that still cannot
  // supply an asset must not regress.
  expect(formatQuoteAmount(1521.81)).toBe('$1,521.81');
  expect(formatQuoteAmount(1521.81, '')).toBe('$1,521.81');
  expect(formatQuoteAmount(1521.81, null)).toBe('$1,521.81');
});

test('the asset code is matched case-insensitively', () => {
  expect(formatQuoteAmount(10, 'eur')).toBe('€10.00');
  expect(formatQuoteAmount(10, ' Eur ')).toBe('€10.00');
});

test('formatPriceWithPrecision keeps its adaptive decimals under the new suffix', () => {
  const { prefix, suffix } = quoteUnits('EUR');
  // The first DCA rung of the reported deal.
  expect(formatPriceWithPrecision(2067.5, prefix, suffix)).toBe('€2,067.50');
  // Sub-1 prices keep their extra precision.
  expect(formatPriceWithPrecision(0.00034, prefix, suffix)).toBe('€0.00034000');
  // The default call signature is untouched for the ~70 usd-normalized sites.
  expect(formatPriceWithPrecision(2067.5)).toBe('$2,067.50');
});

test('a BTC-quoted price puts the ticker after the number', () => {
  const { prefix, suffix } = quoteUnits('BTC');
  expect(formatPriceWithPrecision(0.0234, prefix, suffix)).toBe('0.02340 BTC');
});
