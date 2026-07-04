import { ChevronDown, Search, Star, X as CloseIcon } from 'lucide-react';
import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { type AssetClass } from '../../../hooks/useTradingPairs';
import { formatExchangeProvider } from '../../../utils/exchangeUtils';
import { Chip } from '../../ui/chip';
import { Checkbox } from '../../ui/checkbox';
import ProfitLossPercChip from '../../ui/chip/ProfitLossPercChip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { Switch } from '../../ui/switch';
import { Tooltip, InfoIcon } from '../../ui/tooltip';
import CoinIcon from './CoinIcon';
import CoinPair from './CoinPair';
import ExchangeIcon from './ExchangeIcon';

interface ListItem {
  symbol: string;
  name: string;
  icon: string;
  price?: number;
  color: string;
  subtitle?: string;
  // Pair-specific properties
  baseIcon?: string;
  quoteIcon?: string;
  baseAsset?: string;
  quoteAsset?: string;
  // Exchange-specific properties
  isExchange?: boolean;
  isHelper?: boolean;
  // Normalized asset class (crypto/stock/etf/commodity/metal/forex/index),
  // used by the optional asset-class filter. Missing => treated as crypto.
  assetCategory?: AssetClass;
  // Canonical/curated-listing flag (HL spot only; missing elsewhere =>
  // canonical). Drives the "Canonical only" toggle. `false` = permissionless.
  isCanonical?: boolean;
  // Base pair's exchange (ExchangeEnum value). Forwarded to CoinIcon to
  // venue-gate tokenized-stock ticker normalization. Only relevant for stock/etf.
  exchange?: string;
  // Optional market-data enrichment (cloud only — see pairMarketData
  // provider). All optional so sh / coins-mode lists are unaffected.
  // (`price` is already declared above for coin/exchange rows.)
  marketCap?: number;
  marketCapRank?: number;
  volume24h?: number;
  change1h?: number;
  change24h?: number;
  change7d?: number;
  change30d?: number;
  volatility?: number;
  rsi?: number;
  roi?: number;
  isFavorite?: boolean;
}

export interface ListModalSortOption {
  value: string;
  label: string;
}

interface ListModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  items: ListItem[];
  selectedItems: string[];
  onItemToggle: (itemSymbol: string) => void;
  searchPlaceholder?: string;
  isLoading?: boolean;
  loadingMessage?: string;
  onPaste?: (raw: string) => void;
  // Sort + favorites (optional — enabled by the pair selector)
  sortMode?: string;
  sortOptions?: ListModalSortOption[];
  onSortModeChange?: (mode: string) => void;
  favoritesFirst?: boolean;
  onToggleFavoritesFirst?: () => void;
  enableFavorites?: boolean;
  onToggleFavorite?: (symbol: string) => void;
  /** 'multi' shows a Done button; 'single' closes on pick (replace flow). */
  selectionMode?: 'single' | 'multi';
  /** Active quote/base filter shown as a removable chip by the title. */
  activeFilterLabel?: string;
  onClearFilter?: () => void;
  /**
   * Asset-class filter. When `assetClassOptions` has >= 2 entries, a row of
   * filter chips (All + each class) renders below the search; selecting one
   * narrows the list to items whose `assetCategory` matches (missing => crypto).
   */
  assetClassOptions?: AssetClass[];
  selectedAssetClass?: AssetClass | 'all';
  onAssetClassChange?: (cls: AssetClass | 'all') => void;
}

/** Canonical order + labels for the asset-class filter chips. */
const ASSET_CLASS_ORDER: AssetClass[] = [
  'crypto',
  'stock',
  'etf',
  'commodity',
  'metal',
  'forex',
  'index',
];
const ASSET_CLASS_LABELS: Record<AssetClass | 'all', string> = {
  all: 'All',
  crypto: 'Crypto',
  stock: 'Stocks',
  etf: 'ETFs',
  commodity: 'Commodities',
  metal: 'Metals',
  forex: 'Forex',
  index: 'Indices',
};

const renderItemIcon = (item: ListItem) => {
  if (item.isHelper) {
    return (
      <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/10">
        <span className="text-lg">✨</span>
      </div>
    );
  }

  // If it has both base and quote assets, it's a trading pair
  if (item.baseAsset && item.quoteAsset) {
    return (
      <CoinPair
        baseAsset={item.baseAsset}
        quoteAsset={item.quoteAsset}
        assetClass={item.assetCategory}
        exchange={item.exchange}
        iconSize="md"
        showText={false}
      />
    );
  }

  // If it's marked as an exchange
  if (item.isExchange) {
    return (
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center"
        style={{
          backgroundColor: item.color
            ? item.color + '20'
            : 'var(--color-muted)',
        }}
      >
        <ExchangeIcon icon={item.icon} size="w-6 h-6" />
      </div>
    );
  }

  // If icon is empty string, skip icon rendering (text-only mode)
  if (item.icon === '') {
    return null;
  }

  // Default: single token/coin
  return (
    <CoinIcon
      symbol={item.symbol}
      size="lg"
      assetClass={item.assetCategory}
      exchange={item.exchange}
    />
  );
};

const formatRoi = (roi: number): string =>
  `+${roi.toLocaleString('en-US', {
    minimumFractionDigits: roi >= 100 ? 0 : 1,
    maximumFractionDigits: roi >= 100 ? 0 : 1,
  })}%`;

/** Compact USD, e.g. $1.34T / $66.3B / $345M / $12.3K. */
const formatCompactUsd = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${Math.round(n)}`;
};

/** Price with sensible precision across BTC ($66,000) and SHIB ($0.00002). */
const formatPrice = (n: number): string => {
  if (n >= 1)
    return `$${n.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  if (n > 0) return `$${n.toPrecision(2)}`;
  return '$0';
};

const nameKey = (item: ListItem) => (item.name || item.symbol).toLowerCase();

/**
 * Comparator for one sort mode. Numeric modes sort descending with
 * missing values pushed to the end; `marketcap` sorts by rank ascending
 * (rank 1 = largest) and `alpha` sorts by name. Items missing the active
 * metric fall back to alphabetical so the list stays stable.
 */
const compareBy = (a: ListItem, b: ListItem, mode: string): number => {
  if (mode === 'alpha') return nameKey(a).localeCompare(nameKey(b));

  if (mode === 'marketcap') {
    const ra = a.marketCapRank ?? Number.POSITIVE_INFINITY;
    const rb = b.marketCapRank ?? Number.POSITIVE_INFINITY;
    if (ra !== rb) return ra - rb;
    const ca = a.marketCap ?? Number.NEGATIVE_INFINITY;
    const cb = b.marketCap ?? Number.NEGATIVE_INFINITY;
    if (ca !== cb) return cb - ca;
    return nameKey(a).localeCompare(nameKey(b));
  }

  const field: keyof ListItem =
    mode === 'roi'
      ? 'roi'
      : mode === 'volume'
        ? 'volume24h'
        : mode === 'volatility'
          ? 'volatility'
          : mode === 'rsi'
            ? 'rsi'
            : 'change24h';
  const va = a[field as keyof ListItem] as number | undefined;
  const vb = b[field as keyof ListItem] as number | undefined;
  const aHas = va != null;
  const bHas = vb != null;
  if (aHas && bHas) {
    if (vb !== va) return (vb as number) - (va as number);
    return nameKey(a).localeCompare(nameKey(b));
  }
  if (aHas) return -1;
  if (bHas) return 1;
  return nameKey(a).localeCompare(nameKey(b));
};

interface ListModalRowProps {
  item: ListItem;
  isSelected: boolean;
  enableFavorites: boolean;
  onToggle: (symbol: string) => void;
  onToggleFavorite?: (symbol: string) => void;
}

/** A `label  ±value%` row in the expanded detail grid (colored chip). */
const DetailMetric: React.FC<{ label: string; change?: number }> = ({
  label,
  change,
}) =>
  change == null ? null : (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <ProfitLossPercChip value={change} size="xs" />
    </div>
  );

const TONE_CLASS = {
  up: 'text-success',
  down: 'text-destructive',
  neutral: 'text-foreground',
} as const;

/** A `label  value` row in the expanded detail grid (plain value). */
const DetailRow: React.FC<{
  label: string;
  value: string;
  tone?: keyof typeof TONE_CLASS;
}> = ({ label, value, tone = 'neutral' }) => (
  <div className="flex items-center justify-between gap-2">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className={`text-xs font-medium tabular-nums ${TONE_CLASS[tone]}`}>
      {value}
    </span>
  </div>
);

/**
 * One selectable row. Memoized so toggling a single selection only
 * re-renders the row whose `isSelected` changed — not the whole list.
 * For this to hold, the parent must pass stable `onToggle` /
 * `onToggleFavorite` identities and stable `item` references. The
 * expand/collapse state is local to the row.
 */
const ListModalRow = React.memo<ListModalRowProps>(
  ({ item, isSelected, enableFavorites, onToggle, onToggleFavorite }) => {
    const [expanded, setExpanded] = useState(false);
    const isPair = Boolean(item.baseAsset && item.quoteAsset);
    const canFavorite =
      enableFavorites &&
      Boolean(onToggleFavorite) &&
      !item.isHelper &&
      !item.isExchange &&
      item.symbol !== 'ALL';

    // Non-pair items keep their plain subtitle (exchange name / coin price).
    let subtitleText: string | null = null;
    if (!isPair) {
      if (item.isExchange && item.subtitle) {
        subtitleText = formatExchangeProvider(item.subtitle);
      } else if (item.subtitle) {
        subtitleText = item.subtitle;
      } else if (item.price !== undefined) {
        subtitleText = `$${item.price.toLocaleString('en-US', {
          minimumFractionDigits: item.symbol === 'USDT' ? 0 : 2,
          maximumFractionDigits: item.symbol === 'USDT' ? 0 : 2,
        })}`;
      }
    }

    const show24h = isPair && item.change24h != null;
    const showRoi = isPair && item.roi != null && (item.roi as number) > 0;
    const hasDetails =
      isPair &&
      [
        item.price,
        item.change1h,
        item.change24h,
        item.change7d,
        item.change30d,
        item.volume24h,
        item.marketCap,
        item.rsi,
        item.volatility,
      ].some((v) => v != null);
    const icon = renderItemIcon(item);

    return (
      <div
        className={`rounded-lg transition-colors ${
          isSelected
            ? 'bg-primary/10'
            : item.isHelper
              ? 'bg-primary/5 hover:bg-primary/10'
              : 'bg-muted hover:bg-muted/60'
        }`}
      >
        <div
          className="flex items-center gap-sm p-sm cursor-pointer"
          onClick={() => onToggle(item.symbol)}
        >
          {/* Favorite star */}
          {canFavorite && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite?.(item.symbol);
              }}
              aria-label={
                item.isFavorite
                  ? `Unfavorite ${item.name}`
                  : `Favorite ${item.name}`
              }
              aria-pressed={item.isFavorite}
              className={`shrink-0 transition-colors ${
                item.isFavorite
                  ? 'text-warning'
                  : 'text-muted-foreground/40 hover:text-warning'
              }`}
            >
              <Star
                className="h-4 w-4"
                fill={item.isFavorite ? 'currentColor' : 'none'}
              />
            </button>
          )}

          {/* Icon - only render if present */}
          {icon && <div className="shrink-0">{icon}</div>}

          {/* Content + metric chips. On mobile they stack (name on top,
              chips wrap below); from sm up the chips sit to the right of
              the name. */}
          <div className="flex-1 min-w-0 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-sm">
            <div className="min-w-0">
              {isPair ? (
                <>
                  <div className="text-foreground font-semibold text-sm truncate leading-tight">
                    {item.baseAsset}
                  </div>
                  <div className="text-muted-foreground text-xs truncate leading-tight">
                    {item.quoteAsset}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-foreground font-medium text-sm truncate">
                    {item.isExchange
                      ? item.name // exchanges: name only, no parentheses
                      : item.icon === ''
                        ? item.name // text-only mode
                        : `${item.name} (${item.symbol})`}
                  </div>
                  {subtitleText && (
                    <div className="text-muted-foreground text-xs truncate">
                      {subtitleText}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Curated ROI + 24h change. Mobile: a wrapping row under the
                name. sm+: a right-aligned column (ROI over 24h). */}
            {(showRoi || show24h) && (
              <div className="flex shrink-0 flex-row flex-wrap items-center gap-2 sm:flex-col sm:items-end sm:gap-1">
                {showRoi && (
                  <div
                    className="flex items-center gap-1.5"
                    title="Best curated-strategy ROI"
                  >
                    <span className="text-xs text-muted-foreground">ROI</span>
                    <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success tabular-nums">
                      {formatRoi(item.roi as number)}
                    </span>
                  </div>
                )}
                {show24h && (
                  <div
                    className="flex items-center gap-1.5"
                    title="24h price change"
                  >
                    <span className="text-xs text-muted-foreground">24h</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                        (item.change24h as number) >= 0
                          ? 'bg-success/10 text-success'
                          : 'bg-destructive/10 text-destructive'
                      }`}
                    >
                      {(item.change24h as number) >= 0 ? '+' : ''}
                      {(item.change24h as number).toFixed(2)}%
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Selection checkbox */}
          <Checkbox
            checked={isSelected}
            tabIndex={-1}
            className="shrink-0 pointer-events-none"
            aria-hidden
          />

          {/* Expand chevron — reveals volume / change windows / RSI / etc. */}
          {hasDetails && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((v) => !v);
              }}
              aria-label={expanded ? 'Hide details' : 'Show details'}
              aria-expanded={expanded}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform ${
                  expanded ? 'rotate-180' : ''
                }`}
              />
            </button>
          )}
        </div>

        {/* Expanded detail — inset card so it reads as a distinct block.
            Uses numeric grid gaps: gap-x-md/gap-y-* (axis-named tokens)
            don't generate in this Tailwind config. */}
        {expanded && hasDetails && (
          // p-sm (combined, works) + pt-0; `pb-sm` alone is a no-op token.
          <div className="p-sm pt-0" onClick={(e) => e.stopPropagation()}>
            <div className="space-y-sm rounded-md bg-background/50 p-sm">
              {(item.change1h != null ||
                item.change24h != null ||
                item.change7d != null ||
                item.change30d != null) && (
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-muted-foreground">
                    Price change
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <DetailMetric label="1h" change={item.change1h} />
                    <DetailMetric label="24h" change={item.change24h} />
                    <DetailMetric label="7d" change={item.change7d} />
                    <DetailMetric label="30d" change={item.change30d} />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {item.price != null && (
                  <DetailRow label="Price" value={formatPrice(item.price)} />
                )}
                {item.volume24h != null && (
                  <DetailRow
                    label="Volume"
                    value={formatCompactUsd(item.volume24h)}
                  />
                )}
                {item.marketCap != null && (
                  <DetailRow
                    label="Market cap"
                    value={formatCompactUsd(item.marketCap)}
                  />
                )}
                {item.rsi != null && (
                  <DetailRow
                    label="RSI"
                    value={item.rsi.toFixed(0)}
                    tone={
                      item.rsi >= 70
                        ? 'down'
                        : item.rsi <= 30
                          ? 'up'
                          : 'neutral'
                    }
                  />
                )}
                {item.volatility != null && (
                  <DetailRow
                    label="Volatility"
                    value={`${item.volatility.toFixed(1)}%`}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
);
ListModalRow.displayName = 'ListModalRow';

export const ListModal: React.FC<ListModalProps> = ({
  isOpen,
  onClose,
  title,
  items,
  selectedItems,
  onItemToggle,
  searchPlaceholder = 'Search...',
  isLoading = false,
  loadingMessage = 'Loading items…',
  onPaste,
  sortMode,
  sortOptions,
  onSortModeChange,
  favoritesFirst = false,
  onToggleFavoritesFirst,
  enableFavorites = false,
  onToggleFavorite,
  selectionMode = 'single',
  activeFilterLabel,
  onClearFilter,
  assetClassOptions,
  selectedAssetClass = 'all',
  onAssetClassChange,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  // "Canonical only" filter — ON by default. Hides permissionless
  // (non-canonical) listings, currently Hyperliquid HIP-1 spot tokens. Only
  // relevant when the list actually contains non-canonical items.
  const [canonicalOnly, setCanonicalOnly] = useState(true);
  const deferredItems = useDeferredValue(items);
  const hasNonCanonical = useMemo(
    () => deferredItems.some((i) => i.isCanonical === false),
    [deferredItems]
  );
  const assetChips = useMemo<AssetClass[]>(
    () =>
      assetClassOptions?.length
        ? ASSET_CLASS_ORDER.filter((c) => assetClassOptions.includes(c))
        : [],
    [assetClassOptions]
  );
  const showAssetFilter = assetChips.length > 1 && Boolean(onAssetClassChange);
  // The market-data sort (market cap / volume / ROI / …) is only populated for
  // crypto, so the sort dropdown only makes sense when Crypto (or the mixed
  // 'All') view is active. For Stocks/Metals/Indices/etc. it's hidden — the
  // asset-class selector is the primary control, the sort is secondary.
  const sortApplies =
    selectedAssetClass === 'all' || selectedAssetClass === 'crypto';
  const showSort =
    Boolean(sortOptions?.length && sortMode && onSortModeChange) && sortApplies;

  const filteredItems = useMemo(() => {
    if (isLoading) {
      return [] as ListItem[];
    }

    // "Canonical only" (default on): drop permissionless listings
    // (isCanonical === false). The ALL header + items with no flag (every
    // non-HL exchange => canonical) are always kept.
    const canonicalFiltered =
      canonicalOnly && hasNonCanonical
        ? deferredItems.filter(
            (item) => item.symbol === 'ALL' || item.isCanonical !== false
          )
        : deferredItems;

    const classFiltered =
      showAssetFilter && selectedAssetClass !== 'all'
        ? canonicalFiltered.filter(
            (item) =>
              // Keep the pinned ALL header; match class (missing => crypto).
              item.symbol === 'ALL' ||
              (item.assetCategory ?? 'crypto') === selectedAssetClass
          )
        : canonicalFiltered;

    if (!searchTerm.trim()) return classFiltered;

    const searchLower = searchTerm.toLowerCase().trim();

    // Split search term into words for multi-term search
    const searchWords = searchLower
      .split(/\s+/)
      .filter((word) => word.length > 0);

    return classFiltered.filter((item) => {
      // Combine all searchable text into one string
      const searchableText = [item.name, item.symbol, item.subtitle || '']
        .join(' ')
        .toLowerCase();

      // All search words must appear somewhere in the combined text
      return searchWords.every((word) => searchableText.includes(word));
    });
  }, [
    deferredItems,
    isLoading,
    searchTerm,
    showAssetFilter,
    selectedAssetClass,
    canonicalOnly,
    hasNonCanonical,
  ]);

  // Apply the active sort (and optional favorites-first float). The `ALL`
  // header pseudo-item, when present, always stays pinned at the very top.
  const sortedItems = useMemo(() => {
    if (!showSort && !favoritesFirst) return filteredItems;

    const header = filteredItems.filter((i) => i.symbol === 'ALL');
    const rest = filteredItems.filter((i) => i.symbol !== 'ALL');

    if (showSort && sortMode) {
      rest.sort((a, b) => compareBy(a, b, sortMode));
    }

    if (favoritesFirst) {
      const fav = rest.filter((i) => i.isFavorite);
      const non = rest.filter((i) => !i.isFavorite);
      return [...header, ...fav, ...non];
    }

    return [...header, ...rest];
  }, [filteredItems, showSort, sortMode, favoritesFirst]);

  // Close on Escape for a better keyboard UX (hook called unconditionally)
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const selectedCount = selectedItems.filter((s) => s !== 'ALL').length;

  const modalContent = (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-xs sm:p-md"
      onClick={onClose}
      data-testid="list-modal-overlay"
    >
      <div
        className="bg-popover rounded-2xl shadow-xl w-[26rem] max-w-full max-h-[85vh] sm:max-h-[34rem] flex flex-col"
        role="dialog"
        aria-modal="true"
        data-testid="list-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header + search grouped for a consistent top rhythm.
            NOTE: this Tailwind config only generates named spacing tokens
            (xs/sm/md/lg) for p-/px-/py- — NOT for pt-/pb-/pl-/pr-. Use
            py-* (or numeric) for vertical padding; pt-lg silently = 0. */}
        <div className="px-md py-md space-y-sm sm:px-lg">
          <div className="flex items-center justify-between gap-sm">
            <div className="flex min-w-0 items-center gap-sm">
              <h3 className="shrink-0 text-foreground font-semibold text-lg">
                {title}
              </h3>
              {activeFilterLabel && (
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                  title={`Showing pairs matching ${activeFilterLabel}`}
                >
                  {activeFilterLabel}
                  {onClearFilter && (
                    <button
                      type="button"
                      onClick={onClearFilter}
                      aria-label="Clear filter"
                      className="-mr-0.5 transition-colors hover:text-foreground"
                    >
                      <CloseIcon className="h-3 w-3" />
                    </button>
                  )}
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors rounded-md p-1 hover:bg-muted"
              aria-label="Close"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Asset-class filter — the PRIMARY control. Selecting a class
              narrows the list and (for non-crypto) hides the market-data sort,
              which only has data for crypto. Only renders with >= 2 classes. */}
          {showAssetFilter && (
            <div className="flex flex-wrap gap-xs">
              {(['all', ...assetChips] as Array<AssetClass | 'all'>).map(
                (cls) => {
                  const isActive = selectedAssetClass === cls;
                  return (
                    <button
                      key={cls}
                      type="button"
                      onClick={() => onAssetClassChange?.(cls)}
                      className="focus:outline-none"
                      aria-pressed={isActive}
                    >
                      <Chip
                        variant={isActive ? 'primary' : 'default'}
                        chipStyle={isActive ? 'soft' : 'ghost'}
                        size="sm"
                        className="cursor-pointer"
                      >
                        {ASSET_CLASS_LABELS[cls]}
                      </Chip>
                    </button>
                  );
                }
              )}
            </div>
          )}

          {/* Canonical-only toggle — only when the list has permissionless
              listings (Hyperliquid HIP-1 spot). ON by default; filters them out
              but never blocks selection (toggle off to trade them). */}
          {hasNonCanonical && (
            <div className="flex items-center gap-2">
              <Switch
                checked={canonicalOnly}
                onCheckedChange={setCanonicalOnly}
                aria-label="Canonical only"
              />
              <span className="text-sm text-foreground">Canonical only</span>
              <Tooltip
                side="bottom"
                tooltip="Non-canonical pairs are permissionless listings — they can impersonate real tickers or carry liquidity/rug risk. Turn off to show them."
              >
                <InfoIcon />
              </Tooltip>
            </div>
          )}

          {/* Search + sort */}
          <div className="flex items-center gap-sm">
            <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={isLoading}
              className="w-full pl-10 pr-3 py-2 text-sm bg-foreground/[0.04] hover:bg-foreground/[0.06] border border-border/50 rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
              onPaste={(event) => {
                if (!onPaste) {
                  return;
                }
                const text = event.clipboardData?.getData('text');
                if (!text?.trim()) {
                  return;
                }
                event.preventDefault();
                onPaste(text);
              }}
            />
          </div>

          {showSort && (
            <Select value={sortMode} onValueChange={onSortModeChange}>
              <SelectTrigger size="sm" className="w-auto shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sortOptions?.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {enableFavorites && onToggleFavoritesFirst && (
            <button
              type="button"
              onClick={onToggleFavoritesFirst}
              aria-pressed={favoritesFirst}
              aria-label="Show favorites first"
              title="Show favorites first"
              className={`shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                favoritesFirst
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Star
                className="h-4 w-4"
                fill={favoritesFirst ? 'currentColor' : 'none'}
              />
            </button>
          )}
          </div>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto px-md pb-2 sm:px-lg">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-sm py-12">
              <div className="w-8 h-8 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
              <p className="text-xs text-muted-foreground text-center px-6">
                {loadingMessage}
              </p>
            </div>
          ) : sortedItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No items found
            </div>
          ) : (
            <div className="space-y-1">
              {sortedItems.map((item) => (
                <ListModalRow
                  key={item.symbol}
                  item={item}
                  isSelected={selectedItems.includes(item.symbol)}
                  enableFavorites={enableFavorites}
                  onToggle={onItemToggle}
                  {...(onToggleFavorite ? { onToggleFavorite } : {})}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer — Done button for multi-select */}
        {selectionMode === 'multi' && !isLoading && (
          <div className="px-md py-md sm:px-lg">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {selectedCount > 0 ? `Done (${selectedCount})` : 'Done'}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // Render modal into the document body so it isn't constrained by parent overflow
  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalContent, document.body);
  }

  // Fallback to inline render
  return modalContent;
};
