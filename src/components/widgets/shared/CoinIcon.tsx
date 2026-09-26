import type { AssetClass } from '@/hooks/useTradingPairs';
import {
  useTradingPairsDataStore,
  type TradingPair,
} from '@/stores/tradingPairsDataStore';
// Hyperliquid HIP-3 builder-dex bases carry a `dex:` prefix (`xyz:AAPL`), which
// is stripped so the clean underlying drives icon resolution.
import { stripDexPrefix } from '@/utils/pairs';
import React, { useState, useEffect } from 'react';

export interface CoinIconProps {
  symbol: string;
  size?: 'sm' | 'md' | 'lg' | string;
  isQuote?: boolean;
  className?: string;
  /**
   * Normalized asset class for the symbol. Defaults to crypto behavior when
   * omitted, so existing callers are unaffected.
   *  - crypto / undefined → remote coins host (existing behavior + fallbacks)
   *  - stock / etf        → remote stock-icon host, ticker uppercased w/ the
   *                         tokenized wrapper stripped (AAPLon/AAPLx → AAPL)
   *  - commodity/metal/forex/index → local /images/{class}/{symbol}.svg
   */
  assetClass?: AssetClass;
  /**
   * The pair's `exchange` (an `ExchangeEnum` value, e.g. `bitget`, `bybit`,
   * `bybitLinear`). Only used for stock/etf rows: it finds the pair's
   * `underlying` in the pairs store (Bitget Reality `rT` → `T`) and gates the
   * *upper-case* xstock `X`-suffix strip (Bybit spot, Kraken) so a clean
   * ticker ending in X (`NFLX`) on another venue isn't mangled. Optional —
   * absent => only the unambiguous lower-case wrappers strip. See
   * `normalizeStockTicker`.
   */
  exchange?: string;
}

/**
 * Canonical equity-ticker normalization for the stock-icon URL — MUST stay in
 * lock-step with the backend `normalizeStockTicker` (main-app
 * `core/src/utils/assetClass.ts`). The pair's `underlying` wins: the backend
 * sets it from the exchange's own wrapper flag (Bitget Reality `rT` → `T`) or
 * a hand-checked map. Otherwise lower-case wrappers (`rTSLA`/`AAPLx`/
 * `AAPLon`) strip on any venue; the upper-case `X` suffix collides with clean
 * tickers (`NFLX`) so it strips only on the venues that mint it — Bybit *spot*
 * xstocks (exchange `bybit`; the clean perps live on `bybitLinear`) and
 * Kraken. Bitget is never handled by shape: its stock perps are clean tickers,
 * some starting with R (`RDDT`).
 */
const normalizeStockTicker = (
  symbol: string,
  exchange?: string,
  underlying?: string
): string => {
  if (underlying) return underlying.toUpperCase();
  const s = stripDexPrefix(symbol || '');
  // Normalize the venue: lower-case and drop the `paper` prefix so paper twins
  // (paperBitget / paperBybit / paperBybitLinear …) gate like their real
  // counterparts — the local/paper stack lists these tokenized stocks too.
  const venue = (exchange ?? '').toLowerCase().replace(/^paper/, '');
  // Kraken decorates a tokenized-equity BALANCE/ledger code with a trailing
  // `.T` (`PGx.T`) that never appears on the tradeable pair base (`PGx`). Strip
  // it first (Kraken-gated) so the wrapper rules below see the clean base and
  // resolve `PGx.T` → `PG`. Mirrors backend `normalizeStockTicker`.
  const ledgerStripped = venue.startsWith('kraken')
    ? s.replace(/\.T$/i, '')
    : s;
  const reality = ledgerStripped.match(/^r([A-Za-z][A-Za-z0-9]+)$/); // rTSLA → TSLA
  if (reality) return reality[1].toUpperCase();
  if (/^[A-Za-z0-9]+on$/.test(ledgerStripped))
    return ledgerStripped.slice(0, -2).toUpperCase(); // AAPLon → AAPL
  if (/^[A-Za-z0-9.]+x$/.test(ledgerStripped))
    return ledgerStripped.slice(0, -1).toUpperCase(); // AAPLx → AAPL, BRK.Bx → BRK.B
  const upper = ledgerStripped.toUpperCase();
  // Upper-case `X` xstock suffix: strip only where the venue's stock listings
  // are exclusively tokenized — Bybit SPOT (`bybit`; clean NFLX is on
  // bybitLinear) and Kraken (any market; Kraken has no clean equity perps).
  if (
    (venue === 'bybit' || venue.startsWith('kraken')) &&
    /^[A-Z0-9.]+X$/.test(upper)
  ) {
    return upper.slice(0, -1); // xstock AAPLX → AAPL
  }
  return upper;
};

// base name → `underlying`, per exchange's pair map. Built once per pairs
// refresh (the store replaces each exchange's map object on `setPairs`), so an
// icon list of thousands of rows does not scan the pairs once per row. Keyed
// upper-case: callers pass the base as listed (`rT`) or upper-cased (`RT`).
const underlyingIndex = new WeakMap<
  Record<string, TradingPair>,
  Map<string, string>
>();
const lookupUnderlying = (
  pairs: Record<string, TradingPair> | undefined,
  base: string
): string | undefined => {
  if (!pairs) return undefined;
  let index = underlyingIndex.get(pairs);
  if (!index) {
    index = new Map();
    for (const p of Object.values(pairs)) {
      if (p.underlying) {
        index.set(p.baseAsset.name.toUpperCase(), p.underlying);
      }
    }
    underlyingIndex.set(pairs, index);
  }
  return index.get(base.toUpperCase());
};

// Asset classes that resolve to a locally-shipped SVG badge under
// /images/{assetClass}/{symbol}.svg (mirrors the fiat-SVG branch).
const LOCAL_SVG_CLASSES = new Set<AssetClass>([
  'commodity',
  'metal',
  'forex',
  'index',
]);

// Fiat quote currencies don't have coin logos on the remote icon host, so we
// ship local SVG icons for them under /images/fiat/<code>.svg.
const FIAT_ICONS = new Set([
  'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'AUD', 'CAD', 'CHF', 'HKD', 'SGD',
  'NZD', 'TRY', 'BRL', 'RUB', 'INR', 'KRW', 'ZAR', 'MXN', 'PLN', 'SEK',
  'NOK', 'DKK', 'AED', 'SAR', 'UAH', 'NGN', 'IDR', 'THB', 'PHP', 'ARS',
]);

// Explicit icon reuse/aliases for non-crypto bases (keyed by dex-stripped,
// upper-cased base). FX perps reuse the fiat currency badges (shipped in BOTH
// editions). Oil variants share one glyph. Everything else resolves by the
// per-symbol `/images/{class}/{SYMBOL}.svg` convention.
const CURATED_ASSET_ICON: Record<string, string> = {
  // forex → fiat badges
  EUR: '/images/fiat/eur.svg',
  GBP: '/images/fiat/gbp.svg',
  JPY: '/images/fiat/jpy.svg',
  DXY: '/images/fiat/usd.svg',
  // commodity oil aliases → shared glyph
  CL: '/images/commodity/OIL.svg',
  BZ: '/images/commodity/OIL.svg', // Brent crude (Binance `BZUSDT`)
  BRENTOIL: '/images/commodity/OIL.svg',
  WTI: '/images/commodity/OIL.svg',
  BRENT: '/images/commodity/OIL.svg',
  // precious-metal tickers → the metal glyphs we already ship. Binance
  // classifies these as `commodity` and uses the XAU/XAG/XPT/XPD symbols, so
  // map them onto the named badges (GOLD/SILVER/PLATINUM/PALLADIUM.svg) rather
  // than letting them fall to the generic commodity glyph.
  XAU: '/images/commodity/GOLD.svg',
  XAG: '/images/commodity/SILVER.svg',
  XPT: '/images/commodity/PLATINUM.svg',
  XPD: '/images/commodity/PALLADIUM.svg',
};

// Generic per-class glyph so an unmapped non-crypto symbol still shows a class
// badge instead of a bare letter.
const CLASS_FALLBACK_ICON: Partial<Record<AssetClass, string>> = {
  commodity: '/images/commodity/_commodity.svg',
  metal: '/images/commodity/_commodity.svg',
  forex: '/images/fiat/usd.svg',
  index: '/images/index/_index.svg',
};


// ---------------------------------------------------------------------------
// Session-wide icon resolution cache (see CoinIcon).

const DEFAULT_IMAGE_PATH = '/images/coins/not-exist.jpeg';

/** Resolved `src` per icon key; `null` = no icon (letter fallback). */
const resolvedIconCache = new Map<string, string | null>();
const inflightIconLookups = new Map<string, Promise<string | null>>();

const iconCacheKey = (
  symbol: string | undefined,
  assetClass: AssetClass | undefined,
  exchange: string | undefined,
  underlying: string | undefined
) => {
  // Crypto (the default class) resolves from the symbol alone, so key it by
  // the symbol alone: callers fill `assetClass` / `exchange` in once the pair
  // list has loaded, and a key that changed with them re-probed the icon and
  // flashed the "..." placeholder for every coin on screen.
  if (!assetClass || assetClass === 'crypto') return `${symbol ?? ''}|crypto`;
  return `${symbol ?? ''}|${assetClass}|${exchange ?? ''}|${underlying ?? ''}`;
};

const resolveIconCached = (
  key: string,
  resolve: () => Promise<string | null>
): Promise<string | null> => {
  const known = resolvedIconCache.get(key);
  if (known !== undefined) return Promise.resolve(known);
  const pending = inflightIconLookups.get(key);
  if (pending) return pending;
  const lookup = resolve()
    .catch(() => null)
    .then((src) => {
      resolvedIconCache.set(key, src);
      inflightIconLookups.delete(key);
      return src;
    });
  inflightIconLookups.set(key, lookup);
  return lookup;
};

/** Mark a resolved src as unusable (the <img> failed to render it). */
const forgetIconSrc = (key: string) => {
  resolvedIconCache.set(key, null);
};

// The coin host answers an unknown coin with a placeholder image; a real logo
// is told apart by its dimensions. The placeholder is loaded ONCE per session
// (it used to be loaded again next to every single probe).
let placeholderDims: Promise<{ w: number; h: number } | null> | null = null;
const getPlaceholderDims = () => {
  if (!placeholderDims) {
    placeholderDims = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = DEFAULT_IMAGE_PATH;
    });
  }
  return placeholderDims;
};

// Try image and compare with the placeholder.
const tryImage = (src: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      void getPlaceholderDims().then((dims) => {
        // If the placeholder itself failed to load, accept the image.
        if (!dims) {
          resolve(src);
          return;
        }
        if (img.naturalWidth === dims.w && img.naturalHeight === dims.h) {
          reject(new Error('placeholder')); // Same dimensions: not found
        } else {
          resolve(src); // Different dimensions: real image
        }
      });
    };
    img.onerror = () => reject(new Error('load'));
    img.src = src;
  });

const probeLocal = (src: string): Promise<boolean> =>
  src.includes('/coins/')
    ? tryImage(src).then(
        () => true,
        () => false
      )
    : new Promise((res) => {
        const im = new Image();
        im.onload = () => res(true);
        im.onerror = () => res(false);
        im.src = src;
      });

/** Where the icon for this symbol lives, or null (letter fallback). */
const resolveIconSrc = async (
  symbol: string,
  assetClass: AssetClass | undefined,
  exchange: string | undefined,
  underlying: string | undefined
): Promise<string | null> => {
  // Fiat currencies use locally-shipped SVG icons — no remote lookup needed.
  if (FIAT_ICONS.has(symbol.toUpperCase())) {
    return `/images/fiat/${symbol.toLowerCase()}.svg`;
  }

  // Commodity / metal / forex / index resolve to a locally-shipped SVG badge.
  // Candidates are tried in order, first that loads wins:
  //   1. an explicit reuse/alias (FX → fiat badge, oil variants → one glyph),
  //   2. the per-symbol curated badge `/images/{class}/{SYMBOL}.svg`,
  //   3. the crypto coin host — for crypto-native tokens classed non-crypto
  //      (gold-backed PAXG / XAUT metal), which have a real coin logo,
  //   4. a generic per-class glyph, so we never fall to a bare letter.
  // The dex prefix (`xyz:GOLD`) is stripped so the clean code drives lookup.
  if (assetClass && LOCAL_SVG_CLASSES.has(assetClass)) {
    const clean = stripDexPrefix(symbol).toUpperCase();
    const candidates = [
      CURATED_ASSET_ICON[clean],
      `/images/${assetClass}/${clean}.svg`,
      `https://app.gainium.io/coins/${clean.toLowerCase()}.png`,
      CLASS_FALLBACK_ICON[assetClass],
    ].filter((c, i, a): c is string => !!c && a.indexOf(c) === i);
    for (const src of candidates) {
      if (await probeLocal(src)) return src;
    }
    return null;
  }

  // Stocks / ETFs: NEVER the CoinGecko coin host (that gives false-positive
  // icons for same-named crypto). Resolve from OUR backend's self-hosted icon
  // library (`/icons/stock/{TICKER}.png`), which lazily fetches the logo from
  // logo.dev on a cache miss, saves it to disk, and serves it — same
  // "save-then-serve-ourselves" model as crypto coin icons. The frontend
  // never calls logo.dev directly. Missing/unresolvable → text fallback.
  if (assetClass === 'stock' || assetClass === 'etf') {
    // The pair's `underlying` (Bitget Reality rT → T) wins; otherwise the
    // venue-gated rule (mirrors the backend) maps a tokenized-stock base
    // (Bybit-spot xstock AAPLX, lower-case AAPLon/AAPLx/rTSLA) to its clean
    // ticker without mangling NFLX/RDDT. See normalizeStockTicker.
    const ticker = normalizeStockTicker(symbol, exchange, underlying);
    const apiBase = (import.meta.env['VITE_API_ENDPOINT'] as string) || '';
    try {
      return await tryImage(`${apiBase}/icons/stock/${ticker}.png`);
    } catch {
      return null;
    }
  }

  const primaryPath = `https://app.gainium.io/coins/${symbol.toLowerCase()}.png`;
  const fallbackPath = symbol.toLowerCase().startsWith('u')
    ? `https://app.gainium.io/coins/${symbol.toLowerCase().substring(1)}.png`
    : null;
  try {
    // Try primary path
    return await tryImage(primaryPath);
  } catch {
    // Try fallback path if primary fails
    if (fallbackPath) {
      try {
        return await tryImage(fallbackPath);
      } catch {
        // Both failed, will show text fallback
        return null;
      }
    }
    return null;
  }
};

const CoinIcon: React.FC<CoinIconProps> = ({
  symbol,
  size = 'md',
  isQuote = false,
  className = '',
  assetClass,
  exchange,
}) => {
  const isStock = assetClass === 'stock' || assetClass === 'etf';
  const exchangePairs = useTradingPairsDataStore((s) =>
    isStock && exchange ? s.pairsByProvider[exchange] : undefined
  );
  const underlying = isStock
    ? lookupUnderlying(exchangePairs, symbol || '')
    : undefined;

  // Size configurations
  const sizeClasses = {
    sm: 'w-5 h-5',
    md: 'w-7 h-7',
    lg: 'w-9 h-9',
  };

  // Use predefined size or custom size string
  const sizeClass =
    typeof size === 'string' && sizeClasses[size as keyof typeof sizeClasses]
      ? sizeClasses[size as keyof typeof sizeClasses]
      : size;

  // Resolve the icon once per (symbol, class, venue) for the whole session:
  // the pair picker mounts hundreds of rows that share base/quote coins, and
  // every row used to probe the coin host again (plus the placeholder image)
  // on every open.
  const iconKey = iconCacheKey(symbol, assetClass, exchange, underlying);
  const [resolved, setResolved] = useState<{
    key: string;
    src: string | null;
  } | null>(null);
  // A cache hit renders synchronously — on mount and whenever the key changes
  // — so a known coin never shows the "..." placeholder, not even for a frame.
  const cachedSrc = symbol ? resolvedIconCache.get(iconKey) : undefined;
  const imageSrc =
    cachedSrc !== undefined
      ? cachedSrc
      : resolved?.key === iconKey
        ? resolved.src
        : null;
  const isLoading =
    Boolean(symbol) && cachedSrc === undefined && resolved?.key !== iconKey;
  const setImageSrc = (src: string | null) => setResolved({ key: iconKey, src });

  useEffect(() => {
    if (!symbol || resolvedIconCache.has(iconKey)) {
      return;
    }

    // Guard against a stale async load winning: when `symbol` changes fast
    // (e.g. a hedge short leg mounts as long then flips to short, or a
    // base/quote toggle), the previous symbol's image load can resolve after
    // the new one and overwrite the src with the wrong coin. Ignore resolved
    // loads once this effect has been cleaned up.
    let cancelled = false;

    void resolveIconCached(iconKey, () =>
      resolveIconSrc(symbol, assetClass, exchange, underlying)
    ).then((src) => {
      if (!cancelled) {
        setResolved({ key: iconKey, src });
      }
    });

    return () => {
      cancelled = true;
    };
    // `iconKey` is derived from the other inputs; for crypto it deliberately
    // ignores exchange / underlying, so a change there must not re-probe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iconKey]);

  // Handle missing symbol
  if (!symbol) {
    return (
      <div
        className={`${sizeClass} shrink-0 rounded-full overflow-hidden flex items-center justify-center ${
          isQuote ? 'relative z-0' : 'relative z-10'
        } ${className} relative bg-muted`}
      >
        <span className="text-muted-foreground text-xs font-medium">?</span>
      </div>
    );
  }

  return (
    <div
      className={`${sizeClass} shrink-0 rounded-full overflow-hidden flex items-center justify-center ${
        isQuote ? 'relative z-0' : 'relative z-10'
      } ${className} relative ${imageSrc ? 'bg-background' : 'bg-muted'}`}
      style={{
        backgroundColor: imageSrc ? 'white' : undefined,
      }}
    >
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 100 100"
        style={{ zIndex: 2 }}
        aria-hidden="true"
      >
        <circle
          cx="50"
          cy="50"
          r="48"
          fill="none"
          stroke="var(--color-muted-foreground)"
          strokeWidth="8"
        />
      </svg>

      {isLoading ? (
        <span className="text-muted-foreground text-xs font-medium">...</span>
      ) : imageSrc ? (
        <img
          src={imageSrc}
          alt={symbol}
          className="w-full h-full object-cover"
          // Locally-resolved SVGs (fiat + non-crypto asset classes) are set
          // without a pre-load check; if the file is missing, degrade to the
          // letter fallback instead of showing a broken image.
          onError={() => {
            forgetIconSrc(iconKey);
            setImageSrc(null);
          }}
        />
      ) : (
        <span className="text-muted-foreground text-xs font-medium">
          {symbol?.charAt(0) || '?'}
        </span>
      )}
    </div>
  );
};

export default CoinIcon;
