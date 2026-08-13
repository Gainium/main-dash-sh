import { test, expect } from '@playwright/test';

import {
  isPairSymbolReconstructable,
  normalizePairKey,
  resolvePairSelectionSymbol,
  resolveStoredPairSymbol,
  stripDexPrefix,
} from '@/utils/pairs';

/**
 * The bot form used to identify a pair purely as `${base}-${quote}` and store
 * it with the separators stripped. That round trip silently corrupts every
 * contract market whose exchange-native symbol carries a component that lives
 * in neither asset — the reconstructed symbol is either rejected by the candle
 * API or resolves to a DIFFERENT instrument (the perpetual instead of the dated
 * future). These cases are all present in a stock installation; the natives and
 * assets below are copied from the live `getAllPairs` payload.
 */
const CONTRACT_PAIRS = [
  { exchange: 'binanceCoinm', native: 'BTCUSD_PERP', base: 'BTC', quote: 'USD' },
  { exchange: 'binanceUsdm', native: 'BTCUSDT_260925', base: 'BTC', quote: 'USDT' },
  { exchange: 'bybitLinear', native: 'BTCUSDT-25SEP26', base: 'BTC', quote: 'USDT' },
  { exchange: 'bybitLinear', native: 'BNBPERP', base: 'BNB', quote: 'USDC' },
  { exchange: 'bybitInverse', native: 'BTCUSDU26', base: 'BTC', quote: 'USD' },
  { exchange: 'kucoinInverse', native: 'BTCMU26', base: 'BTC', quote: 'USD' },
  { exchange: 'bitgetUsdm', native: 'BTCPERP', base: 'BTC', quote: 'USDC' },
  { exchange: 'okx', native: 'BTC-USD_UM_XPERP', base: 'BTC', quote: 'USD' },
];

/** Pairs that already round-tripped correctly — these must not change at all. */
const PLAIN_PAIRS = [
  { exchange: 'binance', native: 'BTCUSDT', base: 'BTC', quote: 'USDT' },
  { exchange: 'okx', native: 'BTC-USDT', base: 'BTC', quote: 'USDT' },
  { exchange: 'kraken', native: 'AAPLx-USD', base: 'AAPLx', quote: 'USD' },
  { exchange: 'hyperliquid', native: 'BTC-USDC', base: 'BTC', quote: 'USDC' },
];

test.describe('isPairSymbolReconstructable', () => {
  test('contract symbols cannot be rebuilt from base + quote', () => {
    for (const { native, base, quote } of CONTRACT_PAIRS) {
      expect(
        isPairSymbolReconstructable(native, base, quote),
        `${native} (${base}/${quote})`
      ).toBe(false);
    }
  });

  test('plain symbols round-trip regardless of separator', () => {
    for (const { native, base, quote } of PLAIN_PAIRS) {
      expect(
        isPairSymbolReconstructable(native, base, quote),
        `${native} (${base}/${quote})`
      ).toBe(true);
    }
  });

  test('missing assets are treated as not reconstructable', () => {
    expect(isPairSymbolReconstructable('BTCUSDT', '', 'USDT')).toBe(false);
    expect(isPairSymbolReconstructable('', 'BTC', 'USDT')).toBe(false);
  });
});

test.describe('resolvePairSelectionSymbol', () => {
  test('a contract pair is identified by its native symbol', () => {
    expect(resolvePairSelectionSymbol('BTCUSD_PERP', 'BTC', 'USD')).toBe(
      'BTCUSD_PERP'
    );
    expect(resolvePairSelectionSymbol('BTCPERP', 'BTC', 'USDC')).toBe('BTCPERP');
  });

  test('a plain pair keeps the historical dashed selection symbol', () => {
    expect(resolvePairSelectionSymbol('BTCUSDT', 'BTC', 'USDT')).toBe(
      'BTC-USDT'
    );
  });

  test('perpetual and every dated expiry stay distinct in the picker', () => {
    // All four are BTC/USD on binanceCoinm — under the old `${base}-${quote}`
    // identity they collapsed onto one row and the de-dupe dropped three.
    const symbols = ['BTCUSD_PERP', 'BTCUSD_260925', 'BTCUSD_261225'].map((n) =>
      resolvePairSelectionSymbol(n, 'BTC', 'USD')
    );
    expect(new Set(symbols).size).toBe(3);
  });

  test('a contract pair does not collide with the venue plain contract', () => {
    // `${base}${quote}` would file BTCUSD_PERP under `BTCUSD` and shadow the
    // real BTCUSD contract in `pairMetadata`.
    expect(normalizePairKey(resolvePairSelectionSymbol('BTCUSD_PERP', 'BTC', 'USD'))).not.toBe(
      normalizePairKey(resolvePairSelectionSymbol('BTCUSD', 'BTC', 'USD'))
    );
  });
});

test.describe('resolveStoredPairSymbol', () => {
  const meta = (native: string, base: string, quote: string) => ({
    pair: native,
    baseAsset: { name: base },
    quoteAsset: { name: quote },
  });

  test('a contract pair is stored as the exchange-native symbol', () => {
    for (const { native, base, quote } of CONTRACT_PAIRS) {
      expect(
        resolveStoredPairSymbol(native, meta(native, base, quote)),
        native
      ).toBe(native);
    }
  });

  test('a plain pair keeps the concatenated stored form', () => {
    expect(
      resolveStoredPairSymbol('BTC-USDT', meta('BTCUSDT', 'BTC', 'USDT'))
    ).toBe('BTCUSDT');
    expect(
      resolveStoredPairSymbol('BTC-USDT', meta('BTC-USDT', 'BTC', 'USDT'))
    ).toBe('BTCUSDT');
  });

  test('without metadata it falls back to the historical normalization', () => {
    // Free-typed / pasted input we cannot resolve must behave exactly as before,
    // otherwise "BTC/USDT" would be stored verbatim instead of as "BTCUSDT".
    expect(resolveStoredPairSymbol('BTC/USDT', null)).toBe('BTCUSDT');
    expect(resolveStoredPairSymbol('btc-usdt', undefined)).toBe('BTCUSDT');
  });

  test('tokenized-stock casing survives (venues are case-sensitive on the x)', () => {
    expect(
      resolveStoredPairSymbol('AAPLx-USD', meta('AAPLx-USD', 'AAPLx', 'USD'))
    ).toBe('AAPLXUSD');
  });
});

/**
 * The `dex:` prefix on Hyperliquid HIP-3 bases names the builder dex that
 * listed the market, not the asset. It drives icon lookup (`xyz:SP500` →
 * `/images/index/SP500.svg`) and the unit label next to an amount field, where
 * the fixed padding means a long label overruns the value.
 */
test.describe('stripDexPrefix', () => {
  test('a builder-dex base yields the clean underlying', () => {
    expect(stripDexPrefix('xyz:SP500')).toBe('SP500');
    expect(stripDexPrefix('flx:NVDA')).toBe('NVDA');
    expect(stripDexPrefix('para:AVGO')).toBe('AVGO');
  });

  test('a plain base is returned untouched', () => {
    // No colon => nothing to strip. Casing must survive: venues are
    // case-sensitive on the tokenized-stock `x`.
    expect(stripDexPrefix('BTC')).toBe('BTC');
    expect(stripDexPrefix('AAPLx')).toBe('AAPLx');
    expect(stripDexPrefix('BRK.B')).toBe('BRK.B');
  });

  test('empty and nullish input degrade to an empty string', () => {
    expect(stripDexPrefix('')).toBe('');
    expect(stripDexPrefix(undefined as unknown as string)).toBe('');
  });

  test('only the first colon delimits the prefix', () => {
    // Defensive: the underlying keeps any remaining colon rather than being
    // truncated to its last segment.
    expect(stripDexPrefix('xyz:A:B')).toBe('A:B');
  });
});
