import React, { useState, useEffect } from 'react';

export interface CoinIconProps {
  symbol: string;
  size?: 'sm' | 'md' | 'lg' | string;
  isQuote?: boolean;
  className?: string;
}

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
  }, [symbol]);

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
