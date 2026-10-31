import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

import { resolvePairAssets } from '@/utils/pairs';

// A concatenated symbol does not name its assets: `NIGHTUSD` is NIGHT/USD or
// NIGH/TUSD. Every local quote list in the bot forms guessed, and each fix to
// one left the others. `resolvePairAssets` is the one splitter; these tests pin
// its contract and keep new copies from appearing.

const pair = (base: string, quote: string, symbol = `${base}${quote}`) => ({
  pair: symbol,
  baseAsset: { name: base },
  quoteAsset: { name: quote },
});

describe('resolvePairAssets', () => {
  // Symbols that read two ways, each with the listing that actually exists.
  const ambiguous: Array<[string, string, string]> = [
    ['NIGHTUSD', 'NIGHT', 'USD'],
    ['QNTUSD', 'QNT', 'USD'],
    ['BATUSD', 'BAT', 'USD'],
    ['ETHBUSD', 'ETH', 'BUSD'],
    ['USDTUSD', 'USDT', 'USD'],
    ['TUSDUSDT', 'TUSD', 'USDT'],
  ];

  test.each(ambiguous)('%s takes its assets from metadata', (symbol, base, quote) => {
    expect(resolvePairAssets(symbol, pair(base, quote))).toEqual({
      baseAsset: base,
      quoteAsset: quote,
    });
  });

  test.each(ambiguous.filter(([s]) => !['USDTUSD', 'TUSDUSDT'].includes(s)))(
    '%s without metadata is left blank, never guessed',
    (symbol) => {
      expect(resolvePairAssets(symbol)).toEqual({ baseAsset: '', quoteAsset: '' });
    }
  );

  test.each([
    ['BTCUSDT', 'BTC', 'USDT'],
    ['ETHBTC', 'ETH', 'BTC'],
    ['SOLUSDC', 'SOL', 'USDC'],
    ['XBTEUR', 'XBT', 'EUR'],
  ])('%s with one possible reading splits without metadata', (symbol, base, quote) => {
    expect(resolvePairAssets(symbol)).toEqual({ baseAsset: base, quoteAsset: quote });
  });

  test('explicit separators are split on', () => {
    expect(resolvePairAssets('NIGHT/USD')).toEqual({ baseAsset: 'NIGHT', quoteAsset: 'USD' });
    expect(resolvePairAssets('qnt-usd')).toEqual({ baseAsset: 'QNT', quoteAsset: 'USD' });
  });

  test('contract symbols use metadata, not the native string', () => {
    expect(
      resolvePairAssets('BTCUSD_PERP', pair('BTC', 'USD', 'BTCUSD_PERP'))
    ).toEqual({ baseAsset: 'BTC', quoteAsset: 'USD' });
  });

  test('metadata names are returned as listed', () => {
    expect(resolvePairAssets('AAPLXUSD', pair('AAPLx', 'USD', 'AAPLx-USD'))).toEqual({
      baseAsset: 'AAPLx',
      quoteAsset: 'USD',
    });
  });

  test('half-filled metadata falls back to the symbol', () => {
    expect(
      resolvePairAssets('BTCUSDT', { baseAsset: { name: 'BTC' }, quoteAsset: null })
    ).toEqual({ baseAsset: 'BTC', quoteAsset: 'USDT' });
  });

  test('empty input', () => {
    expect(resolvePairAssets('')).toEqual({ baseAsset: '', quoteAsset: '' });
    expect(resolvePairAssets(undefined)).toEqual({ baseAsset: '', quoteAsset: '' });
  });
});

// ---------------------------------------------------------------------------
// Guard: no pair splitter outside utils/pairs.ts.

const SRC = resolve(__dirname, '../src');
const CANONICAL = 'utils/pairs.ts';

const PATTERNS: Array<[string, RegExp]> = [
  [
    'local quote list',
    /\b(?:KNOWN|COMMON)_QUOTES\b|\b(?:known|common)Quotes\b|\bquote(?:Assets|s|List)\s*=\s*\[\s*['"](?:USDT|USDC|USD|BTC)['"]/,
  ],
  ['suffix match on a quote', /\.endsWith\(\s*\w*\b(?:q|quote\w*)\s*(?:\.toUpperCase\(\))?\s*\)/i],
  ['slice by quote length', /slice\([^)]*-\s*\w*\b(?:q|quote\w*)\.length/i],
];

// Reviewed exceptions: neither decides a currency, balance or payload.
const ALLOWED: Record<string, string> = {
  'utils/portfolioScreenerMatching.ts':
    'Maps a balance asset to a screener coin for its logo/rank after an exact match fails.',
  'utils/tradingView/factory.ts':
    'Builds chart symbol-search suggestions from COMMON_QUOTE_ASSETS.',
};

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name) ? [path] : [];
  });

const violations = () =>
  sourceFiles(SRC).flatMap((path) => {
    const file = relative(SRC, path);
    if (file === CANONICAL) return [];
    return readFileSync(path, 'utf8')
      .split('\n')
      .flatMap((line, index) =>
        PATTERNS.filter(([, re]) => re.test(line)).map(
          ([what]) => ({ file, line: index + 1, what, text: line.trim() })
        )
      );
  });

describe('pair splitting lives in utils/pairs.ts only', () => {
  test('no new splitter outside the canonical resolver', () => {
    const found = violations().filter((v) => !(v.file in ALLOWED));
    // Use resolvePairAssets(symbol, metadata) from '@/utils/pairs' instead.
    expect(found).toEqual([]);
  });

  test('every allowed exception still exists', () => {
    const files = new Set(violations().map((v) => v.file));
    expect(Object.keys(ALLOWED).filter((file) => !files.has(file))).toEqual([]);
  });
});
