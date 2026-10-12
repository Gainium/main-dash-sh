import { test, expect } from '@playwright/test';

import { formatPairPrice } from '@/utils/formatters';
import { formatNumber } from '@/utils/numberFormatter';
import { findTradingPair } from '@/utils/pairs';
import type { TradingPair } from '@/stores/tradingPairsDataStore';

/**
 * The deals tables' Avg Price / Initial Price cells used `formatNumber(v, true)`,
 * whose `< 0.01` branch returns exponent notation before the precise branch runs,
 * so a sub-cent pair read "8.42e-3 USDT"; above 0.01 a rounded avg and an
 * unrounded initial price printed different decimal counts on one row.
 */

const pair = (p: string, priceAssetPrecision: number): TradingPair =>
  ({
    pair: p,
    exchange: 'binanceUsdm',
    priceAssetPrecision,
    baseAsset: { name: 'X', minAmount: 0, maxAmount: 0, step: 1 },
    quoteAsset: { name: 'USDT', minAmount: 0 },
    crossAvailable: true,
  }) as TradingPair;

test('spec 101 §1.1: a sub-cent price is a plain decimal, not exponent notation', () => {
  // The old rendering, kept to pin why this was wrong.
  expect(formatNumber(0.0084159, true)).toBe('8.42e-3');
  expect(formatPairPrice(0.0084159, 7)).toBe('0.0084159');
  expect(formatPairPrice(0.0084159434547, 7)).toBe('0.0084159');
});

test('spec 101 §1.2: both prices on a row share the pair precision', () => {
  expect(formatPairPrice(0.018347, 7)).toBe('0.0183470');
  expect(formatPairPrice(0.01834704, 7)).toBe('0.0183470');
  expect(formatPairPrice(3.0612, 4)).toBe('3.0612');
});

test('spec 101 §1.3: unknown precision falls back to adaptive decimals, never exponent', () => {
  expect(formatPairPrice(0.0084159)).toBe('0.008416');
  expect(formatPairPrice(0.0084159, 0)).toBe('0.008416');
  expect(formatPairPrice(0.00001234)).toBe('0.00001234');
});

test('spec 101 §1.4: thousands separators are kept and no unit is added', () => {
  expect(formatPairPrice(84139.6, 1)).toBe('84,139.6');
  expect(formatPairPrice(84139.6)).toBe('84,139.60');
});

test('spec 101 §3: the pair is found by exchange, exact or normalized key', () => {
  const store = {
    binanceUsdm: {
      '1000PEPEUSDT': pair('1000PEPEUSDT', 7),
      'BTC-USDT': pair('BTC-USDT', 1),
    },
  };
  expect(findTradingPair(store, 'binanceUsdm', '1000PEPEUSDT')?.priceAssetPrecision).toBe(7);
  expect(findTradingPair(store, 'binanceUsdm', 'BTCUSDT')?.priceAssetPrecision).toBe(1);
  expect(findTradingPair(store, 'bybit', '1000PEPEUSDT')).toBeUndefined();
  expect(findTradingPair(store, undefined, '1000PEPEUSDT')).toBeUndefined();
});
