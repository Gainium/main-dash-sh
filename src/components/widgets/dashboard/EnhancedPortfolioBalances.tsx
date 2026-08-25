import { useGraphQL } from '@/hooks/useGraphQL';
// import { useDcaBots } from '@/hooks/useDcaBots';
// import { useComboBots } from '@/hooks/useComboBots';
import { useTransformedExchangesFromContext } from '@/contexts/ExchangeDataContext';
import { GraphQlQuery } from '@/lib/api';
import {
  StatusEnum,
  type PortfolioQuery,
  type ScreenerCoinData,
} from '@/types';
import { useTopScreenerCoins } from '@/hooks/useScreenerCoins';
import { formatPriceWithPrecision } from '@/utils/formatters';
import {
  buildScreenerSymbolMap,
  findBestScreenerMatch,
} from '@/utils/portfolioScreenerMatching';
import { balanceAssetToPairBase } from '@/utils/pairs';
import { useResolvePairAsset } from '@/hooks/useResolvePairAsset';
import { type ColumnDef } from '@tanstack/react-table';
import { Info, Plus } from 'lucide-react';
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { getWidgetMetadata } from '.';
import { PortfolioContext } from '../../../contexts/PortfolioContext';
import {
  SORTING_CONFIGS,
  usePersistedSorting,
} from '../../../hooks/usePersistedSorting';
import {
  useWidgetSettings,
  type PortfolioWidgetSettings,
} from '../../../hooks/useWidgetSettings';
import { useUIStore } from '../../../stores/uiStore';
import type {
  BalanceCalculationInput,
  EnhancedBalanceData,
  EnhancedBalanceSettings,
  EnhancedBalanceTableProps,
} from '../../../types/enhancedBalance.types';
import {
  calculateEnhancedBalances,
  formatPercentage,
  formatTokenAmount,
} from '../../../utils/balanceCalculations';
import { Button } from '../../ui/button';
import { ExchangeChip } from '../../ui/chip';
import { DataTable } from '../../ui/data-table/data-table';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';
import { Switch } from '../../ui/switch';
import { WidgetWrapper } from '../WidgetWrapper';
import CoinIcon from '../shared/CoinIcon';
import { ListModal } from '../shared/ListModal';
import {
  FilterSection,
  SelectionDialog,
  type FilterItem,
} from '../shared/WidgetFilterArea';
import { ExportDialog } from './ExportDialog';

// Mock logger to replace removed logger calls
const logger = {
  debug: (..._args: unknown[]) => {},
  info: (..._args: unknown[]) => {},
  warn: (..._args: unknown[]) => {},
  error: (..._args: unknown[]) => {},
};

const EnhancedPortfolioBalances: React.FC<EnhancedBalanceTableProps> = ({
  widgetId = 'enhanced-portfolio-balances',
  data: propData,
  settings: _propSettings,
  showPagination = true,
  isEditable = false,
  isCollapsible = true,
  allowResize = true,
  height: propHeight,
  onRemove,
  onSettings,
  onCollapse,
  onTabMove,
  menuActions,
}) => {
  // GraphQL data fetching
  const {
    data: portfolioData,
    isLoading: _isLoading,
    error: _error,
  } = useGraphQL<PortfolioQuery>(
    'getPortfolioByUser',
    GraphQlQuery.getPortfolioByUser()
  );

  // Get real exchange data from the shared hook
  const { exchanges } = useTransformedExchangesFromContext();

  // Get real bot data (CRITICAL BOT INTEGRATION) - Temporarily disabled for testing
  // const {
  //   bots: dcaBots,
  //   isLoading: dcaBotsLoading,
  //   isError: dcaBotsError,
  //   refetch: refetchDcaBots,
  // } = useDcaBots({
  //   status: ['open', 'range', 'monitoring'], // Active bots only
  //   all: false,
  //   terminal: false, // Exclude terminal bots
  // });

  // const {
  //   bots: comboBots,
  //   isLoading: comboBotsLoading,
  //   isError: comboBotsError,
  //   refetch: refetchComboBots,
  // } = useComboBots({
  //   status: ['open', 'range', 'monitoring'], // Active bots only
  //   all: false,
  // });

  // Combine all bots for balance calculations
  const allBots = useMemo<NonNullable<BalanceCalculationInput['bots']>>(() => {
    // const combined = [...(dcaBots || []), ...(comboBots || [])];
    const combined: NonNullable<BalanceCalculationInput['bots']> = []; // Temporary empty array for testing
    logger.debug('[EnhancedPortfolioBalances] Bot data loaded:', {
      dcaBots: 0,
      comboBots: 0,
      total: combined.length,
    });
    return combined;
  }, []);

  // Use the generic widget settings hook with type safety
  const { usePersistedState } = useWidgetSettings<
    PortfolioWidgetSettings & EnhancedBalanceSettings
  >(widgetId);

  // Enhanced balance settings (CRITICAL MISSING FEATURES)
  const [shouldSumBalance, setShouldSumBalance] = usePersistedState(
    'shouldSumBalance',
    false
  );
  const [showExchange, setShowExchange] = usePersistedState(
    'showExchange',
    true
  );
  const [showCategories, setShowCategories] = usePersistedState(
    'showCategories',
    false
  );
  const [showMarketCap, setShowMarketCap] = usePersistedState(
    'showMarketCap',
    false
  );
  const [showBotUsage, setShowBotUsage] = usePersistedState(
    'showBotUsage',
    true
  );

  const portfolioContext = useContext(PortfolioContext);

  // Resolve a balance row's asset class + venue + human-readable name from the
  // globally-loaded trading pairs, so tokenized stocks (Kraken xStocks, Bybit
  // spot xstocks, Hyperliquid spot RWA) render the real logo + company name
  // instead of a first-letter tile. Crypto rows resolve to `{}` → CoinIcon's
  // default crypto behavior, so nothing else is affected.
  const resolvePairAsset = useResolvePairAsset();

  // Coin metadata (names, categories, market-cap rank). Prices come from
  // the venue via `getBalances(includeUsdValues)`; this is only a fallback
  // and a source of display metadata. See useScreenerCoins for why this no
  // longer shares a query key — or a 30s poll — with the market treemap.
  const { data: screenerResp, isLoading: isLoadingScreener } =
    useTopScreenerCoins();

  // Fetch raw balances to get accurate free/locked splits (prefer when
  // available) and, with `includeUsdValues`, the venue's own USD rate for each
  // holding - the authoritative price, and the only one that survives a coin
  // the screener cannot match by symbol.
  // `includeUsdValues`/`price`/`usdValue` require main-app core >= 1.53.5.
  // Selecting a field the schema lacks is a validation error that fails the
  // whole query, so an older backend is served the previous document instead
  // and the widget falls back to screener pricing rather than rendering
  // nothing at all.
  const { data: balancesResp } = useGraphQL<
    Array<{
      asset: string;
      free: string;
      locked: string;
      exchange?: string;
      exchangeUUID?: string;
      exchangeName?: string;
      price?: string | null;
      usdValue?: string | null;
    }>
  >(
    'getBalances',
    GraphQlQuery.getBalances(
      { shouldSumBalance: false, includeUsdValues: true },
      `asset
  free
  locked
  exchange
  exchangeUUID
  exchangeName
  price
  usdValue`
    ),
    { fallbackQuery: GraphQlQuery.getBalances({ shouldSumBalance: false }) }
  );

  // Sync local widget exchange selections with the page-level portfolio context
  const selectedExchangeContext = useMemo(
    () =>
      portfolioContext?.selectedExchanges &&
      portfolioContext.selectedExchanges.length
        ? portfolioContext.selectedExchanges
        : ['ALL'],
    [portfolioContext?.selectedExchanges]
  );

  // Filtering settings
  const [selectedExchanges, setSelectedExchanges] = usePersistedState(
    'selectedExchanges',
    ['ALL']
  );

  // Keep the widget's persisted exchange selections in sync with the global context
  useEffect(() => {
    const contextSelections = selectedExchangeContext;
    const areEqual =
      contextSelections.length === selectedExchanges.length &&
      contextSelections.every((val, idx) => val === selectedExchanges[idx]);
    if (!areEqual) {
      setSelectedExchanges(contextSelections);
    }
  }, [selectedExchangeContext, selectedExchanges, setSelectedExchanges]);
  // const [selectedCategories] = usePersistedState(
  //   'selectedCategories',
  //   ['ALL']
  // );
  const [selectedCurrency, setSelectedCurrency] = useState('USD');
  const [customName, setCustomName] = usePersistedState('customName', '');

  // Get privacy mode state
  const privacyMode = useUIStore((s) => s.privacyMode);

  // UI state
  const [showOptionsDialog, setShowOptionsDialog] = useState(false);
  const [showExchangeDialog, setShowExchangeDialog] = useState(false);
  const [showCoinDialog, setShowCoinDialog] = useState(false);
  const [selectedCoins, setSelectedCoins] = useState<string[]>(['ALL']);
  const [botLegendPopover, setBotLegendPopover] = useState<{
    isOpen: boolean;
    balance: EnhancedBalanceData | null;
  }>({ isOpen: false, balance: null });

  // Export functionality state (CRITICAL MISSING FEATURE)
  const [showExportDialog, setShowExportDialog] = useState(false);

  // Persistent sorting state (CRITICAL MISSING FEATURE)
  const {
    sorting,
    setSorting,
    isLoaded: isSortingLoaded,
  } = usePersistedSorting({
    ...SORTING_CONFIGS.enhancedBalances,
    storageKey: `enhanced-balance-table-sorting-${widgetId}`,
  });

  // Check if only one exchange is selected (not 'ALL' and exactly one exchange)
  const isSingleExchangeSelected = useMemo(() => {
    return !selectedExchanges.includes('ALL') && selectedExchanges.length === 1;
  }, [selectedExchanges]);

  // Automatically turn off aggregate when only one exchange is selected
  useEffect(() => {
    if (isSingleExchangeSelected && shouldSumBalance) {
      setShouldSumBalance(false);
    }
  }, [isSingleExchangeSelected, shouldSumBalance, setShouldSumBalance]);

  // Memoize screener map so we can use full coin names in the UI
  const screener = useMemo(
    () => (screenerResp?.data?.result || []) as ScreenerCoinData[],
    [screenerResp?.data?.result]
  );
  const screenerMap = useMemo(
    () => buildScreenerSymbolMap(screener),
    [screener]
  );

  // Process GraphQL data into EnhancedBalanceData format
  const getEnhancedBalanceData = (): EnhancedBalanceData[] => {
    // If prop data is provided, use it (for testing/fallback)
    if (propData) {
      return propData;
    }

    if (
      !portfolioData?.data?.result ||
      portfolioData.status !== StatusEnum.ok
    ) {
      logger.error(
        'EnhancedPortfolioBalances: Error fetching portfolio data:',
        portfolioData?.reason
      );
      return [];
    }

    // Get the most recent snapshot (last item in the array)
    const timeSeries = portfolioData.data.result;
    const latestSnapshot = timeSeries[timeSeries.length - 1];
    if (!latestSnapshot?.assets) {
      return [];
    }

    // Build prices array focused on portfolio assets - fallback to snapshot-derived price
    const prices = latestSnapshot.assets.map((asset) => {
      const screenerCoin = findBestScreenerMatch(
        asset.name.toUpperCase(),
        screenerMap
      );
      const price =
        screenerCoin?.currentPrice ??
        (asset.amount > 0 ? asset.amountUsd / asset.amount : 0);
      return { symbol: asset.name, price };
    });

    // Build coin metadata for market cap categories and categories
    const coins = screener.map((sc) => ({
      symbol: sc.symbol.toLowerCase(),
      categories: sc.category || sc.category || [],
      market_cap_rank:
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sc as any).marketCapRank ?? (sc as any).market_cap_rank ?? 0,
    }));

    // If raw balances are available from getBalances prefer them (accurate free/locked)
    const balances =
      balancesResp && balancesResp.data && balancesResp.status === StatusEnum.ok
        ? (balancesResp.data as unknown as Array<{
            asset: string;
            free: string;
            locked: string;
            exchange?: string;
            exchangeUUID?: string;
            exchangeName?: string;
            // Venue-priced; `calculateEnhancedBalances` prefers these over the
            // screener-derived `prices` list below.
            price?: string | null;
            usdValue?: string | null;
          }>)
        : undefined;

    // Raw balances can carry exchange-normalized tickers (e.g. Hyperliquid Unit
    // aliases UBTC->BTC, USDT0->USDT) that differ from the snapshot asset names.
    // `calculateEnhancedBalances` prices each balance by matching its token
    // against `prices` (built above from snapshot names) by exact symbol, so an
    // aliased token the snapshot never had renders at $0.00 even though the
    // screener knows it (USDC is unaffected — same name everywhere). Add a
    // screener-derived price for every balance token not already in `prices`.
    if (balances) {
      const pricedSymbols = new Set(
        prices.map((p) => p.symbol.toUpperCase())
      );
      for (const b of balances) {
        const sym = (b.asset || '').toString();
        if (!sym || pricedSymbols.has(sym.toUpperCase())) continue;
        const coin = findBestScreenerMatch(sym.toUpperCase(), screenerMap);
        if (coin?.currentPrice != null) {
          prices.push({ symbol: sym, price: coin.currentPrice });
          pricedSymbols.add(sym.toUpperCase());
        }
      }
    }

    // Calculate enhanced balances with screener prices and coin metadata.
    // Pass raw balances when available so the calculation uses real free/used splits.
    return calculateEnhancedBalances(
      {
        portfolioAssets: latestSnapshot.assets,
        bots: allBots, // REAL BOT DATA - DCA + Combo bots
        exchanges,
        prices,
        coins,
        balances,
      },
      shouldSumBalance
    );
  };

  const data = getEnhancedBalanceData();

  // Available currencies (simplified for this widget)
  const availableCurrencies = useMemo(
    () => [
      { code: 'USD', name: 'US Dollar', symbol: '$', rate: 1 },
      { code: 'EUR', name: 'Euro', symbol: '€', rate: 0.85 },
      { code: 'GBP', name: 'British Pound', symbol: '£', rate: 0.73 },
      { code: 'JPY', name: 'Japanese Yen', symbol: '¥', rate: 110.0 },
    ],
    []
  );

  // Get currency conversion rate and formatting
  const getCurrencyInfo = useCallback(
    (currencyCode: string) => {
      const currency = availableCurrencies.find((c) => c.code === currencyCode);
      return currency || availableCurrencies[0];
    },
    [availableCurrencies]
  );

  // Format value in selected currency
  const formatValueInCurrency = useCallback(
    (value: number, showSymbol = true) => {
      if (privacyMode) {
        return '***';
      }
      const currencyInfo = getCurrencyInfo(selectedCurrency);
      const convertedValue = value * currencyInfo.rate;
      const formatted = convertedValue.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      return showSymbol ? `${currencyInfo.symbol}${formatted}` : formatted;
    },
    [selectedCurrency, getCurrencyInfo, privacyMode]
  );

  // A holding no price source could value must say so. Rendering it as $0.00
  // is a confident claim that a real balance is worthless, and it silently
  // understates every total it feeds.
  const formatRowValue = useCallback(
    (row: EnhancedBalanceData, value: number) =>
      row.priceUnavailable ? 'price unavailable' : formatValueInCurrency(value),
    [formatValueInCurrency]
  );

  // Handle bot legend popover
  const handleShowBotLegend = (balance: EnhancedBalanceData) => {
    setBotLegendPopover({ isOpen: true, balance });
  };

  // Memoize columns to prevent infinite renders
  const columns = useMemo<ColumnDef<EnhancedBalanceData>[]>(() => {
    const cols: ColumnDef<EnhancedBalanceData>[] = [
      {
        accessorKey: 'token',
        header: 'TOKEN',
        cell: ({ row }) => {
          const data = row.original;
          // Tokenized stocks arrive under a ledger code (Kraken `PGx.T`); map it
          // to the tradeable pair base so we can look up its class + name.
          const resolved = resolvePairAsset(
            data.exchange,
            balanceAssetToPairBase(data.token)
          );
          const assetName =
            resolved.displayName ||
            findBestScreenerMatch(data.token.toUpperCase(), screenerMap)?.name ||
            data.tokenName;
          return (
            <div className="flex items-center gap-sm">
              <CoinIcon
                symbol={data.token}
                size="w-8 h-8"
                assetClass={resolved.assetClass}
                exchange={resolved.exchange ?? data.exchange}
              />
              <div>
                <div className="text-sm font-medium text-foreground">
                  {data.token}
                </div>
                <div className="text-xs text-muted-foreground">{assetName}</div>
              </div>
            </div>
          );
        },
        enableSorting: true,
        filterFn: 'includesString',
        meta: { filterType: 'string' },
      },
    ];

    // Exchange column (CRITICAL MISSING FEATURE)
    if (showExchange && !shouldSumBalance) {
      cols.push({
        accessorKey: 'exchangeUUID',
        header: 'EXCHANGE',
        cell: ({ row }) => {
          const data = row.original;
          const exchangeId = data.exchangeUUID || data.exchange || '';
          return exchangeId ? (
            <ExchangeChip exchangeId={exchangeId} size="sm" chipStyle="soft" />
          ) : null;
        },
        enableSorting: true,
        meta: { filterType: 'string' },
      });
    }

    // Free balance column (NOT IN LIMIT)
    cols.push({
      accessorKey: 'freeUsd',
      header: 'NOT IN LIMIT',
      cell: ({ row }) => {
        const amount = row.original.free;
        const token = row.original.token;
        const freeUsd = row.original.freeUsd;

        return (
          <div className="text-right">
            <div className="text-sm font-medium text-foreground">
              {formatTokenAmount(amount)}
            </div>
            <div className="text-xs text-muted-foreground">
              {token} • {formatRowValue(row.original, freeUsd)}
            </div>
          </div>
        );
      },
      enableSorting: true,
      sortingFn: 'basic',
      meta: {
        filterType: 'number',
        enableTotalsRow: true,
        totalsDefaultAggregation: 'sum' as const,
        totalsValueFn: (row: EnhancedBalanceData) => row.freeUsd || 0,
      },
      footerValue: (value: number) => formatValueInCurrency(value),
    });

    // Used balance column (IN LIMIT)
    cols.push({
      accessorKey: 'usedUsd',
      header: 'IN LIMIT',
      cell: ({ row }) => {
        const amount = row.original.used;
        const token = row.original.token;
        const usedUsd = row.original.usedUsd;

        return (
          <div className="text-right">
            <div className="text-sm font-medium text-foreground">
              {formatTokenAmount(amount)}
            </div>
            <div className="text-xs text-muted-foreground">
              {token} • {formatRowValue(row.original, usedUsd)}
            </div>
          </div>
        );
      },
      enableSorting: true,
      sortingFn: 'basic',
      meta: {
        filterType: 'number',
        enableTotalsRow: true,
        totalsDefaultAggregation: 'sum' as const,
        totalsValueFn: (row: EnhancedBalanceData) => row.usedUsd || 0,
      },
      footerValue: (value: number) => formatValueInCurrency(value),
    });

    // Total balance column
    cols.push({
      accessorKey: 'totalUsd',
      header: 'TOTAL',
      cell: ({ row }) => {
        const amount = row.original.total;
        const token = row.original.token;
        const totalUsd = row.original.totalUsd;

        return (
          <div className="text-right">
            <div className="text-sm font-medium text-foreground">
              {formatTokenAmount(amount)}
            </div>
            <div className="text-xs text-muted-foreground">
              {token} • {formatRowValue(row.original, totalUsd)}
            </div>
          </div>
        );
      },
      enableSorting: true,
      sortingFn: 'basic',
      meta: {
        filterType: 'number',
        enableTotalsRow: true,
        totalsDefaultAggregation: 'sum' as const,
        totalsValueFn: (row: EnhancedBalanceData) => row.totalUsd || 0,
      },
      footerValue: (value: number) => formatValueInCurrency(value),
    });

    // Bot usage columns (CRITICAL MISSING FEATURE)
    if (showBotUsage) {
      cols.push({
        accessorKey: 'requiredUsd',
        header: 'MAX BOT USAGE',
        cell: ({ row }) => {
          const amount = row.original.required;
          const requiredUsd = row.original.requiredUsd;
          const requiredRatio = row.original.requiredRatio;
          const legend = row.original.legend || [];
          const hasLegend = legend.length > 0;

          return (
            <div className="text-right">
              <div className="flex items-center justify-end gap-1">
                <div>
                  <div className="text-sm font-medium text-foreground">
                    {formatTokenAmount(amount)}
                  </div>
                  {requiredRatio > 0 && (
                    <div
                      className={`text-xs font-medium ${
                        requiredRatio > 100 ? 'text-red-600' : 'text-yellow-600'
                      }`}
                    >
                      {formatPercentage(requiredRatio)}
                    </div>
                  )}
                </div>
                {hasLegend && (
                  <Popover
                    open={
                      botLegendPopover.isOpen &&
                      botLegendPopover.balance?.id === row.original.id
                    }
                    onOpenChange={(open) => {
                      if (!open) {
                        setBotLegendPopover({ isOpen: false, balance: null });
                      }
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="p-0"
                        onClick={() => handleShowBotLegend(row.original)}
                      >
                        <Info className="h-3 w-3" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80">
                      <div className="space-y-xs">
                        <h4 className="font-medium text-sm">
                          Bot Usage Details
                        </h4>
                        {legend.map((item, index) => (
                          <div
                            key={`${item.id}-${index}`}
                            className="flex justify-between items-center text-xs"
                          >
                            <span className="text-muted-foreground">
                              {item.type.toUpperCase()}: {item.name}
                            </span>
                            <span className="font-medium">{item.amount}</span>
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatRowValue(row.original, requiredUsd)}
              </div>
            </div>
          );
        },
        enableSorting: true,
        sortingFn: 'basic',
        meta: {
          filterType: 'number',
          enableTotalsRow: true,
          totalsDefaultAggregation: 'sum' as const,
          totalsValueFn: (row: EnhancedBalanceData) => row.requiredUsd || 0,
        },
        footerValue: (value: number) => formatValueInCurrency(value),
      });

      cols.push({
        accessorKey: 'plannedUsd',
        header: 'PLANNED',
        cell: ({ row }) => {
          const amount = row.original.planned;
          const token = row.original.token;
          const plannedUsd = row.original.plannedUsd;

          return (
            <div className="text-right">
              <div className="text-sm font-medium text-foreground">
                {formatTokenAmount(amount)}
              </div>
              <div className="text-xs text-muted-foreground">
                {token} • {formatRowValue(row.original, plannedUsd)}
              </div>
            </div>
          );
        },
        enableSorting: true,
        sortingFn: 'basic',
        meta: {
          filterType: 'number',
          enableTotalsRow: true,
          totalsDefaultAggregation: 'sum' as const,
          totalsValueFn: (row: EnhancedBalanceData) => row.plannedUsd || 0,
        },
        footerValue: (value: number) => formatValueInCurrency(value),
      });

      cols.push({
        accessorKey: 'freeAndOverUsd',
        header: 'FREE',
        cell: ({ row }) => {
          const amount = row.original.freeAndOver;
          const token = row.original.token;
          const freeAndOverUsd = row.original.freeAndOverUsd;
          const isNegative = amount < 0;

          return (
            <div className="text-right">
              <div
                className={`text-sm font-medium ${
                  isNegative ? 'text-red-600' : 'text-foreground'
                }`}
              >
                {formatTokenAmount(amount)}
              </div>
              <div className="text-xs text-muted-foreground">
                {token} • {formatRowValue(row.original, freeAndOverUsd)}
              </div>
            </div>
          );
        },
        enableSorting: true,
        sortingFn: 'basic',
        meta: {
          filterType: 'number',
          enableTotalsRow: true,
          totalsDefaultAggregation: 'sum' as const,
          totalsValueFn: (row: EnhancedBalanceData) => row.freeAndOverUsd || 0,
        },
        footerValue: (value: number) => formatValueInCurrency(value),
      });
    }

    // Current price column
    cols.push({
      accessorKey: 'currentPrice',
      header: 'CURRENT PRICE',
      cell: ({ row, getValue }) => {
        const price = getValue() as number;
        const currencyInfo = getCurrencyInfo(selectedCurrency);
        const convertedPrice = price * currencyInfo.rate;
        const formattedPrice = row.original.priceUnavailable
          ? 'price unavailable'
          : formatPriceWithPrecision(convertedPrice, currencyInfo.symbol);

        return (
          <div className="text-right">
            <div
              className={
                row.original.priceUnavailable
                  ? 'text-xs text-muted-foreground'
                  : 'text-sm font-medium text-foreground'
              }
              title={
                row.original.priceUnavailable
                  ? 'Neither the exchange nor the market screener publishes a USD rate for this asset, so its value cannot be calculated.'
                  : undefined
              }
            >
              {formattedPrice}
            </div>
          </div>
        );
      },
      enableSorting: true,
      sortingFn: 'basic',
      meta: { filterType: 'number' },
    });

    // Categories column (MISSING FEATURE)
    if (showCategories) {
      cols.push({
        accessorKey: 'categories',
        header: 'CATEGORIES',
        cell: ({ getValue }) => {
          const categories = (getValue() as string[]) || [];
          return (
            <div className="text-sm text-foreground">
              {categories.length > 0
                ? categories.slice(0, 2).join(', ')
                : 'N/A'}
              {categories.length > 2 && '...'}
            </div>
          );
        },
        enableSorting: false,
        meta: { filterType: 'string' },
      });
    }

    // Market cap category column (MISSING FEATURE)
    if (showMarketCap) {
      cols.push({
        accessorKey: 'marketCapCategory',
        header: 'MARKET CAP',
        cell: ({ getValue }) => {
          const category = getValue() as string;
          return (
            <div className="text-sm text-foreground">
              {category || 'Unknown'}
            </div>
          );
        },
        enableSorting: true,
        meta: { filterType: 'string' },
      });
    }

    return cols;
  }, [
    showExchange,
    shouldSumBalance,
    showCategories,
    showMarketCap,
    showBotUsage,
    formatValueInCurrency,
    formatRowValue,
    botLegendPopover.isOpen,
    botLegendPopover.balance?.id,
    screenerMap,
    selectedCurrency,
    getCurrencyInfo,
    resolvePairAsset,
  ]);

  // Filter portfolio data based on selected coins and selected exchanges
  const filteredData = useMemo(() => {
    let filtered = data;

    // Apply coin filter
    if (!selectedCoins.includes('ALL')) {
      filtered = filtered.filter((item) => selectedCoins.includes(item.token));
    }

    // Apply exchange filter
    if (!selectedExchanges.includes('ALL')) {
      filtered = filtered.filter((item) => {
        const exchangeId = item.exchangeUUID || item.exchange || '';
        return exchangeId ? selectedExchanges.includes(exchangeId) : false;
      });
    }

    return filtered;
  }, [data, selectedCoins, selectedExchanges]);

  // Dynamic height calculation (CRITICAL MISSING FEATURE - FIXED)
  const calculateDynamicHeight = () => {
    // More accurate height calculations
    const widgetHeaderHeight = 60; // Widget wrapper header
    const balanceControlsHeight = 160; // Balance settings + search
    const dataTableToolbarHeight = 60; // DataTable toolbar (search, buttons)
    const dataTableHeaderHeight = 48; // Table header row
    const rowHeight = 56; // Each data row
    const paginationHeight = showPagination ? 60 : 0; // Pagination controls
    const padding = 48; // Total padding (widget + content)

    // Calculate based on actual data rows (minimum 5 rows for usability)
    const dataRows = Math.max(filteredData.length, 5);
    const maxVisibleRows = Math.min(dataRows, 15); // Show more rows, up to 15

    const totalContentHeight =
      widgetHeaderHeight +
      balanceControlsHeight +
      dataTableToolbarHeight +
      dataTableHeaderHeight +
      maxVisibleRows * rowHeight +
      paginationHeight +
      padding;

    // More generous height limits
    const minHeight = 500; // Increased minimum
    const maxHeight = window.innerWidth < 768 ? 600 : 1000; // Increased maximum

    const finalHeight = Math.min(
      Math.max(totalContentHeight, minHeight),
      maxHeight
    );

    logger.info('Dynamic Height Calculation:', {
      dataRows,
      maxVisibleRows,
      totalContentHeight,
      finalHeight,
      showPagination,
    });

    return {
      height: `${finalHeight}px`,
      minHeight: `${minHeight}px`,
      maxHeight: `${maxHeight}px`,
    };
  };

  const dynamicHeight = calculateDynamicHeight();

  // Calculate total portfolio value
  const totalPortfolioValue = filteredData.reduce(
    (sum, item) => sum + item.totalUsd,
    0
  );

  // Calculate portfolio change from time series data (same logic as PortfolioValue)
  const getPortfolioChange = () => {
    if (
      !portfolioData?.data?.result ||
      portfolioData.status !== StatusEnum.ok ||
      portfolioData.data.result.length < 2
    ) {
      return {
        value: 0,
        percentage: 0,
        isPositive: true,
      };
    }

    const timeSeries = portfolioData.data.result;
    const currentSnapshot = timeSeries[timeSeries.length - 1];
    const previousSnapshot = timeSeries[timeSeries.length - 2];

    const currentValue = currentSnapshot?.totalUsd || 0;
    const previousValue = previousSnapshot?.totalUsd || 0;
    const changeValue = currentValue - previousValue;
    const changePercent =
      previousValue > 0 ? (changeValue / previousValue) * 100 : 0;

    return {
      value: changeValue,
      percentage: Math.round(changePercent * 100) / 100,
      isPositive: changeValue >= 0,
    };
  };

  // Exchange management functions
  const handleExchangeToggle = (exchangeId: string) => {
    if (exchangeId === 'ALL') {
      if (selectedExchanges.includes('ALL') && selectedExchanges.length === 1) {
        return;
      }
      if (!selectedExchanges.includes('ALL')) {
        setSelectedExchanges(['ALL']);
        if (portfolioContext?.setSelectedExchanges) {
          portfolioContext.setSelectedExchanges(['ALL']);
        }
        return;
      }
    }

    if (selectedExchanges.includes(exchangeId)) {
      const newSelectedExchanges = selectedExchanges.filter(
        (e) => e !== exchangeId
      );
      if (newSelectedExchanges.length === 0) {
        setSelectedExchanges(['ALL']);
        if (portfolioContext?.setSelectedExchanges) {
          portfolioContext.setSelectedExchanges(['ALL']);
        }
      } else {
        const filteredExchanges = newSelectedExchanges.filter(
          (e) => e !== 'ALL'
        );
        const updated =
          filteredExchanges.length > 0 ? filteredExchanges : ['ALL'];
        setSelectedExchanges(updated);
        if (portfolioContext?.setSelectedExchanges) {
          portfolioContext.setSelectedExchanges(updated);
        }
      }
    } else {
      const newSelections = selectedExchanges.filter((e) => e !== 'ALL');
      const updated = [...newSelections, exchangeId];
      setSelectedExchanges(updated);
      if (portfolioContext?.setSelectedExchanges) {
        portfolioContext.setSelectedExchanges(updated);
      }
    }
  };

  const handleRemoveExchange = (exchangeId: string) => {
    if (exchangeId === 'ALL' && selectedExchanges.length === 1) {
      return;
    }

    const newSelectedExchanges = selectedExchanges.filter(
      (e) => e !== exchangeId
    );
    if (newSelectedExchanges.length === 0) {
      setSelectedExchanges(['ALL']);
      if (portfolioContext?.setSelectedExchanges) {
        portfolioContext.setSelectedExchanges(['ALL']);
      }
    } else {
      setSelectedExchanges(newSelectedExchanges);
      if (portfolioContext?.setSelectedExchanges) {
        portfolioContext.setSelectedExchanges(newSelectedExchanges);
      }
    }
  };

  // Prepare coin data for ListModal
  const modalItems = useMemo(() => {
    const availableTokens = [
      {
        symbol: 'ALL',
        name: 'All Tokens',
        icon: '📊',
        color: 'var(--color-primary)',
        subtitle: 'Show all tokens',
      },
      ...Array.from(new Set(data.map((item) => item.token))).map((token) => {
        const item = data.find((d) => d.token === token);
        return {
          symbol: token,
          name: item?.tokenName || token,
          icon: item?.icon || '🪙',
          color: item?.color || 'var(--color-muted-foreground)',
          subtitle: `Filter by ${token}`,
        };
      }),
    ];
    return availableTokens;
  }, [data]);

  // Handle coin toggle
  const handleCoinToggle = (coinSymbol: string) => {
    setSelectedCoins((prev) => {
      if (coinSymbol === 'ALL') {
        return ['ALL'];
      } else {
        const withoutAll = prev.filter((symbol) => symbol !== 'ALL');
        if (withoutAll.includes(coinSymbol)) {
          const newSelection = withoutAll.filter(
            (symbol) => symbol !== coinSymbol
          );
          return newSelection.length === 0 ? ['ALL'] : newSelection;
        } else {
          return [...withoutAll, coinSymbol];
        }
      }
    });
  };

  const isLoading = _isLoading || isLoadingScreener;

  const content = (
    <div
      className="flex flex-col h-full"
      style={
        propHeight
          ? {} // when caller wants a specific height we let outer wrapper handle sizing
          : { minHeight: dynamicHeight.minHeight }
      }
    >
      {/* Enhanced Controls (CRITICAL MISSING FEATURE) */}

      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="relative h-full">
          <DataTable
            tableId={`enhanced-portfolio-balances-${widgetId}`}
            columns={columns}
            data={filteredData}
            enableGlobalFilter={true}
            enableColumnFilters={true}
            enableSorting={true}
            sorting={isSortingLoaded ? sorting : []}
            onSortingChange={isSortingLoaded ? setSorting : () => {}}
            showPagination={showPagination}
            className="h-full"
            emptyMessage="No portfolio data found."
            customToolbarActions={
              <div className="flex items-center gap-xs">
                <div className="flex items-center gap-xs mr-4">
                  <label
                    className={`text-sm font-medium ${
                      isSingleExchangeSelected
                        ? 'text-muted-foreground'
                        : 'text-foreground'
                    }`}
                  >
                    Aggregate
                  </label>
                  <Switch
                    checked={shouldSumBalance}
                    onCheckedChange={setShouldSumBalance}
                    disabled={isSingleExchangeSelected}
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => setShowCoinDialog(true)}
                  className="h-9 px-3 flex items-center gap-xs border-2 border-border bg-inner-container hover:bg-muted hover:border-border text-card-foreground shadow-md transition-all duration-200"
                  title="Filter tokens"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Filter Tokens</span>
                </Button>
              </div>
            }
          />

          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 backdrop-blur-sm">
              <svg
                className="animate-spin h-8 w-8 text-muted-foreground"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12a9 9 0 11-6.219-8.56" />
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Enhanced Options Dialog handled by WidgetWrapper */}

      {/* Token Selection Modal */}
      <ListModal
        isOpen={showCoinDialog}
        onClose={() => setShowCoinDialog(false)}
        title="Filter Portfolio Tokens"
        items={modalItems}
        selectedItems={selectedCoins}
        onItemToggle={handleCoinToggle}
        searchPlaceholder="Search tokens..."
      />
    </div>
  );

  // Portfolio value for header
  const portfolioChange = getPortfolioChange();
  const portfolioValue = {
    primary: totalPortfolioValue,
    secondary: selectedCurrency,
    change: portfolioChange,
  };

  // Check if any filters are active (not default state)
  const filtersActive =
    !selectedExchanges.includes('ALL') ||
    selectedExchanges.length > 1 ||
    !selectedCoins.includes('ALL') ||
    selectedCoins.length > 1;

  // Clear all filters to default state
  const clearAllFilters = () => {
    setSelectedExchanges(['ALL']);
    setSelectedCoins(['ALL']);
    if (portfolioContext?.setSelectedExchanges) {
      portfolioContext.setSelectedExchanges(['ALL']);
    }
  };

  // Create exchange filter items for the generic filter system
  const exchangeFilterItems: FilterItem[] = exchanges
    .filter((exchange) => exchange.id !== 'ALL')
    .map((exchange) => ({
      id: exchange.id,
      name: exchange.name,
      icon: exchange.icon,
      color: exchange.color || 'var(--color-muted-foreground)',
    }));

  // Create filter content using the generic filter system
  const filterContent = (
    <div className="space-y-md">
      <FilterSection
        title="Exchanges"
        selectedItems={selectedExchanges}
        availableItems={exchangeFilterItems}
        onItemRemove={handleRemoveExchange}
        onShowDialog={() => setShowExchangeDialog(true)}
        addButtonText="Add exchanges"
        showAllOption={true}
      />

      <SelectionDialog
        isOpen={showExchangeDialog}
        onClose={() => setShowExchangeDialog(false)}
        title="Exchanges"
        items={exchangeFilterItems}
        selectedItems={selectedExchanges}
        onItemToggle={handleExchangeToggle}
        showAllOption={true}
      />
    </div>
  );

  // Build style object once, taking into account optional height override.
  const computedStyle: React.CSSProperties = allowResize
    ? {}
    : propHeight
      ? {
          // honor explicit height; when height is 'auto' we simply set it and avoid
          // the dynamic calculations entirely (no minHeight/maxHeight needed).
          height:
            typeof propHeight === 'number' ? `${propHeight}px` : propHeight,
        }
      : {
          height: dynamicHeight.height,
          minHeight: dynamicHeight.minHeight,
          maxHeight: dynamicHeight.maxHeight,
          // Ensure the widget has enough space for content
          overflow: 'hidden',
        };

  const wrapperProps = {
    metadata: {
      ...getWidgetMetadata('portfolio-balances'),
      id: widgetId,
      title: customName || 'Enhanced Portfolio Balances',
      displayName: customName || 'Enhanced Portfolio Balances',
      value: portfolioValue,
      hasOptions: true,
      hasFilters: true,
      filterContent,
      filtersActive,
      onClearFilters: clearAllFilters,
    },
    isEditable: isEditable ?? false,
    isCollapsible,
    style: computedStyle,
    customName,
    onCustomNameChange: setCustomName,
    showOptionsDialog,
    onCloseOptionsDialog: () => setShowOptionsDialog(false),
    optionsTitle: 'Enhanced Balance Options',
    renderOptionsContent: () => (
      <div className="space-y-md">
        {/* Column Visibility Controls */}
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">
            Column Visibility
          </label>
          <div className="space-y-xs">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">Exchange</span>
              <Switch
                checked={showExchange}
                onCheckedChange={setShowExchange}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">Categories</span>
              <Switch
                checked={showCategories}
                onCheckedChange={setShowCategories}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">Market Cap</span>
              <Switch
                checked={showMarketCap}
                onCheckedChange={setShowMarketCap}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">Bot Usage</span>
              <Switch
                checked={showBotUsage}
                onCheckedChange={setShowBotUsage}
              />
            </div>
          </div>
        </div>

        {/* Currency Selection */}
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">
            Display Currency
          </label>
          <div className="space-y-xs">
            {availableCurrencies.map((currency) => (
              <div
                key={currency.code}
                className="flex items-center justify-between p-xs rounded hover:bg-muted/50 cursor-pointer"
                onClick={() => {
                  setSelectedCurrency(currency.code);
                }}
              >
                <div className="flex items-center gap-sm">
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
                    {currency.symbol}
                  </div>
                  <div>
                    <div className="text-foreground font-medium text-sm">
                      {currency.code}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {currency.name}
                    </div>
                  </div>
                </div>
                {selectedCurrency === currency.code && (
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <svg
                      className="w-3 h-3 text-primary-foreground"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    ...(onRemove && { onRemove }),
    ...(onSettings && { onSettings }),
    ...(onCollapse && { onCollapse }),
    ...(onTabMove && { onTabMove }),
    menuActions: {
      ...menuActions,
      ...(isEditable && { onOptions: () => setShowOptionsDialog(true) }),
    },
    cacheQueries: [
      {
        queryKey: 'getPortfolioByUser',
        variables: {} as Record<string, unknown>,
      },
    ],
  };

  return (
    <>
      <WidgetWrapper {...wrapperProps}>{content}</WidgetWrapper>

      {/* Export Dialog (CRITICAL MISSING FEATURE) */}
      <ExportDialog
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        data={filteredData}
        totalRows={filteredData.length}
      />
    </>
  );
};

export default EnhancedPortfolioBalances;
