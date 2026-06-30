import { useTradingPairsFromContext } from '@/contexts/ExchangeDataContext';
import { useBotFormState } from '@/features/bots';
import { useBotFormQuery } from '@/features/bots/widgets/BotForm/providers/BotFormQueryProvider';
import { type AssetClass, type TradingPair } from '@/hooks/useTradingPairs';
import {
  usePairMarketData,
  type PairRoiContext,
} from '@/lib/pairMarketData';
import { useStarredPairsStore } from '@/stores/starredPairsStore';
import { BotTypesEnum, StrategyEnum, type CoinListItem } from '@/types';
import { ArrowRightLeft, X as CloseIcon, RefreshCw } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import CoinIcon from './CoinIcon';
import CoinPair from './CoinPair';
import { ListModal, type ListModalSortOption } from './ListModal';

const PAIR_SORT_OPTIONS: ListModalSortOption[] = [
  { value: 'marketcap', label: 'By market cap' },
  { value: 'roi', label: 'By ROI' },
  { value: 'volume', label: 'By 24h volume' },
  { value: 'change', label: 'By 24h change' },
  { value: 'volatility', label: 'By volatility' },
  { value: 'rsi', label: 'By RSI' },
  { value: 'alpha', label: 'A–Z' },
];

export interface CoinFilterPairMetadata {
  bySelectionSymbol: Record<string, TradingPair>;
  byPair: Record<string, TradingPair>;
}

export interface CoinFilterHelperToken {
  token: string;
  label: string;
  description?: string;
}

export interface CoinFilterProps {
  selectedCoins: string[];
  onCoinToggle: (coinSymbol: string) => void;
  onRemoveCoin: (coinSymbol: string) => void;
  mode?: 'coins' | 'pairs';
  /** Provider identifier (e.g. BINANCE). When supplied we filter pairs to that exchange */
  /* exchangeProvider?: string; */
  onPairsPaste?: (raw: string) => void;
  helperTokens?: CoinFilterHelperToken[];
  shouldShowAddButton?: boolean;
  showAllOption?: boolean;
  /**
   * Constrains the add-pairs modal to candidates sharing one asset with
   * the already-selected pairs: the quote asset for longs, the base asset
   * for shorts/coinm. Only applied while *adding* (not when replacing the
   * single pair, which may legitimately switch quote). Null = no filter.
   */
  pairFilter?: { dimension: 'base' | 'quote'; anchor: string } | null;
  /**
   * Clears the whole selection. Wired to the filter chip's ✕ — removing
   * the locked quote/base means dropping the current pairs so the user
   * can start over with a different anchor.
   */
  onClearSelection?: () => void;
  /**
   * Clicking a selected pair chip's body (not the remove/change button)
   * fires this with the chip's selection symbol (e.g. `BTC-USDT`). Used
   * to switch the form chart to that pair. Pairs mode only; omit to keep
   * chips non-interactive.
   */
  onPairClick?: (selectionSymbol: string) => void;
}

export const CoinFilter: React.FC<CoinFilterProps> = ({
  selectedCoins,
  onCoinToggle,
  onRemoveCoin,
  mode = 'coins',
  /* exchangeProvider, */
  onPairsPaste,
  helperTokens,
  shouldShowAddButton = true,
  showAllOption = true,
  pairFilter,
  onClearSelection,
  onPairClick,
}) => {
  const [showCoinDialog, setShowCoinDialog] = useState(false);
  // When the dialog is opened via the change/swap icon on the only chip,
  // picking a new coin must REPLACE the existing one, not toggle in a
  // second selection. We capture the symbol being replaced so the
  // handler can ignore stale parent closures (handleCoinToggle reads
  // `pairs` from a captured ref and would write `[old, new]`).
  const [replacingSymbol, setReplacingSymbol] = useState<string | null>(null);
  const [showAllSelected, setShowAllSelected] = useState(false);
  // Asset-class filter for the picker modal (crypto / stocks / metals / …).
  const [selectedAssetClass, setSelectedAssetClass] = useState<
    AssetClass | 'all'
  >('all');

  // Sort + favorites for the pair selector. Market-data sort is cloud
  // only (provider-injected); favorites are local (Zustand + localStorage).
  const [sortMode, setSortMode] = useState('marketcap');
  const [favoritesFirst, setFavoritesFirst] = useState(false);
  const { formData, updateFormData } = useBotFormState();

  // Surface the curated ROI that matches the bot form's risk-profile
  // cards: DCA & Combo read the DCA leaderboard, Grid reads grid; the
  // direction comes from the form's current strategy.
  const dcaStrategy = (formData.dca as { strategy?: StrategyEnum })?.strategy;
  const comboStrategy = (formData.combo as { strategy?: StrategyEnum })
    ?.strategy;
  const gridStrategy = (formData.grid as { strategy?: StrategyEnum })?.strategy;
  const roiContext = useMemo<PairRoiContext>(() => {
    if (formData.type === BotTypesEnum.grid) {
      return {
        botType: 'grid',
        strategy: gridStrategy === StrategyEnum.short ? 'short' : 'long',
      };
    }
    const strat =
      formData.type === BotTypesEnum.combo ? comboStrategy : dcaStrategy;
    return {
      botType: 'dca',
      strategy: strat === StrategyEnum.short ? 'short' : 'long',
    };
  }, [formData.type, dcaStrategy, comboStrategy, gridStrategy]);

  // Only fetch market data while the dialog is open (non-blocking for the
  // bot form); the underlying queries are cached so reopening is instant.
  const { lookup: marketLookup } = usePairMarketData(
    showCoinDialog,
    roiContext
  );
  const starredPairIds = useStarredPairsStore((s) => s.starredPairIds);
  const toggleStarredPair = useStarredPairsStore((s) => s.toggleStarredPair);

  // The quote/base constraint is always enforced while a pair is selected
  // — there is no "show all" bypass, because mixing quotes (long) or bases
  // (short) is invalid. To change the locked asset the user clears the
  // selection via the chip's ✕, which removes the anchor; the full list
  // reopens for a fresh first pick and the filter re-arms from it.
  const filterActive = Boolean(pairFilter);

  const {
    pairsByExchange,
    isLoading: tradingPairsLoading,
    error: tradingPairsError,
    refresh: refreshTradingPairs,
  } = useTradingPairsFromContext();

  // Map base asset → normalized asset class (from the trading pairs). Used to
  // tag modal items so the picker's asset-class filter can group crypto vs
  // stocks/metals/forex/etc. A base maps to the same class across exchanges.
  const assetCategoryByBase = useMemo<Record<string, AssetClass>>(() => {
    const map: Record<string, AssetClass> = {};
    if (!pairsByExchange) return map;
    Object.values(pairsByExchange).forEach((pairs) => {
      pairs.forEach((pair) => {
        const base = pair.baseAsset?.name?.toUpperCase();
        if (base && pair.assetCategory && !map[base]) {
          map[base] = pair.assetCategory;
        }
      });
    });
    return map;
  }, [pairsByExchange]);

  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetryPairs = useCallback(async () => {
    setIsRetrying(true);
    try {
      await refreshTradingPairs();
    } finally {
      setIsRetrying(false);
    }
  }, [refreshTradingPairs]);

  /* const normalizedProvider = exchangeProvider?.toUpperCase(); */
  const isPairsMode = mode === 'pairs';

  const helperModalItems = useMemo(() => {
    if (!isPairsMode || !helperTokens?.length) {
      return [] as CoinListItem[];
    }

    return helperTokens.map((token) => ({
      symbol: token.token.toUpperCase(),
      name: token.label,
      color: 'var(--color-primary)',
      ...(token.description ? { subtitle: token.description } : {}),
      isHelper: true,
    }));
  }, [helperTokens, isPairsMode]);
  // Show every pair the current exchange supports — match legacy
  // behavior. The previous redesign-only filter narrowed the modal to
  // pairs sharing the first pair's quote (long / futures) or base
  // (short / coinm). That hid valid candidates whenever the user was
  // *replacing* the only pair, especially when a stale `formData.pair`
  // (e.g. last-used `BTCUSDC` on the terminal) silently constrained
  // the search to USDC. Any "single quote currency per bot" constraint
  // should be enforced at submit time, not by hiding pairs from search.
  const { pairItems } = useBotFormQuery();

  const coinItems = useMemo(() => {
    if (isPairsMode || !pairsByExchange) {
      return [] as CoinListItem[];
    }

    const symbols = new Set<string>();
    const items: CoinListItem[] = [];

    Object.values(pairsByExchange).forEach((pairs) => {
      pairs.forEach((pair) => {
        const addSymbol = (symbol?: string) => {
          const normalizedSymbol = symbol?.toUpperCase();
          if (!normalizedSymbol || symbols.has(normalizedSymbol)) {
            return;
          }
          symbols.add(normalizedSymbol);
          items.push({
            symbol: normalizedSymbol,
            name: normalizedSymbol,
            color: 'var(--color-primary)',
          });
        };

        addSymbol(pair.baseAsset?.name);
        addSymbol(pair.quoteAsset?.name);
      });
    });

    return items.sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [isPairsMode, pairsByExchange]);

  // Constrain candidates to those sharing the anchor asset (quote for
  // longs, base for shorts) with the current selection. The already-
  // selected pair is always in `pairItems`, so the filtered set is never
  // empty while a pair is selected — no fallback-to-all (which would let
  // the user add a mismatched-quote pair).
  const filteredPairItems = useMemo(() => {
    if (!pairFilter || !filterActive) {
      return pairItems;
    }
    const anchor = pairFilter.anchor.toUpperCase();
    return pairItems.filter((item) => {
      const asset =
        pairFilter.dimension === 'base' ? item.baseAsset : item.quoteAsset;
      return asset?.toUpperCase() === anchor;
    });
  }, [pairItems, pairFilter, filterActive]);

  const modalItems = useMemo(() => {
    if (isPairsMode) {
      return [...helperModalItems, ...filteredPairItems] as CoinListItem[];
    }
    return coinItems;
  }, [coinItems, helperModalItems, isPairsMode, filteredPairItems]);

  const VISIBLE_SELECTION_LIMIT = 10;

  const displayedSelectedCoins = useMemo(() => {
    if (showAllSelected || selectedCoins.length <= VISIBLE_SELECTION_LIMIT) {
      return selectedCoins;
    }
    return selectedCoins.slice(0, VISIBLE_SELECTION_LIMIT);
  }, [selectedCoins, showAllSelected]);

  const hiddenCount = selectedCoins.length - displayedSelectedCoins.length;
  const canCollapse =
    showAllSelected && selectedCoins.length > VISIBLE_SELECTION_LIMIT;

  useEffect(() => {
    if (selectedCoins.length <= VISIBLE_SELECTION_LIMIT && showAllSelected) {
      setShowAllSelected(false);
    }
  }, [selectedCoins.length, showAllSelected]);

  const itemLookup = useMemo(() => {
    return modalItems.reduce<Record<string, CoinListItem>>((acc, item) => {
      acc[item.symbol] = item;
      return acc;
    }, {});
  }, [modalItems]);

  // Prepare items for the ListModal based on mode
  const listModalItems = useMemo(() => {
    const header = {
      symbol: 'ALL',
      name: isPairsMode ? 'All Pairs' : 'All Coins',
      icon: '📊',
      color: 'var(--color-primary)',
      subtitle: isPairsMode ? 'All trading pairs' : 'All assets',
      assetCategory: undefined as AssetClass | undefined,
    } as const;

    if (modalItems.length === 0) {
      return showAllOption ? [header] : [];
    }

    return [
      ...(showAllOption ? [header] : []),
      ...modalItems.map((item) => {
        // Enrich pairs with provider market data (marketcap / volume /
        // change / curated ROI) and the local favorite flag. Coins,
        // helpers and the ALL header get no enrichment (lookup → null).
        const datum =
          isPairsMode && item.baseAsset ? marketLookup(item.baseAsset) : null;
        // Tag with normalized asset class (by base for pairs, by symbol for
        // coins) so the modal's asset-class filter can narrow the list.
        const classKey = (item.baseAsset ?? item.symbol)?.toUpperCase();
        const assetCategory = classKey ? assetCategoryByBase[classKey] : undefined;
        return {
          symbol: item.symbol,
          name: item.name,
          icon: '',
          color: item.color,
          assetCategory,
          // Forward the venue so the modal's CoinIcon can venue-gate
          // tokenized-stock ticker normalization (Bitget reality / Bybit spot).
          ...(item.exchange ? { exchange: item.exchange } : {}),
          ...(item.baseAsset && item.quoteAsset
            ? { baseAsset: item.baseAsset, quoteAsset: item.quoteAsset }
            : {}),
          ...(item.subtitle ? { subtitle: item.subtitle } : {}),
          ...(item.isHelper ? { isHelper: true } : {}),
          // Spread all provider fields (price, marketCap, volume, the
          // change windows, volatility, rsi, roi). Undefined values are
          // harmless — every consumer guards with `!= null`.
          ...(datum ?? {}),
          ...(isPairsMode && !item.isHelper
            ? { isFavorite: starredPairIds.has(item.symbol) }
            : {}),
        };
      }),
    ];
  }, [
    modalItems,
    isPairsMode,
    showAllOption,
    marketLookup,
    starredPairIds,
    assetCategoryByBase,
  ]);

  // Asset classes actually present among the modal items (drives which filter
  // chips render). Missing class counts as crypto.
  const availableAssetClasses = useMemo<AssetClass[]>(() => {
    const present = new Set<AssetClass>();
    listModalItems.forEach((item) => {
      if (item.symbol === 'ALL') return;
      present.add(item.assetCategory ?? 'crypto');
    });
    return Array.from(present);
  }, [listModalItems]);

  // Only surface the market-data sort dropdown when the provider actually
  // returned data (cloud build). In sh the lookup is empty, so the
  // selector keeps its incoming (alphabetical) order and hides the
  // dropdown — favorites still work since they're local.
  const hasMarketData = useMemo(
    () =>
      isPairsMode &&
      modalItems.some((item) =>
        item.baseAsset ? marketLookup(item.baseAsset) != null : false
      ),
    [isPairsMode, modalItems, marketLookup]
  );

  const isLastCoin = selectedCoins.length === 1;
  const changeLabel = isPairsMode ? 'Change pair' : 'Change coin';

  const openChangeDialog = (symbol: string) => {
    setReplacingSymbol(symbol);
    setShowCoinDialog(true);
  };

  const handleDialogClose = useCallback(() => {
    setShowCoinDialog(false);
    setReplacingSymbol(null);
    setSelectedAssetClass('all');
  }, []);

  // When the dialog was opened in replace mode, picking any coin must
  // atomically swap the previous symbol for the new one. We bypass the
  // toggle callback chain here because `handleCoinToggle` in the bot
  // form reads `pairs` from a captured closure — calling remove + add
  // in the same tick would write `[old, new]` instead of `[new]`.
  //
  // Memoized so the ListModal rows (React.memo) don't all re-render on
  // every selection toggle — only the row whose selected state changed.
  const handleDialogToggle = useCallback(
    (symbol: string) => {
      if (replacingSymbol !== null) {
        if (symbol === replacingSymbol) {
          handleDialogClose();
          return;
        }
        // The dialog items use a dashed selectionSymbol (e.g. `BTC-USDT`),
        // but the rest of the form keys `pairMetadata` by the undashed
        // form (`BTCUSDT`). Without normalizing here the downstream
        // `pairMetadata[pair]` lookup misses → BotChart never receives a
        // symbol prop → chart stays on the old pair, backtest button stays
        // disabled. The regular add-pair flow goes through `normalizePair`
        // in basic-settings; bypassing it for atomic replace skipped that
        // step. Match the same regex as `normalizePairInput`.
        const normalized = symbol.replace(/[\s\-/]/g, '').toUpperCase();
        // Atomic single-write replacement.
        updateFormData('pair', [normalized]);
        handleDialogClose();
        return;
      }
      onCoinToggle(symbol);
    },
    [replacingSymbol, handleDialogClose, updateFormData, onCoinToggle]
  );

  const handleToggleFavoritesFirst = useCallback(
    () => setFavoritesFirst((v) => !v),
    []
  );

  const renderRemoveOrChange = (symbol: string, label: string) =>
    isLastCoin ? (
      <button
        type="button"
        onClick={() => openChangeDialog(symbol)}
        className="text-muted-foreground hover:text-foreground transition-colors"
        aria-label={changeLabel}
      >
        <ArrowRightLeft className="h-4 w-4" />
      </button>
    ) : (
      <button
        type="button"
        onClick={() => onRemoveCoin(symbol)}
        className="text-muted-foreground hover:text-destructive transition-colors"
        aria-label={`Remove ${label}`}
      >
        <CloseIcon className="h-4 w-4" />
      </button>
    );

  const renderSelectedItem = (symbol: string, index: number) => {
    if (symbol === 'ALL') {
      return (
        <div
          key={`ALL-${index}`}
          className="bg-card rounded-lg p-xs flex items-center gap-xs min-w-0"
        >
          <div className="flex items-center gap-xs flex-1 min-w-0">
            <CoinIcon symbol="ALL" size="w-4 h-4" />
            <span className="text-foreground text-xs font-medium truncate">
              {isPairsMode ? 'All pairs' : 'All coins'}
            </span>
          </div>
          {selectedCoins.length > 1 && (
            <button
              type="button"
              onClick={() => onRemoveCoin('ALL')}
              className="text-muted-foreground hover:text-destructive transition-colors"
              aria-label="Remove All"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      );
    }

    const item = itemLookup[symbol];

    if (isPairsMode) {
      const [baseAsset = '?', quoteAsset = '?'] = symbol.split('-');
      const label = item?.name ?? `${baseAsset}/${quoteAsset}`;
      const pairBody = (
        <>
          <CoinPair
            baseAsset={baseAsset}
            quoteAsset={quoteAsset}
            assetClass={assetCategoryByBase[baseAsset.toUpperCase()]}
            exchange={item?.exchange}
            iconSize="sm"
            showText={false}
          />
          <span className="text-foreground text-xs font-medium truncate">
            {label}
          </span>
        </>
      );
      return (
        <div
          key={`${symbol}-${index}`}
          className="bg-card rounded-lg p-xs flex items-center gap-xs min-w-0"
        >
          {onPairClick ? (
            <button
              type="button"
              onClick={() => onPairClick(symbol)}
              className="flex items-center gap-xs flex-1 min-w-0 text-left cursor-pointer hover:opacity-80 transition-opacity"
              title={`Show ${label} on chart`}
              aria-label={`Show ${label} on chart`}
            >
              {pairBody}
            </button>
          ) : (
            <div className="flex items-center gap-xs flex-1 min-w-0">
              {pairBody}
            </div>
          )}
          {renderRemoveOrChange(symbol, label)}
        </div>
      );
    }

    const label = item?.name ?? symbol;
    return (
      <div
        key={`${symbol}-${index}`}
        className="bg-card rounded-lg p-xs flex items-center gap-xs min-w-0"
      >
        <div className="flex items-center gap-xs flex-1 min-w-0">
          <CoinIcon
            symbol={symbol}
            size="w-4 h-4"
            assetClass={assetCategoryByBase[symbol.toUpperCase()]}
            exchange={item?.exchange}
          />
          <span className="text-foreground text-xs font-medium truncate">
            {label}
          </span>
        </div>
        {renderRemoveOrChange(symbol, label)}
      </div>
    );
  };

  const addButtonLabel = isPairsMode
    ? tradingPairsLoading
      ? 'Loading pairs…'
      : 'Add pairs'
    : 'Add coins';

  return (
    <>
      {/* Coins Section */}
      <div className="rounded-lg p-sm space-y-sm bg-inner-container">
        {isPairsMode && tradingPairsError && (
          <div className="flex items-center gap-sm text-xs text-destructive">
            <span>
              {tradingPairsError.message || 'Failed to load trading pairs.'}
            </span>
            <button
              type="button"
              onClick={handleRetryPairs}
              disabled={isRetrying}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3 w-3 ${isRetrying ? 'animate-spin' : ''}`}
              />
              {isRetrying ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        )}
        {isPairsMode && tradingPairsLoading && (
          <div className="flex items-center gap-xs text-xs text-muted-foreground">
            <span className="inline-flex h-3 w-3 animate-spin rounded-full border border-border border-t-transparent" />
            <span>Loading trading pairs…</span>
          </div>
        )}

        <div className="space-y-xs">
          {/* Selected Coins */}
          <div className="flex flex-wrap gap-xs">
            {displayedSelectedCoins.map(renderSelectedItem)}

            {hiddenCount > 0 && !showAllSelected && (
              <button
                type="button"
                onClick={() => setShowAllSelected(true)}
                className="border border-dashed border-border rounded-lg px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                aria-label={`Show ${hiddenCount} more selected ${isPairsMode ? 'pairs' : 'coins'}`}
              >
                + Load all ({hiddenCount} more)
              </button>
            )}

            {canCollapse && (
              <button
                type="button"
                onClick={() => setShowAllSelected(false)}
                className="border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Show fewer selected items"
              >
                Show less
              </button>
            )}

            {isPairsMode &&
              tradingPairsLoading &&
              selectedCoins.length === 0 && (
                <div className="flex items-center gap-xs rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground animate-pulse">
                  <span className="inline-flex h-2 w-2 rounded-full bg-muted-foreground/60" />
                  <span>Preparing available pairs…</span>
                </div>
              )}

            {/* Add Items Button */}
            {(shouldShowAddButton ||
              (!shouldShowAddButton && selectedCoins.length === 0)) && (
              <button
                onClick={() => setShowCoinDialog(true)}
                className="border border-border rounded-lg p-xs flex items-center gap-xs text-muted-foreground hover:text-foreground bg-card hover:border-primary transition-all disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isPairsMode && tradingPairsLoading}
                aria-busy={isPairsMode && tradingPairsLoading}
              >
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-xs">{addButtonLabel}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Selection Modal */}
      <ListModal
        isOpen={showCoinDialog}
        onClose={handleDialogClose}
        title={
          replacingSymbol !== null
            ? isPairsMode
              ? 'Change pair'
              : 'Change coin'
            : isPairsMode
              ? 'Select Pairs'
              : 'Select Coins'
        }
        items={listModalItems}
        selectedItems={selectedCoins}
        onItemToggle={handleDialogToggle}
        searchPlaceholder={isPairsMode ? 'Search pairs...' : 'Search coins...'}
        isLoading={isPairsMode && tradingPairsLoading}
        loadingMessage={
          isPairsMode
            ? 'Fetching trading pairs from your exchange…'
            : 'Preparing assets…'
        }
        selectionMode={replacingSymbol !== null ? 'single' : 'multi'}
        assetClassOptions={availableAssetClasses}
        selectedAssetClass={selectedAssetClass}
        onAssetClassChange={setSelectedAssetClass}
        enableFavorites={isPairsMode}
        onToggleFavorite={toggleStarredPair}
        favoritesFirst={favoritesFirst}
        onToggleFavoritesFirst={handleToggleFavoritesFirst}
        {...(filterActive && pairFilter
          ? {
              activeFilterLabel: pairFilter.anchor,
              ...(onClearSelection ? { onClearFilter: onClearSelection } : {}),
            }
          : {})}
        {...(hasMarketData
          ? {
              sortMode,
              sortOptions: PAIR_SORT_OPTIONS,
              onSortModeChange: setSortMode,
            }
          : {})}
        {...(isPairsMode && onPairsPaste ? { onPaste: onPairsPaste } : {})}
      />
    </>
  );
};
