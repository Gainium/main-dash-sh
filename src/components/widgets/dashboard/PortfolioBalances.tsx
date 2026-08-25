import { useGraphQL } from '@/hooks/useGraphQL';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { GraphQlQuery } from '@/lib/api';
import { StatusEnum, type Asset, type ScreenerCoinData } from '@/types';
import { formatPriceWithPrecision } from '@/utils/formatters';
import {
  buildScreenerSymbolMap,
  findBestScreenerMatch,
} from '@/utils/portfolioScreenerMatching';
import { useQuery } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { getWidgetMetadata } from '.';
import { useBalanceStore } from '@/stores/live';
import { PortfolioContext } from '../../../contexts/PortfolioContext';
import {
  useWidgetSettings,
  type PortfolioWidgetSettings,
} from '../../../hooks/useWidgetSettings';
import { useUIStore } from '../../../stores/uiStore';
import { Button } from '../../ui/button';
import { ExchangeChip } from '../../ui/chip';
import { DataTable } from '../../ui/data-table/data-table';
import { WidgetWrapper, type WidgetMenuActions } from '../WidgetWrapper';
import CoinIcon from '../shared/CoinIcon';
import { ListModal } from '../shared/ListModal';
import {
  FilterSection,
  SelectionDialog,
  type FilterItem,
} from '../shared/WidgetFilterArea';
import { useTransformedExchangesFromContext } from '@/contexts/ExchangeDataContext';

export interface PortfolioBalancesProps {
  widgetId?: string;
  data?: Asset[];
  showPagination?: boolean;
  isEditable?: boolean;
  isCollapsible?: boolean;
  allowResize?: boolean; // Controls whether height styles are applied (for grid layouts)
  height?: string | number;
  onRemove?: () => void;
  onSettings?: () => void;
  onCollapse?: (widgetId: string, collapsed: boolean) => void;
  onTabMove?: (
    fromTabId: string,
    toWidgetId: string,
    toTabIndex: number
  ) => void;
  menuActions?: WidgetMenuActions;
}

// `usdValue` is *replaced*, not intersected: `Asset.usdValue` is
// `string | null` (the venue publishes no rate), and intersecting that with
// `string | number` collapses to `string` — which neither an `Asset` handed in
// via `propData` nor the computed numeric valuation below can satisfy. Omit it
// from the base and widen it here to cover both sources.
type BalanceRow = Omit<Asset, 'usdValue'> & {
  total?: string | number;
  usdValue?: string | number | null;
  // No price source could value this holding - neither the venue's own rate
  // table nor the screener. Distinct from a genuine zero.
  priceUnavailable?: boolean;
};

const PortfolioBalances: React.FC<PortfolioBalancesProps> = ({
  widgetId = 'portfolio-balances',
  data: propData,
  showPagination = true,
  isEditable = false,
  isCollapsible = true,
  allowResize = true, // Default to true for grid layouts
  height = '400px',
  onRemove,
  onSettings,
  onCollapse,
  onTabMove,
  menuActions,
}) => {
  // GraphQL balance data fetching (same query names/types as main-dash)
  const { data: balancesData, isLoading: isLoadingBalances } = useGraphQL<
    BalanceRow[]
  >(
    'getBalances',
    GraphQlQuery.getBalances(
      {
        shouldSumBalance: false,
        includeUsdValues: true,
      },
      // `price`/`usdValue` are only returned when `includeUsdValues` is set, and
      // both require main-app core >= 1.53.5. Selecting a field the schema lacks
      // is a validation error that fails the whole query, so an older backend is
      // served the previous document (see `fallbackQuery` below) and the widget
      // degrades to screener pricing instead of showing no balances at all.
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

  // Subscribe to the raw balances slice for real-time balance updates. The
  // memoized LiveUpdateContext no longer re-renders on store writes, so a
  // render-time getBalances() read (used inside the balancesRows memo below)
  // would stay frozen while socket 'balance' events update the store.
  const liveBalances = useBalanceStore((s) => s.balances);

  // Get real exchange data from the shared hook
  const { exchanges } = useTransformedExchangesFromContext();

  const portfolioContext = useContext(PortfolioContext);
  // Use fallback when portfolio context is not available (e.g., in dashboard)
  const selectedExchangeContext = useMemo(
    () =>
      portfolioContext?.selectedExchanges &&
      portfolioContext.selectedExchanges.length
        ? portfolioContext.selectedExchanges
        : ['ALL'],
    [portfolioContext?.selectedExchanges]
  );

  const parseMaybeNumber = useCallback((value: unknown): number => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }, []);

  const getRowTotals = useCallback(
    // Takes the table's own row shape: every caller passes a `BalanceRow`, and
    // a plain `Asset` still satisfies it.
    (row: BalanceRow) => {
      const free = parseMaybeNumber(row.free);
      const locked = parseMaybeNumber(row.locked);
      const total =
        parseMaybeNumber((row as unknown as { total?: unknown }).total) ||
        free + locked;
      const usdValue =
        parseMaybeNumber((row as unknown as { usdValue?: unknown }).usdValue) ||
        0;
      const price = total > 0 ? usdValue / total : 0;
      return {
        free,
        locked,
        total,
        usdValue,
        price,
        priceUnavailable: Boolean(
          (row as unknown as { priceUnavailable?: boolean }).priceUnavailable
        ),
        freeUsd: free * price,
        lockedUsd: locked * price,
      };
    },
    [parseMaybeNumber]
  );

  // Screener data to derive current prices
  const { data: screenerResp, isLoading: isLoadingScreener } = useQuery({
    queryKey: ['screener', 'all'],
    queryFn: async () => {
      const apiEndpoint =
        import.meta.env.VITE_API_ENDPOINT || 'https://api.gainium.io';
      const resp = await fetchWithTimeout(`${apiEndpoint}/api/screener`, {
        method: 'POST',
        body: JSON.stringify({ page: 0, pageSize: 500 }),
        headers: { 'Content-type': 'application/json' },
      });
      if (!resp.ok) throw new Error('Failed screener');
      const json = await resp.json();
      if (json.status === StatusEnum.notok) throw new Error(json.reason);
      return {
        status: StatusEnum.ok,
        data: { result: json.data?.result || [] },
      };
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 30 * 1000,
  });

  // Venue-published USD rates from getBalances(includeUsdValues), keyed by
  // exchange + asset with an asset-level fallback for rows that have lost their
  // exchange (live socket updates carry no rate of their own). This is the
  // authoritative price: it is the exchange's own rate for the exact holding,
  // so it survives a coin the screener carries under a different symbol after
  // an upstream rebrand, or does not carry at all.
  const venueRates = useMemo(() => {
    const rates = new Map<string, number>();
    if (!balancesData?.data || balancesData.status !== StatusEnum.ok) {
      return rates;
    }
    for (const row of balancesData.data) {
      const rate = parseMaybeNumber(row.price);
      if (rate <= 0) continue;
      const asset = String(row.asset ?? '').toUpperCase();
      rates.set(`${row.exchangeUUID ?? ''}::${asset}`, rate);
      if (!rates.has(asset)) rates.set(asset, rate);
    }
    return rates;
  }, [balancesData, parseMaybeNumber]);

  const venueRateFor = useCallback(
    (exchangeUUID: string | undefined, asset: string) => {
      const key = asset.toUpperCase();
      return (
        venueRates.get(`${exchangeUUID ?? ''}::${key}`) ?? venueRates.get(key)
      );
    },
    [venueRates]
  );

  // Calculate balance data reactively based on live updates + GraphQL, priced
  // off the venue's own rate with the screener kept only as a fallback.
  const data = useMemo((): BalanceRow[] => {
    // If prop data is provided, use it (for testing/fallback)
    if (propData) {
      return propData;
    }

    const screener = (screenerResp?.data?.result || []) as ScreenerCoinData[];
    const screenerMap = buildScreenerSymbolMap(screener);

    // One price ladder for both sources: the venue's rate for this exact
    // holding, then the screener's symbol match, then whatever USD value the
    // row already carried. Nothing left at the end of it means genuinely
    // unpriceable, which the table must say rather than render as $0.00 -
    // a confident claim that a real balance is worth nothing, and one that
    // silently understates every total it feeds.
    const priceRow = (
      row: { asset: string; exchangeUUID?: string; usdValue?: unknown },
      total: number
    ): { usdValue: number; priceUnavailable: boolean } => {
      const rate =
        venueRateFor(row.exchangeUUID, String(row.asset)) ??
        findBestScreenerMatch(String(row.asset).toUpperCase(), screenerMap)
          ?.currentPrice;
      if (rate && total > 0) {
        return { usdValue: rate * total, priceUnavailable: false };
      }
      const carried = parseMaybeNumber(row.usdValue);
      return { usdValue: carried, priceUnavailable: carried <= 0 && total > 0 };
    };

    // Prefer live balance data when available
    if (liveBalances && liveBalances.length > 0) {
      return liveBalances.map((b) => {
        const total =
          parseMaybeNumber((b as unknown as { total?: unknown }).total) ||
          parseMaybeNumber(b.free) + parseMaybeNumber(b.locked);

        return {
          asset: b.asset,
          free: String(parseMaybeNumber(b.free)),
          locked: String(parseMaybeNumber(b.locked)),
          exchange: String(
            (b as unknown as { exchange?: string }).exchange ?? ''
          ),
          exchangeUUID: b.exchangeUUID,
          exchangeName: String(
            (b as unknown as { exchangeName?: string }).exchangeName ?? ''
          ),
          total,
          ...priceRow(b, total),
        };
      });
    }

    // GraphQL fallback
    if (!balancesData?.data || balancesData.status !== StatusEnum.ok) {
      return [];
    }

    return (balancesData.data || []).map((row) => {
      const total =
        parseMaybeNumber((row as unknown as { total?: unknown }).total) ||
        parseMaybeNumber(row.free) + parseMaybeNumber(row.locked);

      return {
        ...row,
        total,
        ...priceRow(row, total),
      } as BalanceRow;
    });
  }, [
    balancesData,
    liveBalances,
    parseMaybeNumber,
    propData,
    screenerResp,
    venueRateFor,
  ]);

  // Use the generic widget settings hook with type safety
  const { usePersistedState } =
    useWidgetSettings<PortfolioWidgetSettings>(widgetId);

  // Get privacy mode state
  const privacyMode = useUIStore((s) => s.privacyMode);

  // Persisted settings for this widget instance
  const [selectedExchanges, setSelectedExchanges] = usePersistedState(
    'selectedExchanges',
    ['ALL']
  );
  const [selectedCurrency, setSelectedCurrency] = useState('USD');
  const [customName, setCustomName] = usePersistedState('customName', '');
  const [showOptionsDialog, setShowOptionsDialog] = useState(false);
  const [showExchangeDialog, setShowExchangeDialog] = useState(false);

  // Sync with portfolio-level exchange selection when page context changes
  useEffect(() => {
    const contextSelections = selectedExchangeContext;
    const areEqual =
      contextSelections.length === selectedExchanges.length &&
      contextSelections.every((val, idx) => val === selectedExchanges[idx]);
    if (!areEqual) {
      setSelectedExchanges(contextSelections);
    }
  }, [selectedExchangeContext, selectedExchanges, setSelectedExchanges]);

  // Listen for external options open events (e.g., from widget manager)
  useEffect(() => {
    const handleOpenOptions = (event: CustomEvent) => {
      if (event.detail.widgetId === widgetId) {
        setShowOptionsDialog(true);
      }
    };

    window.addEventListener(
      'openWidgetOptions',
      handleOpenOptions as EventListener
    );
    return () => {
      window.removeEventListener(
        'openWidgetOptions',
        handleOpenOptions as EventListener
      );
    };
  }, [widgetId]);

  // Exchange management functions for this specific widget
  const handleExchangeToggle = (exchangeId: string) => {
    if (exchangeId === 'ALL') {
      // If ALL is being toggled off and it's the only selection, don't allow it
      if (selectedExchanges.includes('ALL') && selectedExchanges.length === 1) {
        return; // Prevent removing ALL if it's the only option
      }
      // If ALL is being toggled on, remove all other selections
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
      // If toggling off this exchange would result in an empty array, automatically select "ALL"
      if (newSelectedExchanges.length === 0) {
        setSelectedExchanges(['ALL']);
      } else {
        // If we're adding a specific exchange, remove "ALL" from the list
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
      // If we're adding a specific exchange, remove "ALL" from the list
      const newSelections = selectedExchanges.filter((e) => e !== 'ALL');
      const updated = [...newSelections, exchangeId];
      setSelectedExchanges(updated);
      if (portfolioContext?.setSelectedExchanges) {
        portfolioContext.setSelectedExchanges(updated);
      }
    }
  };

  const handleRemoveExchange = (exchangeId: string) => {
    // Special handling for "ALL" option
    if (exchangeId === 'ALL' && selectedExchanges.length === 1) {
      return; // Prevent removing ALL if it's the only option
    }

    const newSelectedExchanges = selectedExchanges.filter(
      (e) => e !== exchangeId
    );
    // If removing this exchange would result in an empty array, automatically select "ALL"
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

  // State for coin selection dialog
  const [showCoinDialog, setShowCoinDialog] = useState(false);
  const [selectedCoins, setSelectedCoins] = useState<string[]>(['ALL']);

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
      ...Array.from(new Set(data.map((item) => item.asset))).map((token) => {
        const item = data.find((d) => d.asset === token);
        return {
          symbol: token,
          name: item?.asset || token,
          icon: '🪙',
          color: 'var(--color-muted-foreground)',
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

  // Filter portfolio data based on selected coins
  const filteredData = useMemo(() => {
    const afterCoinFilter = selectedCoins.includes('ALL')
      ? data
      : data.filter((item) => selectedCoins.includes(item.asset));

    if (selectedExchanges.includes('ALL')) {
      return afterCoinFilter;
    }

    return afterCoinFilter.filter((item) => {
      const exchangeId = item.exchangeUUID || item.exchange || '';
      return exchangeId ? selectedExchanges.includes(exchangeId) : false;
    });
  }, [data, selectedCoins, selectedExchanges]);

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
      if (privacyMode) return '***';
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

  // Format token amount
  const formatTokenAmount = useCallback(
    (amount: number) => {
      if (privacyMode) return '***';
      if (amount == null || isNaN(amount)) {
        return 'N/A'; // Return 'N/A' for undefined or invalid amounts
      }
      if (amount < 0.001) {
        return amount.toFixed(8);
      } else if (amount < 1) {
        return amount.toFixed(6);
      } else if (amount < 100) {
        return amount.toFixed(4);
      } else {
        return amount.toFixed(2);
      }
    },
    [privacyMode]
  );

  // Memoize columns to prevent infinite renders
  const columns = useMemo<ColumnDef<BalanceRow>[]>(
    () => [
      {
        accessorKey: 'asset',
        header: 'TOKEN',
        cell: ({ row }) => {
          const data = row.original;
          return (
            <div className="flex items-center gap-sm">
              <CoinIcon symbol={data.asset} size="w-8 h-8" />
              <div>
                <div className="text-sm font-medium text-foreground">
                  {data.asset}
                </div>
              </div>
            </div>
          );
        },
        enableSorting: true,
        filterFn: 'includesString',
        meta: { filterType: 'string' },
      },
      {
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
        filterFn: 'includesString',
        meta: { filterType: 'string' },
      },
      {
        id: 'locked',
        header: 'LOCKED',
        accessorFn: (row) => getRowTotals(row).locked,
        cell: ({ getValue, row }) => {
          const amount = getValue() as number;
          const token = row.original.asset;
          return (
            <div className="text-right">
              <div className="text-sm font-medium text-foreground">
                {formatTokenAmount(amount)}
              </div>
              <div className="text-xs text-muted-foreground">{token}</div>
            </div>
          );
        },
        enableSorting: true,
        sortingFn: 'basic',
        meta: {
          filterType: 'number',
          enableTotalsRow: true,
          totalsDefaultAggregation: 'sum' as const,
        },
      },
      {
        id: 'free',
        header: 'FREE',
        accessorFn: (row) => getRowTotals(row).free,
        cell: ({ getValue, row }) => {
          const amount = getValue() as number;
          const token = row.original.asset;
          return (
            <div className="text-right">
              <div className="text-sm font-medium text-foreground">
                {formatTokenAmount(amount)}
              </div>
              <div className="text-xs text-muted-foreground">{token}</div>
            </div>
          );
        },
        enableSorting: true,
        sortingFn: 'basic',
        meta: {
          filterType: 'number',
          enableTotalsRow: true,
          totalsDefaultAggregation: 'sum' as const,
        },
      },
      {
        id: 'totalUsd',
        header: 'TOTAL',
        accessorFn: (row) => getRowTotals(row).usdValue,
        cell: ({ getValue, row }) => {
          const totalValue = getValue() as number;
          const { total, priceUnavailable } = getRowTotals(row.original);
          const token = row.original.asset;
          return (
            <div className="text-right">
              <div className="text-sm font-medium text-foreground">
                {formatTokenAmount(total)}
              </div>
              <div className="text-xs text-muted-foreground">
                {token} •{' '}
                {priceUnavailable
                  ? 'price unavailable'
                  : formatValueInCurrency(totalValue)}
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
        },
        footerValue: (value: number) => formatValueInCurrency(value),
      },
      {
        id: 'price',
        header: 'CURRENT PRICE',
        accessorFn: (row) => getRowTotals(row).price,
        cell: ({ getValue, row }) => {
          const price = getValue() as number;
          const { priceUnavailable } = getRowTotals(row.original);

          return (
            <div className="text-right">
              <div
                className={
                  priceUnavailable
                    ? 'text-xs text-muted-foreground'
                    : 'text-sm font-medium text-foreground'
                }
                title={
                  priceUnavailable
                    ? 'Neither the exchange nor the market screener publishes a USD rate for this asset, so its value cannot be calculated.'
                    : undefined
                }
              >
                {priceUnavailable
                  ? 'price unavailable'
                  : formatPriceWithPrecision(price, '$')}
              </div>
            </div>
          );
        },
        enableSorting: true,
        sortingFn: 'basic',
        meta: { filterType: 'number' },
      },
    ],
    [formatValueInCurrency, formatTokenAmount, getRowTotals]
  );

  // Calculate total portfolio value
  const totalPortfolioValue = useMemo(() => {
    return filteredData.reduce((sum, item) => {
      return sum + getRowTotals(item).usdValue;
    }, 0);
  }, [filteredData, getRowTotals]);

  const isLoading = isLoadingBalances || isLoadingScreener;

  const content = (
    <div className="flex flex-col h-full">
      <div className="relative flex-1">
        <DataTable
          tableId={`portfolio-balances-${widgetId}`}
          columns={columns}
          data={filteredData}
          enableGlobalFilter={true}
          enableColumnFilters={true}
          enableSorting={true}
          showPagination={showPagination}
          className="flex-1"
          emptyMessage="No portfolio data found."
          customToolbarActions={
            <Button
              variant="outline"
              onClick={() => setShowCoinDialog(true)}
              className="h-9 px-3 flex items-center gap-xs border-2 border-border bg-inner-container hover:bg-muted hover:border-border text-card-foreground shadow-md transition-all duration-200"
              title="Filter tokens"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Filter Tokens</span>
            </Button>
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
  const portfolioChange = {
    value: 0,
    percentage: 0,
    isPositive: true,
  };
  const portfolioValue = {
    primary: privacyMode ? '***' : totalPortfolioValue,
    secondary: selectedCurrency,
    change: privacyMode
      ? {
          value: '***',
          percentage: '***',
          isPositive: portfolioChange.isPositive,
        }
      : portfolioChange,
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
    .filter((exchange) => exchange.id !== 'ALL') // Exclude ALL since it's handled separately
    .map((exchange) => ({
      id: exchange.id,
      name: exchange.name,
      icon: exchange.icon,
      color: exchange.color || 'var(--color-muted-foreground)', // Provide default color if undefined
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

  const wrapperProps = {
    metadata: {
      ...getWidgetMetadata('portfolio-balances'),
      id: widgetId,
      title: customName || 'Portfolio Balances',
      displayName: customName || 'Portfolio Balances',
      value: portfolioValue,
      hasOptions: true,
      hasFilters: true,
      filterContent,
      filtersActive,
      onClearFilters: clearAllFilters,
    },
    isEditable: isEditable ?? false,
    isCollapsible,
    style: allowResize
      ? {}
      : {
          height: typeof height === 'number' ? `${height}px` : height,
          minHeight: typeof height === 'number' ? `${height}px` : height,
        },
    customName,
    onCustomNameChange: setCustomName,
    // Centralized options modal props
    showOptionsDialog,
    onCloseOptionsDialog: () => setShowOptionsDialog(false),
    optionsTitle: 'Widget Options',
    renderOptionsContent: () => (
      <div className="space-y-md">
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
        queryKey: 'getBalances',
        variables: {
          input: {
            shouldSumBalance: false,
          },
        } as Record<string, unknown>,
      },
    ],
  };

  return <WidgetWrapper {...wrapperProps}>{content}</WidgetWrapper>;
};

export default PortfolioBalances;
