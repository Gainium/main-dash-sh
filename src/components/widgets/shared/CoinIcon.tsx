import type { AssetClass } from '@/hooks/useTradingPairs';
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
   * `bybitLinear`). Only used for stock/etf rows: it gates the *upper-case*
   * tokenized-stock wrapper strips (Bitget reality `RAAPL`, Bybit-spot xstock
   * `AAPLX`) so a clean ticker that legitimately starts with R / ends in X
   * (`RBLX`, `NFLX`) on another venue isn't mangled. Optional — absent => only
   * the unambiguous lower-case wrappers strip. See `normalizeStockTicker`.
   */
  exchange?: string;
}

/**
 * Canonical equity-ticker normalization for the stock-icon URL — MUST stay in
 * lock-step with the backend `normalizeStockTicker` (main-app
 * `core/src/utils/assetClass.ts`). Lower-case wrappers (`rTSLA`/`AAPLx`/
 * `AAPLon`) are unambiguous and strip on any venue; upper-case wrappers
 * (`RAAPL`/`AAPLX`) collide with clean tickers (`NFLX`/`RBLX`) so they strip
 * only on the venue that mints them — Bitget reality (`R`-prefix, any bitget
 * market) and Bybit *spot* xstocks (`X`-suffix, exchange `bybit`; the clean
 * perps live on `bybitLinear`). `exchange` absent => only the safe lower-case
 * strips apply.
 */
const normalizeStockTicker = (symbol: string, exchange?: string): string => {
  const s = symbol || '';
  const reality = s.match(/^r([A-Za-z][A-Za-z0-9]+)$/); // rTSLA → TSLA
  if (reality) return reality[1].toUpperCase();
  if (/^[A-Za-z0-9]+on$/.test(s)) return s.slice(0, -2).toUpperCase(); // AAPLon → AAPL
  if (/^[A-Za-z0-9]+x$/.test(s)) return s.slice(0, -1).toUpperCase(); // AAPLx → AAPL
  const upper = s.toUpperCase();
  // Normalize the venue: lower-case and drop the `paper` prefix so paper twins
  // (paperBitget / paperBybit / paperBybitLinear …) gate like their real
  // counterparts — the local/paper stack lists these tokenized stocks too.
  const venue = (exchange ?? '').toLowerCase().replace(/^paper/, '');
  if (venue.startsWith('bitget') && /^R[A-Z][A-Z0-9]+$/.test(upper)) {
    return upper.slice(1); // Bitget reality RAAPL → AAPL
  }
  // Upper-case `X` xstock suffix: strip only where the venue's stock listings
  // are exclusively tokenized — Bybit SPOT (`bybit`; clean NFLX is on
  // bybitLinear) and Kraken (any market; Kraken has no clean equity perps).
  if (
    (venue === 'bybit' || venue.startsWith('kraken')) &&
    /^[A-Z0-9]+X$/.test(upper)
  ) {
    return upper.slice(0, -1); // xstock AAPLX → AAPL
  }
  return upper;
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

const CoinIcon: React.FC<CoinIconProps> = ({
  symbol,
  size = 'md',
  isQuote = false,
  className = '',
  assetClass,
  exchange,
}) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  // Prefetch image with fallback logic
  useEffect(() => {
    if (!symbol) {
      setIsLoading(false);
      return;
    }

    // Guard against a stale async load winning: when `symbol` changes fast
    // (e.g. a hedge short leg mounts as long then flips to short, or a
    // base/quote toggle), the previous symbol's image load can resolve after
    // the new one and overwrite the src with the wrong coin. Ignore resolved
    // loads once this effect has been cleaned up.
    let cancelled = false;

    setIsLoading(true);
    setImageSrc(null);

    // Fiat currencies use locally-shipped SVG icons — no remote lookup needed.
    if (FIAT_ICONS.has(symbol.toUpperCase())) {
      setImageSrc(`/images/fiat/${symbol.toLowerCase()}.svg`);
      setIsLoading(false);
      return;
    }

    // Non-crypto asset classes resolve to a local SVG badge under
    // /images/{assetClass}/{symbol}.svg. A missing file degrades to the text
    // fallback via the rendered <img>'s onError handler below.
    if (assetClass && LOCAL_SVG_CLASSES.has(assetClass)) {
      setImageSrc(`/images/${assetClass}/${symbol.toUpperCase()}.svg`);
      setIsLoading(false);
      return;
    }

    const primaryPath = `https://app.gainium.io/coins/${symbol.toLowerCase()}.png`;
    const fallbackPath = symbol.toLowerCase().startsWith('u')
      ? `https://app.gainium.io/coins/${symbol.toLowerCase().substring(1)}.png`
      : null;
    const defaultImagePath = '/images/coins/not-exist.jpeg';

    // Try image and compare with default
    const tryImage = (src: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        const defaultImg = new Image();

        let imgLoaded = false;
        let defaultLoaded = false;

        const checkCompletion = () => {
          if (imgLoaded && defaultLoaded) {
            // Compare images by dimensions - if they match the default, it's likely the placeholder
            if (
              img.naturalWidth === defaultImg.naturalWidth &&
              img.naturalHeight === defaultImg.naturalHeight
            ) {
              reject(); // Same dimensions as default, treat as not found
            } else {
              resolve(src); // Different dimensions, real image
            }
          }
        };

        img.onload = () => {
          imgLoaded = true;
          checkCompletion();
        };

        img.onerror = () => reject();

        defaultImg.onload = () => {
          defaultLoaded = true;
          checkCompletion();
        };

        defaultImg.onerror = () => {
          // If default image fails to load, just accept the original image
          imgLoaded = true;
          defaultLoaded = true;
          resolve(src);
        };

        img.src = src;
        defaultImg.src = defaultImagePath;
      });
    };

    // Stocks / ETFs: NEVER the CoinGecko coin host (that gives false-positive
    // icons for same-named crypto). Resolve from OUR backend's self-hosted icon
    // library (`/icons/stock/{TICKER}.png`), which lazily fetches the logo from
    // logo.dev on a cache miss, saves it to disk, and serves it — same
    // "save-then-serve-ourselves" model as crypto coin icons. The frontend
    // never calls logo.dev directly. Missing/unresolvable → text fallback.
    if (assetClass === 'stock' || assetClass === 'etf') {
      // Venue-gated canonical equity-ticker rule (mirrors the backend) — maps a
      // tokenized-stock base (Bitget reality RAAPL, Bybit-spot xstock AAPLX,
      // lower-case AAPLon/AAPLx/rTSLA) to its clean underlying for logo lookup,
      // without mangling a clean ticker like NFLX/RBLX. See normalizeStockTicker.
      const ticker = normalizeStockTicker(symbol, exchange);
      const apiBase = (import.meta.env['VITE_API_ENDPOINT'] as string) || '';
      const stockPath = `${apiBase}/icons/stock/${ticker}.png`;
      tryImage(stockPath)
        .then((src) => {
          if (!cancelled) setImageSrc(src);
        })
        .catch(() => {
          if (!cancelled) setImageSrc(null);
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
      return;
    }

    const loadImage = async () => {
      try {
        // Try primary path
        const src = await tryImage(primaryPath);
        if (!cancelled) setImageSrc(src);
      } catch {
        // Try fallback path if primary fails
        if (fallbackPath) {
          try {
            const src = await tryImage(fallbackPath);
            if (!cancelled) setImageSrc(src);
          } catch {
            // Both failed, will show text fallback
            if (!cancelled) setImageSrc(null);
          }
        } else {
          // No fallback available
          if (!cancelled) setImageSrc(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadImage();

    return () => {
      cancelled = true;
    };
  }, [symbol, assetClass, exchange]);

  // Handle missing symbol
  if (!symbol) {
    return (
      <div
        className={`${sizeClass} rounded-full overflow-hidden flex items-center justify-center ${
          isQuote ? 'relative z-0' : 'relative z-10'
        } ${className} relative bg-muted`}
      >
        <span className="text-muted-foreground text-xs font-medium">?</span>
      </div>
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full overflow-hidden flex items-center justify-center ${
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
          onError={() => setImageSrc(null)}
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
