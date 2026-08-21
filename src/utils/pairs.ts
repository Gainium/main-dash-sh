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
  // Stablecoins that are real quote assets on venues we support. They matter
  // because `extractPairAssets` is the splitter behind `toExchangeCandleSymbol`,
  // and that function now dashes by default for every exchange that is not
  // explicitly compact-native — so a quote missing from this list means the
  // concatenated symbol is handed to a dashed venue unconverted (the bug #153
  // failure shape).
  //
  // ⚠️ Only 4-char quotes whose tail is NOT itself a listed quote are safe to
  // add. `RLUSD` and `FDUSD` were tried and REVERTED: they end in `USD`, so
  // longest-first matching mis-split real listed pairs — prod holds
  // `KRL-USD`@coinbase, `PRL-USD`@coinbase, `MERL-USD`@kraken/okx and
  // `UFD-USD`@kraken, whose stored compact forms (`KRLUSD`, `MERLUSD`, …)
  // became `K-RLUSD` / `ME-RLUSD` — worse than not converting at all. (RLUSD
  // as a quote exists only on one Kraken pair; FDUSD only on compact venues
  // where the splitter never runs — so dropping them costs nothing.)
  //
  // `USDE` is deliberately UPPERCASE despite Ethena branding it "USDe": the
  // pairs collection, the venues' instrument ids and the archive keys all
  // store `USDE`, and downstream lookups are case-sensitive.
  'USDH',
  'USDE',
  'USDS',
  'USDG',
] as const;

// Suffix matching must try the LONGEST quote first, otherwise a short entry
// shadows a longer one that shares its tail: `ETHFDUSD` would split as
// `ETHFD`/`USD` because `USD` is checked before `FDUSD`, and `BTCUSDH` would
// split as… nothing at all before `USDH` existed. Sorting is done here rather
// than by reordering `COMMON_QUOTE_ASSETS` because that constant is also used
// (in `utils/tradingView/factory.ts`) to generate symbol-search suggestions,
// where the declared order is the presentation order.
const QUOTE_ASSETS_LONGEST_FIRST: readonly string[] = [
  ...COMMON_QUOTE_ASSETS,
].sort((a, b) => b.length - a.length);

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
 * Strip the builder-dex prefix from a base asset, leaving the clean underlying.
 *
 * Hyperliquid HIP-3 markets are minted by a builder dex whose id prefixes the
 * base — `xyz:SP500`, `flx:NVDA`, `para:AVGO`. The prefix identifies the venue
 * that listed the market, not the asset, so it is noise wherever the ASSET is
 * what matters: icon lookup (`/images/index/SP500.svg`) and the short unit
 * label next to an amount field. A colon only ever appears in these bases.
 *
 * Do NOT use this to build anything sent to an exchange or used as a pair key —
 * the prefix is part of the market's identity there, and two dexes can list the
 * same underlying.
 */
export const stripDexPrefix = (symbol: string): string => {
  const s = symbol || '';
  return s.includes(':') ? s.slice(s.indexOf(':') + 1) : s;
};

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
    // OKX X-Perp pairs carry a contract-family suffix after the quote asset
    // (`BTC-USD_UM_XPERP`) — strip it here so display/icon lookups get a real
    // asset, not `USD_UM_XPERP`. The `USD` in the instId is OKX's unified-
    // margin label; the pair is USDC-quoted (that's what the connector/pairs
    // collection say and what EU accounts hold), so report USDC here too so
    // this fallback agrees with pair metadata. The full literal string (with
    // suffix) is still what's sent to the exchange API; callers use `pair`
    // directly for that, not this reconstruction.
    const isXperp = /_UM_XPERP$/i.test(symbol);
    const quotePart = (parts[1] || '').split('_')[0];
    return {
      baseAsset: parts[0],
      quoteAsset: isXperp && quotePart.toUpperCase() === 'USD' ? 'USDC' : quotePart,
    };
  }

  const upperSymbol = symbol.toUpperCase();

  for (const quote of QUOTE_ASSETS_LONGEST_FIRST) {
    if (
      upperSymbol.endsWith(quote.toUpperCase()) &&
      symbol.length > quote.length
    ) {
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
