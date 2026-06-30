import { extractPairAssets } from '@/utils/pairs';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Badge } from '../../ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';
import { Tooltip } from '../../ui/tooltip';
import CoinIcon from './CoinIcon';

export interface CoinPairProps {
  // Primary method - use separate assets (universal solution)
  baseAsset?: string;
  quoteAsset?: string;
  // Fallback method - parse from pair string (backward compatibility)
  pair?: string;
  // Support multiple symbols (new unified behavior)
  symbols?: string[];
  maxDisplay?: number;
  showQuote?: boolean;
  /**
   * Multi-symbol mode only: makes each rendered pair clickable and fires
   * this with the pair's full symbol string (the matching `symbols[]`
   * entry). Used to switch a chart to the clicked pair. Omit to keep the
   * pairs purely presentational.
   */
  onPairClick?: (symbol: string) => void;

  className?: string;
  iconSize?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  textVariant?: 'symbol' | 'name' | 'both';
  layout?: 'horizontal' | 'vertical' | 'stacked';
  reverseOrder?: boolean;
}

// Known dash characters (ASCII hyphen and common Unicode dashes/minus)
const DASH_CHARS = /[\u002D\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g;
const normalizeDashes = (s = '') => String(s).replace(DASH_CHARS, '-');
const sanitizeSymbol = (value = '') =>
  normalizeDashes(String(value))
    .trim()
    .replace(/^-+|-+$/g, '');

const CoinPair: React.FC<CoinPairProps> = ({
  baseAsset,
  quoteAsset,
  pair,
  symbols = [],
  maxDisplay = 3,
  //showQuote = true,
  className = '',
  iconSize = 'md',
  showText = true,
  //textVariant = 'symbol',
  layout = 'stacked',
  reverseOrder = false,
  onPairClick,
}) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [visiblePairCount, setVisiblePairCount] = useState<number | null>(null);

  // Extract base and quote for single-pair usage
  const getAssetSymbols = useCallback(() => {
    // Method 1: Use separate baseAsset/quoteAsset props (preferred - universal solution)
    if (baseAsset || quoteAsset) {
      const base = sanitizeSymbol(baseAsset || '');
      const quote = sanitizeSymbol(quoteAsset || '');
      return reverseOrder ? { base: quote, quote: base } : { base, quote };
    }

    // Method 2: Parse from pair string (fallback for backward compatibility)
    if (pair) {
      // If already has slash, use it and sanitize trailing/leading dashes
      if (pair.includes('/')) {
        const [rawBase, rawQuote] = pair.split('/');
        const base = sanitizeSymbol(rawBase);
        const quote = sanitizeSymbol(rawQuote);
        return reverseOrder
          ? { base: quote || '', quote: base || '' }
          : { base: base || '', quote: quote || '' };
      }

      // Method 3: For concatenated pairs like "BTCUSDT", try common quote assets
      const { baseAsset: parsedBase, quoteAsset: parsedQuote } =
        extractPairAssets(pair);
      if (parsedQuote) {
        const baseAsset = sanitizeSymbol(parsedBase);
        const quote = sanitizeSymbol(parsedQuote);
        if (baseAsset.length > 0) {
          return reverseOrder
            ? { base: quote, quote: baseAsset }
            : { base: baseAsset, quote };
        }
      }

      // Fallback: treat as single symbol (no quote asset)
      return reverseOrder
        ? { base: '', quote: sanitizeSymbol(pair) }
        : { base: sanitizeSymbol(pair), quote: '' };
    }

    // No data provided
    return { base: '', quote: '' };
  }, [baseAsset, quoteAsset, pair, reverseOrder]);

  const { base, quote } = getAssetSymbols();

  // Multi-symbol mode: when symbols are provided use MultiCoinPair-like rendering
  const multiMode = Array.isArray(symbols) && symbols.length > 0;

  const getBaseAssetsFromSymbols = useCallback(() => {
    if (!symbols || symbols.length === 0) return [];

    return symbols.map((symbol) => {
      const raw = String(symbol || '');
      const { baseAsset } = extractPairAssets(raw);
      return sanitizeSymbol(baseAsset);
    });
  }, [symbols]);

  const baseAssets = useMemo(() => {
    if (multiMode) return getBaseAssetsFromSymbols();
    // If not multiMode, fallback to single base
    return base ? [base] : [];
  }, [multiMode, getBaseAssetsFromSymbols, base]);

  const quoteSymbol = quoteAsset || 'USDT';

  // Icon size configurations - base is bigger and to the left, quote behind
  const iconSizes = {
    sm: { base: 'w-5 h-5', quote: 'w-4 h-4', overlap: '-ml-2' },
    md: { base: 'w-7 h-7', quote: 'w-6 h-6', overlap: '-ml-3' },
    lg: { base: 'w-9 h-9', quote: 'w-8 h-8', overlap: '-ml-4' },
  };

  const sizes = iconSizes[iconSize];

  // Multi-mode display calculations - determine how many pairs fit
  useEffect(() => {
    if (!multiMode || !containerRef.current || !contentRef.current) {
      setVisiblePairCount(null);
      return;
    }

    const checkOverflow = () => {
      if (!containerRef.current || !contentRef.current) return;

      const container = containerRef.current;
      const content = contentRef.current;

      // Get available width
      const containerStyle = getComputedStyle(container);
      const padLeft = parseFloat(containerStyle.paddingLeft || '0');
      const padRight = parseFloat(containerStyle.paddingRight || '0');
      const availableWidth = container.clientWidth - padLeft - padRight;

      // Get all children inside content and prefer those marked as pair elements (we add data attributes to pair wrappers)
      const children = Array.from(content.children) as HTMLElement[];
      const gapStyle = getComputedStyle(content).gap || '0px';
      const gap = parseFloat(gapStyle) || 0;

      // Filter to only pair elements (ignore the +N badge or other non-pair nodes)
      // Access dataset using bracket notation to satisfy TypeScript's index signature rule
      const pairChildren = children.filter(
        (c) => c.dataset?.['pair'] === 'true'
      );
      const measuringChildren =
        pairChildren.length > 0 ? pairChildren : children;

      // Calculate how many pairs fit
      let fittingPairs = 0;
      let accumulatedWidth = 0;

      for (let i = 0; i < measuringChildren.length; i++) {
        const childWidth = measuringChildren[i].offsetWidth;
        const widthWithGap = accumulatedWidth + childWidth + (i > 0 ? gap : 0);

        if (widthWithGap <= availableWidth) {
          fittingPairs++;
          accumulatedWidth = widthWithGap;
        } else {
          break;
        }
      }

      // Reserve space for the +N badge if not all fit
      if (fittingPairs < baseAssets.length) {
        // Estimate badge width (approximately 40px for "+N")
        const badgeWidth = 40;
        // Note: when we measured we ignored the badge element itself, so account for it now
        let widthWithBadge =
          accumulatedWidth + (fittingPairs > 0 ? gap : 0) + badgeWidth;

        // If badge doesn't fit, reduce visible pairs by one until it does
        while (fittingPairs > 0 && widthWithBadge > availableWidth) {
          fittingPairs--;
          if (measuringChildren[fittingPairs]) {
            widthWithBadge -= measuringChildren[fittingPairs].offsetWidth + gap;
          } else {
            widthWithBadge -= badgeWidth + gap;
          }
        }
      }

      // Ensure value is within sensible bounds
      setVisiblePairCount(
        Math.max(1, Math.min(fittingPairs, baseAssets.length))
      );
    };

    // Initial check with delay to ensure DOM is rendered
    const timeoutId = setTimeout(checkOverflow, 50);
    requestAnimationFrame(checkOverflow);

    // Set up ResizeObserver
    const ro = new ResizeObserver(() => {
      setTimeout(checkOverflow, 100);
    });

    if (containerRef.current) ro.observe(containerRef.current);
    if (contentRef.current) ro.observe(contentRef.current);

    window.addEventListener('resize', checkOverflow);

    return () => {
      clearTimeout(timeoutId);
      ro.disconnect();
      window.removeEventListener('resize', checkOverflow);
    };
  }, [multiMode, baseAssets.length]);

  // Calculate display counts based on container measurement
  // Respect parent's maxDisplay: never show more than `maxDisplay` even if measurement says more fit
  const effectiveMaxDisplay =
    visiblePairCount !== null
      ? Math.min(visiblePairCount, maxDisplay)
      : maxDisplay;
  const displayBases = baseAssets.slice(0, effectiveMaxDisplay);
  const remainingBases = baseAssets.slice(effectiveMaxDisplay);
  const remainingCount = remainingBases.length;

  // Truncated tooltip text for remaining pairs (avoid extremely long tooltips)
  const tooltipText = useMemo(() => {
    if (remainingCount === 0) return '';
    const maxItems = 20; // show up to 5 items in tooltip
    const shown = remainingBases
      .slice(0, maxItems)
      .map((b) => `${b}/${quoteSymbol}`);
    const extra = remainingCount - shown.length;
    const list = shown.join(', ');
    return `${remainingCount} more ${remainingCount === 1 ? 'pair' : 'pairs'}: ${list}${extra > 0 ? `, … and ${extra} more` : ''}`;
  }, [remainingBases, remainingCount, quoteSymbol]);

  // Render icons for single mode
  const renderIconsSingle = useCallback(() => {
    if (layout === 'vertical') {
      return (
        <div className="flex flex-col items-center gap-1 px-2 py-1 bg-background rounded-md border border-border/30">
          <CoinIcon symbol={base} size={sizes.base} />
          {quote && <CoinIcon symbol={quote} size={sizes.quote} />}
          {showText && (
            <span className="font-mono text-xs font-medium text-foreground whitespace-nowrap">
              {quote ? `${base}/${quote}` : base}
            </span>
          )}
        </div>
      );
    }

    if (layout === 'stacked') {
      // Stacked layout: icons overlapped on top, text below, in a chip-like container
      return (
        <div className="flex flex-col items-center gap-1 px-1 py-1 bg-background rounded-md border border-border/30">
          <div className="relative flex items-center">
            <CoinIcon symbol={base} size={sizes.base} isQuote={false} />
            {quote && (
              <div className={sizes.overlap}>
                <CoinIcon symbol={quote} size={sizes.quote} isQuote={true} />
              </div>
            )}
          </div>
          {showText && (
            <span className="font-mono text-xs font-medium text-foreground whitespace-nowrap">
              {quote ? `${base}/${quote}` : base}
            </span>
          )}
        </div>
      );
    }

    // Horizontal layout (default) - base to the left, quote behind/right
    return (
      <div className="flex items-center gap-1 px-1 py-1 bg-background rounded-md border border-border/30">
        <div className="relative flex items-center">
          <CoinIcon symbol={base} size={sizes.base} isQuote={false} />
          {quote && (
            <div className={sizes.overlap}>
              <CoinIcon symbol={quote} size={sizes.quote} isQuote={true} />
            </div>
          )}
        </div>
        {showText && (
          <span className="font-mono text-xs font-medium text-foreground whitespace-nowrap">
            {quote ? `${base}/${quote}` : base}
          </span>
        )}
      </div>
    );
  }, [layout, base, quote, sizes, showText]);

  // Render icons for multi mode - now renders full pairs (BASE/QUOTE) individually
  const renderIconsMulti = () => {
    return (
      <>
        {displayBases.map((b, idx) => {
          // Determine wrapper classes based on layout
          const wrapperClass =
            layout === 'stacked'
              ? 'flex flex-col items-center gap-1 px-1 py-1 bg-background rounded-lg border border-border/30'
              : layout === 'vertical'
                ? 'flex flex-col items-center gap-1 px-1 py-1 bg-background rounded-lg border border-border/30'
                : 'flex items-center gap-1 px-1 py-1 bg-background rounded-lg border border-border/30';

          const pairSymbol = symbols[idx];
          const interactive = Boolean(onPairClick && pairSymbol);
          return (
            <div
              key={`${b}-${idx}`}
              className={`${wrapperClass}${
                interactive
                  ? ' cursor-pointer transition-colors hover:border-primary/60'
                  : ''
              }`}
              data-pair="true"
              {...(interactive
                ? {
                    role: 'button',
                    tabIndex: 0,
                    title: `Show ${b}/${quoteSymbol} on chart`,
                    'aria-label': `Show ${b}/${quoteSymbol} on chart`,
                    onClick: () => onPairClick?.(pairSymbol),
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onPairClick?.(pairSymbol);
                      }
                    },
                  }
                : {})}
            >
              {/* Base icon with quote overlapped */}
              <div className="relative flex items-center">
                <CoinIcon symbol={b} size={sizes.base} isQuote={false} />
                {/* Quote icon overlapped */}
                <div className={sizes.overlap}>
                  <CoinIcon
                    symbol={quoteSymbol}
                    size={sizes.quote}
                    isQuote={true}
                  />
                </div>
              </div>
              {/* Text for this pair */}
              {showText && (
                <span className="font-mono text-xs font-medium text-foreground whitespace-nowrap">
                  {b}/{quoteSymbol}
                </span>
              )}
            </div>
          );
        })}

        {/* +N badge for remaining pairs */}
        {remainingCount > 0 && (
          <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
            <PopoverTrigger asChild>
              <div className="relative" data-remaining="true">
                <Tooltip tooltip={tooltipText}>
                  <Badge
                    variant="secondary"
                    className="text-xs px-1.5 py-0.5 font-medium cursor-pointer hover:bg-secondary/80 transition-colors"
                    onClick={(e) => {
                      e.preventDefault();
                      setIsPopoverOpen(!isPopoverOpen);
                    }}
                  >
                    +{remainingCount}
                  </Badge>
                </Tooltip>
              </div>
            </PopoverTrigger>

            <PopoverContent className="w-auto p-sm" align="start">
              <div className="space-y-xs">
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  Additional pairs ({remainingCount}):
                </div>
                <div className="grid gap-xs">
                  {remainingBases.map((base, idx) => {
                    const pairSymbol = symbols[effectiveMaxDisplay + idx];
                    const interactive = Boolean(onPairClick && pairSymbol);
                    return (
                      <div
                        key={`${base}-${idx}`}
                        className={`flex items-center gap-xs${
                          interactive
                            ? ' cursor-pointer rounded-md px-1 py-0.5 transition-colors hover:bg-muted/50'
                            : ''
                        }`}
                        {...(interactive
                          ? {
                              role: 'button',
                              tabIndex: 0,
                              title: `Show ${base}/${quoteSymbol} on chart`,
                              'aria-label': `Show ${base}/${quoteSymbol} on chart`,
                              onClick: () => {
                                onPairClick?.(pairSymbol);
                                setIsPopoverOpen(false);
                              },
                              onKeyDown: (e: React.KeyboardEvent) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  onPairClick?.(pairSymbol);
                                  setIsPopoverOpen(false);
                                }
                              },
                            }
                          : {})}
                      >
                        <div className="relative flex items-center">
                          <CoinIcon symbol={base} size="sm" isQuote={false} />
                          <div className="-ml-2">
                            <CoinIcon
                              symbol={quoteSymbol}
                              size="sm"
                              isQuote={true}
                            />
                          </div>
                        </div>
                        <span className="text-sm font-medium">
                          {base}/{quoteSymbol}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </>
    );
  };

  const containerClasses =
    layout === 'vertical'
      ? `flex flex-col items-center gap-xs ${className}`
      : layout === 'stacked'
        ? `flex items-center gap-xs ${className}`
        : `flex items-center gap-xs ${className}`;

  return (
    <div ref={containerRef} className={containerClasses}>
      <div ref={contentRef} className="flex items-center gap-xs w-full">
        {multiMode ? renderIconsMulti() : renderIconsSingle()}
      </div>
    </div>
  );
};

export default CoinPair;
