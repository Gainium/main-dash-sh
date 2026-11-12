import type { ScreenerCoinData } from '@/types';
import logger from '../lib/loggerInstance';

/**
 * Utility functions for matching portfolio tokens to screener data
 */

/**
 * Interface for normalized asset symbols
 */
export interface NormalizedAsset {
  originalSymbol: string;
  normalizedSymbol: string;
}

/**
 * Helper function to normalize asset symbols (e.g., BTCUSDT -> BTC)
 * Removes exchange prefixes, common quote currencies, and trading pair suffixes
 */
export const normalizeAssetToSymbol = (raw: string): string => {
  let s = (raw || '').toUpperCase().trim();

  // Remove common prefixes like EXCHANGE:
  const colonIdx = s.indexOf(':');
  if (colonIdx >= 0) s = s.slice(colonIdx + 1);

  // Replace separators
  s = s.replace(/[-_]/g, '');

  // If pair format with '/', take base
  if (s.includes('/')) {
    return s.split('/')[0];
  }

  // Remove common quotes if at end
  const quotes = [
    'USDT',
    'USD',
    'BUSD',
    'USDC',
    'BTC',
    'ETH',
    'EUR',
    'BNB',
    'PAX',
    'TUSD',
    'DAI',
    'FDUSD',
    'TRY',
    'BRL',
  ];

  for (const q of quotes) {
    if (s.endsWith(q) && s.length > q.length) {
      return s.slice(0, s.length - q.length);
    }
  }

  // Remove PERP suffixes
  if (s.endsWith('PERP')) return s.slice(0, -4);

  return s;
};

/**
 * The tickers to look up in the screener for a set of holdings: each asset's
 * own name plus its normalized form, mirroring what findBestScreenerMatch tries.
 */
export const screenerSymbolsForAssets = (
  assets: { name?: string | null }[] | undefined | null
): string[] => {
  const out = new Set<string>();
  for (const asset of assets || []) {
    const raw = (asset?.name || '').toUpperCase().trim();
    if (!raw) continue;
    out.add(raw);
    out.add(normalizeAssetToSymbol(raw));
  }
  return Array.from(out);
};

/**
 * Builds a map from normalized symbols to screener coins, preferring higher market cap when duplicates exist
 */
export const buildScreenerSymbolMap = (
  screenerCoins: ScreenerCoinData[]
): Map<string, ScreenerCoinData> => {
  const symbolMap = new Map<string, ScreenerCoinData[]>();

  // Group coins by symbol
  for (const coin of screenerCoins) {
    const symbol = (coin.symbol || '').toUpperCase().trim();
    if (!symbol) continue;

    if (!symbolMap.has(symbol)) {
      symbolMap.set(symbol, []);
    }
    symbolMap.get(symbol)?.push(coin);
  }

  // Create final map with highest market cap coin for each symbol
  const finalMap = new Map<string, ScreenerCoinData>();

  for (const [symbol, coins] of symbolMap.entries()) {
    if (coins.length === 1) {
      finalMap.set(symbol, coins[0]);
    } else {
      // Multiple coins with same symbol - prefer highest market cap
      const sortedCoins = coins.sort((a, b) => {
        const marketCapA =
          typeof a.marketCap === 'number'
            ? a.marketCap
            : parseFloat(String(a.marketCap)) || 0;
        const marketCapB =
          typeof b.marketCap === 'number'
            ? b.marketCap
            : parseFloat(String(b.marketCap)) || 0;
        return marketCapB - marketCapA; // Descending order
      });

      finalMap.set(symbol, sortedCoins[0]);

      if (import.meta.env.DEV) {
        logger.info(
          `[portfolioScreenerMatching] Multiple coins found for symbol ${symbol}:`,
          {
            selected: {
              name: sortedCoins[0].name,
              marketCap: sortedCoins[0].marketCap,
            },
            alternatives: sortedCoins
              .slice(1)
              .map((c) => ({ name: c.name, marketCap: c.marketCap })),
          }
        );
      }
    }
  }

  return finalMap;
};

/**
 * Finds the best matching screener coin for a given asset symbol
 * First tries exact match, then tries normalized symbol
 * When multiple matches exist, prefers the one with higher market cap
 */
export const findBestScreenerMatch = (
  assetSymbol: string,
  screenerSymbolMap: Map<string, ScreenerCoinData>
): ScreenerCoinData | null => {
  if (!assetSymbol) return null;

  const upperSymbol = assetSymbol.toUpperCase().trim();

  // Try exact match first
  let match = screenerSymbolMap.get(upperSymbol);
  if (match) return match;

  // Try normalized symbol
  const normalizedSymbol = normalizeAssetToSymbol(upperSymbol);
  match = screenerSymbolMap.get(normalizedSymbol);
  if (match) return match;

  return null;
};

/**
 * Finds the best matching portfolio asset for a given screener symbol
 * Handles case-insensitive matching
 */
export const findPortfolioAssetBySymbol = <
  T extends { name?: string | unknown },
>(
  symbol: string,
  portfolioAssets: T[]
): T | null => {
  if (!symbol || !portfolioAssets?.length) return null;

  const upperSymbol = symbol.toUpperCase().trim();

  return (
    portfolioAssets.find((asset) => {
      const assetName = (asset.name || '').toString().toUpperCase().trim();
      return assetName === upperSymbol;
    }) || null
  );
};

/**
 * Helper function to parse volume strings with units (B, T, M) to absolute numbers
 */
export const parseVolumeString = (volumeStr: string | number): number => {
  if (typeof volumeStr === 'number') {
    return volumeStr;
  }

  if (!volumeStr || typeof volumeStr !== 'string') {
    return 0;
  }

  const str = volumeStr.toString().trim().toUpperCase();
  const match = str.match(/^([\d.,]+)([BTM]?)$/);

  if (!match) {
    // Try to parse as a direct number
    const num = parseFloat(str.replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
  }

  const [, numStr, unit] = match;
  const baseNumber = parseFloat(numStr.replace(/,/g, ''));

  if (isNaN(baseNumber)) {
    return 0;
  }

  switch (unit) {
    case 'T': // Trillion
      return baseNumber * 1e12;
    case 'B': // Billion
      return baseNumber * 1e9;
    case 'M': // Million
      return baseNumber * 1e6;
    default:
      return baseNumber;
  }
};
