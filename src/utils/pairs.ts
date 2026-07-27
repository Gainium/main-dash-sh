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

/**
 * Comparison key for a pair: separators stripped, upper-cased. This is what
 * `pairMetadata` is keyed by and what de-duplication compares — never what we
 * send to an exchange. Re-exported by the two `basic-settings` modules as
 * `normalizePairKey`, which is the name every call site already uses.
 */
export const normalizePairKey = (pair: string): string =>
  pair.replace(/[\s/_-]/gu, '').toUpperCase();

/** Minimal shape of a loaded trading pair needed to resolve its identity. */
export interface PairIdentitySource {
  pair?: string | null;
  baseAsset?: { name?: string | null } | null;
  quoteAsset?: { name?: string | null } | null;
}

/**
 * True when a pair's exchange-native symbol can be rebuilt from its base and
 * quote assets — i.e. the symbol carries no component beyond `base + quote`.
 *
 * The bot form has always identified a pair as `BASE-QUOTE` and stored it with
 * the separator stripped (`BASEQUOTE`). That round trip is lossless for spot
 * and perpetual-with-plain-symbol markets, but NOT for contract markets whose
 * native symbol carries an extra component that appears in neither asset:
 *
 *   binanceCoinm  BTCUSD_PERP      BTC / USD   → rebuilt "BTCUSD"
 *   binanceUsdm   BTCUSDT_260925   BTC / USDT  → rebuilt "BTCUSDT"
 *   bybitLinear   BTCUSDT-25SEP26  BTC / USDT  → rebuilt "BTCUSDT"
 *   bybitLinear   BTCPERP          BTC / USDC  → rebuilt "BTCUSDC"
 *   bybitInverse  BTCUSDU26        BTC / USD   → rebuilt "BTCUSD"
 *   kucoinInverse BTCMU26          BTC / USD   → rebuilt "BTCUSD"
 *   okx (EU)      BTC-USD_UM_XPERP BTC / USD   → rebuilt "BTCUSD"
 *
 * For those the rebuilt symbol is either rejected by the candle API ("Invalid
 * symbol" on binanceCoinm, "Symbol Is Invalid" on bybitLinear) or — worse —
 * silently resolves to a DIFFERENT instrument: the perpetual instead of the
 * dated future, which quotes a different price. So the native symbol is the
 * only usable identity, and this predicate is the one place that decides it.
 *
 * Deliberately NOT an `includes('_')` check: `BTCPERP` and `BTCUSDU26` carry no
 * separator at all, and `BTCUSDT-25SEP26` carries a dash, yet all three are
 * just as unreconstructable.
 */
export const isPairSymbolReconstructable = (
  nativeSymbol?: string | null,
  baseAsset?: string | null,
  quoteAsset?: string | null
): boolean => {
  if (!nativeSymbol || !baseAsset || !quoteAsset) {
    return false;
  }
  return (
    normalizePairKey(nativeSymbol) ===
    normalizePairKey(`${baseAsset}${quoteAsset}`)
  );
};

/**
 * The identity the bot form shows in the pair picker and stores in
 * `formData.pair`. Reconstructable pairs keep the historical dashed selection
 * symbol; everything else is identified by its exchange-native symbol, which
 * also stops same-`BASE-QUOTE` contracts (perpetual + every dated expiry) from
 * collapsing onto one another in the picker.
 */
export const resolvePairSelectionSymbol = (
  nativeSymbol: string,
  baseAsset?: string | null,
  quoteAsset?: string | null
): string =>
  isPairSymbolReconstructable(nativeSymbol, baseAsset, quoteAsset)
    ? `${baseAsset}-${quoteAsset}`
    : nativeSymbol;

/**
 * The value to write into `formData.pair` for a picked or typed symbol.
 *
 * Reconstructable pairs — and anything we have no metadata for, e.g. free text
 * the user pasted — keep today's separator-stripped form, so every pair that
 * works right now is stored byte-identically. A pair whose native symbol can't
 * be rebuilt from its assets is stored verbatim instead: stripping its
 * separators (`BTCUSD_PERP` → `BTCUSDPERP`) yields a symbol no exchange knows,
 * and main-app forwards `settings.pair` to the exchange unchanged.
 */
export const resolveStoredPairSymbol = (
  symbol: string,
  metadata?: PairIdentitySource | null
): string => {
  const native = metadata?.pair;
  if (
    native &&
    !isPairSymbolReconstructable(
      native,
      metadata?.baseAsset?.name,
      metadata?.quoteAsset?.name
    )
  ) {
    // Verbatim, not upper-cased: tokenized-stock bases keep a lower-case `x`
    // (see `isTokenizedStockPair`) and the venues are case-sensitive on it.
    return native.trim();
  }
  return normalizePairKey(symbol);
};

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
