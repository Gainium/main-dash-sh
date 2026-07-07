export const COMMON_QUOTE_ASSETS = [
  'USDT',
  'USDC',
  'BUSD',
  'TUSD',
  'DAI',
  'PAX',
  'USDP',
  'BTC',
  'ETH',
  'BNB',
  'USD',
  'EUR',
  'TRY',
  'BRL',
  'AUD',
  'CAD',
  'GBP',
  'JPY',
] as const;

/**
 * True when a pair carries a tokenized-stock ("xStock") wrapper on its base —
 * a lowercase `x` right after the upper-case ticker, e.g. `AAPLx-USD`,
 * `PGxUSD`, `BRK.Bx-USD`. Kraken/Bybit keep that `x` lowercase and their
 * candle/WS endpoints are case-sensitive on it, so callers must NOT uppercase
 * these pairs (the same reason `:`-prefixed HIP-3 pairs are left as-is).
 */
export const isTokenizedStockPair = (pair: string): boolean =>
  /[A-Z]x(?:[-/]|USD|USDT|USDC|EUR|GBP|$)/.test(pair || '');

/**
 * Map an exchange **balance/ledger** asset code to its tradeable **pair base**
 * (`baseAsset.name` on the loaded trading pairs), so a holding can be looked up
 * via `useResolvePairAsset` for its asset class + display name. Mirrors the
 * backend `balanceAssetToPairBase` (main-app `core/src/utils/assetClass.ts`).
 *
 * Only Kraken decorates the ledger code (trailing `.T` on tokenized equities,
 * `PGx.T` → pair base `PGx`); every other venue's balance asset already equals
 * its pair base (Bybit spot `AAPLX`, Hyperliquid spot alias-normalized). The
 * `.T` strip is unambiguous on a balance code, so it's safe even when the venue
 * is unknown (aggregate rows). Keep the trailing `x` — it's part of Kraken's
 * tokenized display base, not a wrapper.
 */
export const balanceAssetToPairBase = (asset: string): string =>
  (asset || '').replace(/\.T$/i, '');

export const extractPairAssets = (symbol: string) => {
  if (!symbol) return { baseAsset: '', quoteAsset: '' };

  // Handle explicit separators first
  if (symbol.includes('/')) {
    const parts = symbol.split('/');
    return { baseAsset: parts[0], quoteAsset: parts[1] || '' };
  }
  if (symbol.includes('-')) {
    const parts = symbol.split('-');
    return { baseAsset: parts[0], quoteAsset: parts[1] || '' };
  }

  const upperSymbol = symbol.toUpperCase();

  for (const quote of COMMON_QUOTE_ASSETS) {
    if (upperSymbol.endsWith(quote) && symbol.length > quote.length) {
      return {
        baseAsset: symbol.slice(0, -quote.length).replace(/[-_]$/, ''),
        quoteAsset: quote,
      };
    }
  }

  return {
    baseAsset: symbol,
    quoteAsset: '',
  };
};
