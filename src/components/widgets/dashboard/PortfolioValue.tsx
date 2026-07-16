import EmptyState from '@/components/ui/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { TimeframeButtons } from '@/components/widgets/shared/TimeframeButtons';
import { LineChart } from 'lucide-react';
import { useTransformedExchangesFromContext } from '@/contexts/ExchangeDataContext';
import { useGraphQL } from '@/hooks/useGraphQL';
import { useNowTick } from '@/hooks/useNowTick';
import { currencies, getCurrencyInfo } from '@/utils/currencyUtils';
import { GraphQlQuery } from '@/lib/api';
import { logger } from '@/lib/loggerInstance';
import { StatusEnum, type PortfolioQuery, type Snapshots } from '@/types';
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PortfolioContext } from '../../../contexts/PortfolioContext';
import {
  useWidgetSettings,
  type PortfolioWidgetSettings,
} from '../../../hooks/useWidgetSettings';
import { useUIStore } from '../../../stores/uiStore';
import CustomTooltip from '../../charts/CustomTooltip';
import { ListModal } from '../shared/ListModal';
import { FilterSection, type FilterItem } from '../shared/WidgetFilterArea';
import WidgetWrapper from '../WidgetWrapper';
import { getWidgetMetadata } from './index';

// Extended types for portfolio data with exchanges
interface PortfolioExchange {
  uuid: string;
  amount: number;
  amountUsd: number;
}

interface PortfolioAssetWithExchanges {
  name: string;
  amount: number;
  amountUsd: number;
  exchanges?: PortfolioExchange[] | null;
}

interface PortfolioSnapshotWithExchanges {
  updateTime: number;
  totalUsd: number;
  assets: PortfolioAssetWithExchanges[];
}

// Currency reference data + lookup live in `@/utils/currencyUtils` (imported
// above as `currencies` / `getCurrencyInfo`) — do not duplicate them here.

// Color palette for different coins.
const COIN_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#22c55e', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f97316', // orange
  '#6366f1', // indigo
];

export interface PortfolioValueProps {
  widgetId?: string;
  isEditable?: boolean;
  isCollapsible?: boolean;
  allowResize?: boolean; // Controls whether height styles are applied (for grid layouts)
  height?: string | number;
  fixedTimeframe?: string; // Force a specific timeframe (e.g., '1m' for 30 days)
  hideHeaderValue?: boolean; // Hide the primary/secondary/change value block in the widget header
  onRemove?: () => void;
  onSettings?: () => void;
  onCollapse?: (widgetId: string, collapsed: boolean) => void;
  onTabMove?: (
    fromTabId: string,
    toWidgetId: string,
    toTabIndex: number
  ) => void;
  menuActions?: import('../WidgetWrapper').WidgetMenuActions;
}

export const PortfolioValue: React.FC<PortfolioValueProps> = ({
  widgetId = 'portfolio-value',
  isEditable = false,
  isCollapsible = true,
  allowResize = true, // Default to true for grid layouts
  height = '200px',
  fixedTimeframe,
  hideHeaderValue = false,
  onRemove,
  onSettings,
  onCollapse,
  onTabMove,
  menuActions,
}) => {
  // Use the generic widget settings hook with type safety
  const { usePersistedState } =
    useWidgetSettings<PortfolioWidgetSettings>(widgetId);

  // Get privacy mode state
  const privacyMode = useUIStore((s) => s.privacyMode);

  // Get exchange data
  const { exchanges } = useTransformedExchangesFromContext();
  const portfolioContext = useContext(PortfolioContext);

  const [snapshots, setSnapshots] = useState<Snapshots[]>([]);

  // Timeframe chip (1M / 3M / 12M). Persisted per widget; legacy day-count
  // values ('30'/'60'/'90') are normalized to the new keys on mount (below).
  const [timeFilter, setTimeFilter] = usePersistedState(
    'timeFilter',
    fixedTimeframe || '1m'
  );

  // Persisted filter selections. Declared here (before the fetch) because the
  // query depends on whether a coin/exchange filter is active.
  const [selectedExchanges, setSelectedExchanges] = usePersistedState(
    'selectedExchanges',
    ['ALL']
  );
  const [selectedCoins, setSelectedCoins] = usePersistedState('selectedCoins', [
    'ALL',
  ]);

  // A coin/exchange filter is active unless BOTH include 'ALL'. Only then is the
  // per-day assets[] breakdown needed; the all/all line uses `totalUsd`. Uses the
  // SAME `.includes('ALL')` predicate as `showAllExchanges`/`showAllCoins` in the
  // processing below, so the lean-fetch decision can never disagree with the
  // branch that consumes it (a mismatch would reduce over absent assets).
  const needsAssets =
    !selectedCoins.includes('ALL') || !selectedExchanges.includes('ALL');

  // Fetch the WHOLE 12-month range ONCE. The chips filter the already-loaded
  // series client-side (`timeFilterMs` below), so switching ranges is INSTANT —
  // no refetch. `assets[]` are requested only when a coin/exchange filter is
  // active, so the common all/all fetch is a small updateTime+totalUsd payload.
  // `from` floored to the UTC day keeps the react-query cache key stable.
  const portfolioQuery = useMemo(() => {
    const dayMs = 24 * 60 * 60 * 1000;
    const from = Math.floor(Date.now() / dayMs) * dayMs - 365 * dayMs;
    return GraphQlQuery.getPortfolioByUser({ from, includeAssets: needsAssets });
  }, [needsAssets]);
  const { data: p, isLoading: portfolioLoading } = useGraphQL<PortfolioQuery>(
    'getPortfolioByUser',
    portfolioQuery
  );

  useEffect(() => {
    if (p?.status === StatusEnum.notok) {
      console.error(`Error fetching portfolio data: ${p.reason}`);
    } else {
      setSnapshots(
        p?.data.result.map((snap) => ({
          ...snap,
          // Lean rows (all coins + all exchanges) carry no assets[]; default to
          // [] so downstream `.map`/filters never hit null.
          assets: (snap.assets ?? []).map((pa) => ({
            ...pa,
            name: pa.name === 'looks' ? 'RARE' : pa.name, // Normalize asset names
          })),
        })) || []
      );
    }
  }, [p]);

  // Persisted settings for this widget instance (exchange/coin selections are
  // declared earlier — the fetch depends on them).
  const [selectedCurrency, setSelectedCurrency] = usePersistedState(
    'selectedCurrency',
    'USD'
  );
  const [customName, setCustomName] = usePersistedState('customName', '');
  const [startYAxisAtZero, setStartYAxisAtZero] = usePersistedState(
    'startYAxisAtZero',
    false
  );

  // Sync with portfolio-level exchange selection when page context is available
  useEffect(() => {
    const contextSelections = portfolioContext?.selectedExchanges;
    if (!contextSelections) return;
    const areEqual =
      contextSelections.length === selectedExchanges.length &&
      contextSelections.every((val, idx) => val === selectedExchanges[idx]);
    if (!areEqual) {
      logger.debug('PortfolioValue: Syncing exchange selection', {
        contextSelectedExchanges: contextSelections,
        widgetSelectedExchanges: selectedExchanges,
      });
      setSelectedExchanges(contextSelections);
    }
  }, [
    portfolioContext?.selectedExchanges,
    selectedExchanges,
    setSelectedExchanges,
  ]);

  // Enforce fixed timeframe if provided
  useEffect(() => {
    if (fixedTimeframe && timeFilter !== fixedTimeframe) {
      setTimeFilter(fixedTimeframe);
    }
  }, [fixedTimeframe, timeFilter, setTimeFilter]);

  // Migrate legacy persisted day-count chips ('30'/'60'/'90') to the new
  // 1M/3M/12M keys so returning users land on a valid, highlighted chip.
  useEffect(() => {
    if (fixedTimeframe) return;
    const legacy: Record<string, string> = { '30': '1m', '60': '3m', '90': '3m' };
    if (legacy[timeFilter]) setTimeFilter(legacy[timeFilter]);
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle inline name editing
  const handleNameChange = useCallback(
    (_widgetId: string, newName: string) => {
      setCustomName(newName);
    },
    [setCustomName]
  );

  // Local UI state (not persisted)
  const [showCoinDialog, setShowCoinDialog] = useState(false);
  const [showExchangeDialog, setShowExchangeDialog] = useState(false);
  const [showOptionsDialog, setShowOptionsDialog] = useState(false);

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
  const handleExchangeToggle = useCallback(
    (exchangeId: string) => {
    logger.debug('PortfolioValue: Exchange toggle', {
      exchangeId,
      widgetId,
      currentSelection: selectedExchanges,
    });

    if (exchangeId === 'ALL') {
      // If ALL is being toggled off and it's the only selection, don't allow it
      if (selectedExchanges.includes('ALL') && selectedExchanges.length === 1) {
        return; // Prevent removing ALL if it's the only option
      }
      // If ALL is being toggled on, replace all selections with just ALL
      setSelectedExchanges(['ALL']);
      if (portfolioContext?.setSelectedExchanges) {
        portfolioContext.setSelectedExchanges(['ALL']);
      }
      logger.debug('PortfolioValue: Set to ALL exchanges', { widgetId });
      return;
    }

    if (selectedExchanges.includes(exchangeId)) {
      // Removing an exchange
      const newSelectedExchanges = selectedExchanges.filter(
        (e) => e !== exchangeId
      );
      // If removing this exchange would result in an empty array, automatically select "ALL"
      if (newSelectedExchanges.length === 0) {
        setSelectedExchanges(['ALL']);
        if (portfolioContext?.setSelectedExchanges) {
          portfolioContext.setSelectedExchanges(['ALL']);
        }
        logger.debug(
          'PortfolioValue: Removed last exchange, defaulting to ALL',
          { widgetId }
        );
      } else {
        setSelectedExchanges(newSelectedExchanges);
        if (portfolioContext?.setSelectedExchanges) {
          portfolioContext.setSelectedExchanges(newSelectedExchanges);
        }
        logger.debug('PortfolioValue: Removed exchange', {
          widgetId,
          exchangeId,
          newSelection: newSelectedExchanges,
        });
      }
    } else {
      // Adding an exchange - remove "ALL" and add the specific exchange
      const newSelections = selectedExchanges.filter((e) => e !== 'ALL');
      const updated = [...newSelections, exchangeId];
      setSelectedExchanges(updated);
      if (portfolioContext?.setSelectedExchanges) {
        portfolioContext.setSelectedExchanges(updated);
      }
      logger.debug('PortfolioValue: Added exchange', {
        widgetId,
        exchangeId,
        newSelection: updated,
      });
    }
    },
    [selectedExchanges, setSelectedExchanges, portfolioContext, widgetId]
  );

  const handleRemoveExchange = useCallback(
    (exchangeId: string) => {
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
    },
    [selectedExchanges, setSelectedExchanges, portfolioContext]
  );

  // Coin management functions for this specific widget
  const handleCoinToggle = useCallback(
    (coinSymbol: string) => {
    if (coinSymbol === 'ALL') {
      // If ALL is being toggled off and it's the only selection, don't allow it
      if (selectedCoins.includes('ALL') && selectedCoins.length === 1) {
        return; // Prevent removing ALL if it's the only option
      }
    }

    if (selectedCoins.includes(coinSymbol)) {
      const newSelectedCoins = selectedCoins.filter((c) => c !== coinSymbol);
      // If toggling off this coin would result in an empty array, automatically select "ALL"
      if (newSelectedCoins.length === 0) {
        setSelectedCoins(['ALL']);
      } else {
        setSelectedCoins(newSelectedCoins);
      }
    } else {
      setSelectedCoins([...selectedCoins, coinSymbol]);
    }
    },
    [selectedCoins, setSelectedCoins]
  );

  const handleRemoveCoin = useCallback(
    (coinSymbol: string) => {
    // Special handling for "ALL" option
    if (coinSymbol === 'ALL' && selectedCoins.length === 1) {
      return; // Prevent removing ALL if it's the only option
    }

    const newSelectedCoins = selectedCoins.filter((c) => c !== coinSymbol);
    // If removing this coin would result in an empty array, automatically select "ALL"
    if (newSelectedCoins.length === 0) {
      setSelectedCoins(['ALL']);
    } else {
      setSelectedCoins(newSelectedCoins);
    }
    },
    [selectedCoins, setSelectedCoins]
  );

  // Prepare coin data for ListModal
  const modalItems = useMemo(
    () => [
      {
        symbol: 'ALL',
        name: 'All Coins',
        icon: '📊',
        color: '#3b82f6',
        subtitle: 'Total portfolio value',
      },
      ...(snapshots?.[0]?.assets || []).map((asset) => {
        return {
          symbol: asset.name.toUpperCase(),
          name: asset.name.toUpperCase(),
          icon: '', // CoinIcon component uses symbol prop to construct URL
          price: asset.amountUsd,
          color: '',
          // Don't set baseAsset, quoteAsset, or isExchange so it uses CoinIcon
        };
      }),
    ],
    [snapshots]
  );

  // Prepare exchange data for ListModal
  const exchangeModalItems = useMemo(
    () => [
      {
        symbol: 'ALL',
        name: 'All Exchanges',
        icon: '🏢',
        color: '#3b82f6',
        subtitle: 'Total portfolio value',
        isExchange: true,
      },
      ...exchanges
        .filter((exchange) => exchange.id !== 'ALL')
        .map((exchange) => ({
          symbol: exchange.id, // Use UUID for internal tracking
          name: exchange.name, // Just the name
          icon: exchange.icon,
          color: exchange.color || '#64748b',
          subtitle: exchange.provider, // Pass raw provider string
          balance: exchange.balance,
          isExchange: true,
        })),
    ],
    [exchanges]
  );

  // Get color for a specific coin - use consistent mapping based on position in selected coins
  const getCoinColor = useCallback(
    (coinSymbol: string, fallbackIndex: number) => {
      if (coinSymbol === 'ALL') return '#3b82f6'; // Always blue for ALL

      // Get the list of non-ALL selected coins to determine order
      const nonAllCoins = selectedCoins.filter((coin) => coin !== 'ALL');
      const coinIndex = nonAllCoins.indexOf(coinSymbol);

      // Use the coin's position in the selected list, or fallback index if not found
      // Start from index 1 to avoid blue (index 0) which is reserved for ALL
      const colorIndex = coinIndex >= 0 ? coinIndex + 1 : fallbackIndex + 1;

      // Ensure we don't exceed the color array length by using modulo
      return COIN_COLORS[colorIndex % COIN_COLORS.length];
    },
    [selectedCoins]
  );

  // Coarse minute-bucketed clock so the rolling cutoff window below keeps
  // sliding. Without it, react-query structural sharing can hold `snapshots`
  // referentially stable for hours, so this useCallback would never recreate
  // and the captured `now` (cutoff) would freeze.
  const nowTick = useNowTick();

  // Process real portfolio data from GraphQL. Memoized: this is the widget's
  // heaviest computation (O(snapshots × assets × exchanges)), so it must only
  // run when its inputs change — not on every render.
  const getPortfolioDataForExchanges = useCallback(
    (exchangeIds: string[]) => {
    if (!snapshots || snapshots.length === 0) {
      return {
        currentValue: 0,
        changeValue: 0,
        changePercent: 0,
        timeFilter: timeFilter,
        chartData: [],
      };
    }

    // Filter snapshots based on time filter. `nowTick` advances once a minute
    // so the cutoff window slides even when `snapshots` stays referentially
    // stable (react-query structural sharing).
    const now = nowTick;
    const timeFilterMs = {
      '30': 30 * 24 * 60 * 60 * 1000,
      '60': 60 * 24 * 60 * 60 * 1000,
      '90': 90 * 24 * 60 * 60 * 1000,
      // Keep backward compatibility
      '1d': 24 * 60 * 60 * 1000,
      '3d': 3 * 24 * 60 * 60 * 1000,
      '1w': 7 * 24 * 60 * 60 * 1000,
      '1m': 30 * 24 * 60 * 60 * 1000,
      '3m': 90 * 24 * 60 * 60 * 1000,
      '12m': 365 * 24 * 60 * 60 * 1000,
      '1y': 365 * 24 * 60 * 60 * 1000,
    };

    const cutoffTime =
      now -
      (timeFilterMs[timeFilter as keyof typeof timeFilterMs] ||
        timeFilterMs['30']);
    const filteredSnapshots = snapshots.filter(
      (snapshot) => snapshot.updateTime >= cutoffTime
    );

    // Determine if we should show all exchanges and coins or filter by specific ones
    const showAllExchanges = exchangeIds.includes('ALL');
    const showAllCoins = selectedCoins.includes('ALL');

    // Filter snapshots by selected exchanges and coins if not showing all
    const processedSnapshots = filteredSnapshots.map((snapshot) => {
      // Cast the snapshot to our extended type
      const extendedSnapshot = snapshot as PortfolioSnapshotWithExchanges;

      // No filter (all coins + all exchanges): use the backend `totalUsd`
      // directly. Lean rows carry no assets[], so we must not reduce over them.
      if (showAllExchanges && showAllCoins) {
        return extendedSnapshot;
      }

      // Filter assets by selected coins first
      let assetsToProcess = extendedSnapshot.assets;
      if (!showAllCoins) {
        assetsToProcess = extendedSnapshot.assets.filter((asset) =>
          selectedCoins.includes(asset.name.toUpperCase())
        );
      }

      if (showAllExchanges) {
        // When showing all exchanges, include filtered coin assets as-is
        const newTotalUsd = assetsToProcess.reduce(
          (sum, asset) => sum + asset.amountUsd,
          0
        );
        return {
          ...extendedSnapshot,
          assets: assetsToProcess,
          totalUsd: newTotalUsd,
        };
      }

      // Filter assets by selected exchanges
      const filteredAssets = assetsToProcess
        .map((asset) => {
          // If exchanges is null (older data), exclude this asset when filtering by specific exchanges
          if (!asset.exchanges) {
            return null;
          }

          // Filter the exchanges within this asset to only include selected ones
          const filteredExchanges = asset.exchanges.filter(
            (exchange: PortfolioExchange) => exchangeIds.includes(exchange.uuid)
          );

          // If no exchanges match the filter, exclude this asset
          if (filteredExchanges.length === 0) {
            return null;
          }

          // Calculate the total amount and USD value for the filtered exchanges
          const totalAmount = filteredExchanges.reduce(
            (sum: number, exchange: PortfolioExchange) => sum + exchange.amount,
            0
          );
          const totalAmountUsd = filteredExchanges.reduce(
            (sum: number, exchange: PortfolioExchange) =>
              sum + exchange.amountUsd,
            0
          );

          return {
            ...asset,
            amount: totalAmount,
            amountUsd: totalAmountUsd,
            exchanges: filteredExchanges,
          };
        })
        .filter(Boolean) as PortfolioAssetWithExchanges[]; // Remove null entries and type assert

      // Calculate the new total USD value for this snapshot
      const newTotalUsd = filteredAssets.reduce(
        (sum, asset) => sum + (asset?.amountUsd || 0),
        0
      );

      return {
        ...extendedSnapshot,
        assets: filteredAssets,
        totalUsd: newTotalUsd,
      };
    });

    // Convert processed snapshots to chart data
    const chartData = processedSnapshots.map((snapshot) => {
      const date = new Date(snapshot.updateTime);
      const hours = date.getHours();
      const minutes = date.getMinutes();

      // Format time for display
      const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

      // Format date label based on time filter
      let dateString: string;
      if (timeFilter === '12m' || timeFilter === '1y') {
        // For a year, show month-only labels (e.g. "Jul")
        dateString = date.toLocaleDateString('en-US', { month: 'short' });
      } else if (timeFilter === '90' || timeFilter === '3m') {
        // For 90 days, show month/day format
        dateString = date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        });
      } else if (timeFilter === '60') {
        // For 60 days, show month/day format
        dateString = date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        });
      } else if (timeFilter === '30' || timeFilter === '1m') {
        // For 30 days, show month/day format
        dateString = date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        });
      } else if (timeFilter === '1w') {
        // For 1 week, show day abbreviation + date like "Mon 1" or "Tue 2"
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayName = dayNames[date.getDay()];
        const dayNum = date.getDate();
        dateString = `${dayName} ${dayNum}`;
      } else if (timeFilter === '3d') {
        // For 3 days, show month/day format like "7/5" or "7/6"
        dateString = date.toLocaleDateString('en-US', {
          month: 'numeric',
          day: 'numeric',
        });
      } else {
        // Default fallback
        dateString = date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        });
      }

      // Calculate individual asset values for tooltip
      const assetValues: { [key: string]: number } = {};
      snapshot.assets.forEach((asset) => {
        assetValues[asset.name.toUpperCase()] = asset.amountUsd;
      });

      return {
        date: dateString,
        value: snapshot.totalUsd,
        time: timeString,
        updateTime: snapshot.updateTime,
        ...assetValues,
      };
    });

    // Sort by updateTime to ensure chronological order
    chartData.sort((a, b) => a.updateTime - b.updateTime);

    // Trim leading empty points so the line starts at the first funded value.
    // Accounts funded later have a run of $0 snapshots at the start of their
    // history (a snapshot is $0 until the account holds a balance); without this
    // the chart draws a distracting line up from 0 to the first real value —
    // more visible now that the 12M chip pulls the full history. Interior and
    // trailing zeros (genuine drawdowns to $0) are kept.
    const firstFunded = chartData.findIndex((d) => (d.value ?? 0) > 0);
    if (firstFunded > 0) chartData.splice(0, firstFunded);

    // Intelligently thin out data points while preserving chart detail
    let finalChartData = chartData;
    if (timeFilter === '12m' || timeFilter === '1y') {
      // For a year of daily points, thin down to keep the chart readable
      const targetPoints = Math.min(chartData.length, 30);
      const step = Math.max(1, Math.floor(chartData.length / targetPoints));
      finalChartData = chartData.filter(
        (_, index) => index % step === 0 || index === chartData.length - 1
      );
    } else if (timeFilter === '90' || timeFilter === '3m') {
      // For 90 days, show fewer points to avoid overcrowding
      const targetPoints = Math.min(chartData.length, 25);
      const step = Math.max(1, Math.floor(chartData.length / targetPoints));
      finalChartData = chartData.filter(
        (_, index) => index % step === 0 || index === chartData.length - 1
      );
    } else if (timeFilter === '60') {
      // For 60 days, show moderate number of points
      const targetPoints = Math.min(chartData.length, 20);
      const step = Math.max(1, Math.floor(chartData.length / targetPoints));
      finalChartData = chartData.filter(
        (_, index) => index % step === 0 || index === chartData.length - 1
      );
    } else if (timeFilter === '30' || timeFilter === '1m') {
      // For 30 days, show more points but limit for performance
      const targetPoints = Math.min(chartData.length, 20);
      const step = Math.max(1, Math.floor(chartData.length / targetPoints));
      finalChartData = chartData.filter(
        (_, index) => index % step === 0 || index === chartData.length - 1
      );
    } else if (timeFilter === '1w') {
      // For 1 week, show more frequent points
      const targetPoints = Math.min(chartData.length, 15);
      const step = Math.max(1, Math.floor(chartData.length / targetPoints));
      finalChartData = chartData.filter(
        (_, index) => index % step === 0 || index === chartData.length - 1
      );
    }
    // For shorter periods like 3d, keep all points as it's a short timeframe

    // Calculate current value and change
    const currentValue =
      finalChartData.length > 0
        ? finalChartData[finalChartData.length - 1].value
        : 0;
    const previousValue =
      finalChartData.length > 1
        ? finalChartData[finalChartData.length - 2].value
        : currentValue;
    const changeValue = currentValue - previousValue;
    const changePercent =
      previousValue > 0 ? (changeValue / previousValue) * 100 : 0;

    return {
      currentValue,
      changeValue,
      changePercent,
      timeFilter: timeFilter,
      chartData: finalChartData,
    };
    },
    [snapshots, timeFilter, selectedCoins, nowTick]
  );

  const portfolioData = useMemo(
    () => getPortfolioDataForExchanges(selectedExchanges),
    [getPortfolioDataForExchanges, selectedExchanges]
  );

  // Calculate portfolio value and change for header. `getCurrencyInfo` is now a
  // stable module-level import, so it is not a dependency.
  const currencyInfo = useMemo(
    () => getCurrencyInfo(selectedCurrency),
    [selectedCurrency]
  );
  const portfolioValue = useMemo(
    () => ({
      primary: privacyMode
        ? '***'
        : portfolioData.currentValue * currencyInfo.rate,
      secondary: `${currencyInfo.symbol} ${selectedCurrency}`,
      change: {
        value: privacyMode
          ? '***'
          : portfolioData.changeValue * currencyInfo.rate,
        percentage: privacyMode
          ? '***'
          : Math.round(portfolioData.changePercent * 100) / 100, // Round to 2 decimal places
        isPositive: portfolioData.changeValue >= 0,
      },
    }),
    [privacyMode, portfolioData, currencyInfo, selectedCurrency]
  );

  // Check if any filters are active (not default state)
  const filtersActive =
    !selectedExchanges.includes('ALL') ||
    selectedExchanges.length > 1 ||
    !selectedCoins.includes('ALL') ||
    selectedCoins.length > 1;

  // Clear all filters to default state
  const clearAllFilters = useCallback(() => {
    setSelectedExchanges(['ALL']);
    setSelectedCoins(['ALL']);
    if (portfolioContext?.setSelectedExchanges) {
      portfolioContext.setSelectedExchanges(['ALL']);
    }
  }, [setSelectedExchanges, setSelectedCoins, portfolioContext]);

  // Create exchange filter items for the generic filter system
  const exchangeFilterItems: FilterItem[] = useMemo(
    () =>
      exchanges
        .filter((exchange) => exchange.id !== 'ALL') // Exclude ALL since it's handled separately
        .map((exchange) => ({
          id: exchange.id, // Use UUID for consistency
          name: exchange.name,
          icon: exchange.icon,
          color: exchange.color || '#64748b',
          isExchange: true,
        })),
    [exchanges]
  );

  // Create coin filter items for the generic filter system
  const coinFilterItems: FilterItem[] = useMemo(
    () =>
      (snapshots?.[0]?.assets || []).map((coin) => ({
        id: coin.name,
        name: coin.name.toUpperCase(),
        icon: '',
        color: '',
        isExchange: false,
      })),
    [snapshots]
  );

  // Create filter content using the generic filter system
  const filterContent = useMemo(
    () => (
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

        <FilterSection
          title="Coins"
          selectedItems={selectedCoins}
          availableItems={coinFilterItems}
          onItemRemove={handleRemoveCoin}
          onShowDialog={() => setShowCoinDialog(true)}
          addButtonText="Add coins"
          showAllOption={true}
        />

        {/* Use ListModal for coin selection with proper icon rendering */}
        <ListModal
          isOpen={showCoinDialog}
          onClose={() => setShowCoinDialog(false)}
          title="Select Coins"
          items={modalItems}
          selectedItems={selectedCoins}
          onItemToggle={handleCoinToggle}
          searchPlaceholder="Search coins..."
        />

        {/* Use ListModal for exchange selection with proper icon rendering */}
        <ListModal
          isOpen={showExchangeDialog}
          onClose={() => setShowExchangeDialog(false)}
          title="Select Exchanges"
          items={exchangeModalItems}
          selectedItems={selectedExchanges}
          onItemToggle={handleExchangeToggle}
          searchPlaceholder="Search exchanges..."
        />
      </div>
    ),
    [
      selectedExchanges,
      exchangeFilterItems,
      handleRemoveExchange,
      selectedCoins,
      coinFilterItems,
      handleRemoveCoin,
      showCoinDialog,
      modalItems,
      handleCoinToggle,
      showExchangeDialog,
      exchangeModalItems,
      handleExchangeToggle,
    ]
  );

  // Distinguish loading from empty. We're in initial load when there's no
  // cached portfolio response AND the query is in-flight; after that, empty
  // snapshots means the user genuinely has no portfolio history.
  const isInitialLoad = portfolioLoading && !p;
  const isEmpty = !!p && (!snapshots || snapshots.length === 0);

  const content = useMemo(
    () => (
    <div className="flex flex-col h-full p-xs bg-card">
      {/* Skeleton chart while loading */}
      {isInitialLoad && (
        <div className="flex-1 flex flex-col gap-xs" aria-busy="true">
          <div className="flex-1 relative overflow-hidden rounded-md bg-muted/40">
            <Skeleton className="absolute inset-x-0 bottom-0 h-3/4 rounded-none bg-gradient-to-t from-muted to-transparent" />
          </div>
          <div className="flex gap-xs justify-center pt-1">
            <Skeleton className="h-6 w-12" />
            <Skeleton className="h-6 w-12" />
            <Skeleton className="h-6 w-12" />
          </div>
        </div>
      )}
      {/* Empty state when there's no portfolio history yet */}
      {!isInitialLoad && isEmpty && (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon={<LineChart className="w-6 h-6" />}
            title="No portfolio history yet"
            description="Once your connected exchanges sync, your portfolio value will plot here."
          />
        </div>
      )}
      {snapshots && snapshots.length > 0 && (
        <div className="flex-1 mb-2 relative min-h-0">
          {/* Chart Area — absolute inset so ResponsiveContainer sizes against
              the parent's real rendered box, sidestepping the % height chain
              entirely. min-h-0 on the flex parent lets the chart shrink if
              other widget content (stats grid) wraps to a taller layout. */}
          <div className="absolute inset-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={portfolioData.chartData}
                margin={{
                  top: 5,
                  right: 5,
                  left: 5,
                  bottom: 5,
                }}
              >
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1} />
                  </linearGradient>
                  {selectedCoins.map((coinSymbol, index) => {
                    if (coinSymbol === 'ALL') return null;
                    const asset = snapshots?.[0]?.assets.find(
                      (a) => a.name.toUpperCase() === coinSymbol.toUpperCase()
                    );
                    if (!asset) return null;
                    const color = getCoinColor(coinSymbol, index);
                    const gradientId = `color${asset.name.toUpperCase()}`;
                    return (
                      <linearGradient
                        key={`gradient-${asset.name}`}
                        id={gradientId}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                        <stop
                          offset="95%"
                          stopColor={color}
                          stopOpacity={0.05}
                        />
                      </linearGradient>
                    );
                  })}
                </defs>
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: 'currentColor',
                    fontSize: 10,
                    className: 'text-muted-foreground',
                  }}
                  interval={
                    timeFilter === '90'
                      ? Math.ceil(portfolioData.chartData.length / 8) // Show ~8 labels for 90 days
                      : timeFilter === '60'
                        ? Math.ceil(portfolioData.chartData.length / 6) // Show ~6 labels for 60 days
                        : timeFilter === '30'
                          ? Math.ceil(portfolioData.chartData.length / 5) // Show ~5 labels for 30 days
                          : timeFilter === '1m' ||
                              timeFilter === '3m' ||
                              timeFilter === '12m' ||
                              timeFilter === '1y'
                            ? Math.ceil(portfolioData.chartData.length / 8) // ~8 labels
                            : timeFilter === '1w'
                              ? Math.ceil(portfolioData.chartData.length / 6)
                              : 'preserveStartEnd' // Show all labels for shorter periods
                  }
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: 'currentColor',
                    fontSize: 8,
                    className: 'text-muted-foreground',
                  }}
                  tickFormatter={(value) => {
                    if (privacyMode) {
                      return '***';
                    }
                    const currencyInfo = getCurrencyInfo(selectedCurrency);
                    const convertedValue = value * currencyInfo.rate;
                    return `${currencyInfo.symbol}${(convertedValue / 1000).toFixed(0)}k`;
                  }}
                  domain={
                    startYAxisAtZero
                      ? [0, 'dataMax + 200']
                      : ['dataMin - 200', 'dataMax + 200']
                  }
                  width={40}
                />
                <Tooltip
                  content={
                    <CustomTooltip
                      valueFormatter={
                        privacyMode ? () => ['***', ''] as const : undefined
                      }
                    />
                  }
                />
                {/* Show main "All coins" area when ALL is selected */}
                {selectedCoins.includes('ALL') && (
                  <Area
                    isAnimationActive={false}
                    type="monotone"
                    dataKey="value"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#colorValue)"
                    dot={false}
                    activeDot={{
                      r: 4,
                      fill: '#3b82f6',
                      stroke: 'oklch(var(--color-card))',
                      strokeWidth: 2,
                    }}
                  />
                )}
                {/* Show individual coin areas when specific coins are selected */}
                {selectedCoins
                  .filter((coin) => coin !== 'ALL')
                  .map((coinSymbol, index) => {
                    const asset = snapshots?.[0]?.assets.find(
                      (a) => a.name.toUpperCase() === coinSymbol.toUpperCase()
                    );
                    if (!asset) return null;
                    const color = getCoinColor(coinSymbol, index);
                    const gradientId = `color${asset.name.toUpperCase()}`;
                    return (
                      <Area
                        isAnimationActive={false}
                        key={asset.name}
                        type="monotone"
                        dataKey={asset.name.toUpperCase()}
                        stroke={color}
                        strokeWidth={1.5}
                        fill={`url(#${gradientId})`}
                        dot={false}
                        activeDot={{
                          r: 3,
                          fill: color,
                          stroke: 'oklch(var(--color-card))',
                          strokeWidth: 2,
                        }}
                      />
                    );
                  })}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Timeframe Buttons */}
      {snapshots && snapshots.length > 0 && (
        <TimeframeButtons
          options={[
            { value: '1m', label: '1M' },
            { value: '3m', label: '3M' },
            { value: '12m', label: '12M' },
          ]}
          selectedTimeframe={timeFilter}
          onTimeframeChange={(value) => setTimeFilter(value)}
          widgetId={widgetId}
        />
      )}
    </div>
    ),
    [
      isInitialLoad,
      isEmpty,
      snapshots,
      portfolioData,
      selectedCoins,
      getCoinColor,
      timeFilter,
      privacyMode,
      selectedCurrency,
      startYAxisAtZero,
      setTimeFilter,
      widgetId,
    ]
  );

  const renderOptionsContent = useCallback(
    () => (
      <div className="space-y-md">
        {/* Widget Name */}
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">
            Widget Name
          </label>
          <input
            type="text"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Portfolio Value"
            className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Leave empty to use the dynamic name based on filters
          </p>
        </div>

        {/* Currency Selection */}
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">
            Display Currency
          </label>
          <Select
            value={selectedCurrency}
            onValueChange={(v) => setSelectedCurrency(v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((currency) => (
                <SelectItem key={currency.code} value={currency.code}>
                  {currency.symbol} {currency.code} - {currency.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Chart Options */}
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">
            Chart Options
          </label>
          <div className="space-y-xs">
            <div
              className="flex items-center justify-between p-xs rounded hover:bg-muted/50 cursor-pointer"
              onClick={() => setStartYAxisAtZero(!startYAxisAtZero)}
            >
              <div className="flex items-center gap-sm">
                <div className="text-foreground font-medium text-sm">
                  Start Y axis at 0
                </div>
              </div>
              <div
                className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                  startYAxisAtZero
                    ? 'bg-primary border-primary'
                    : 'border-border'
                }`}
              >
                {startYAxisAtZero && (
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
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    [
      customName,
      setCustomName,
      selectedCurrency,
      setSelectedCurrency,
      startYAxisAtZero,
      setStartYAxisAtZero,
    ]
  );

  const metadata = useMemo(
    () => ({
      ...getWidgetMetadata('portfolio-value'),
      id: widgetId,
      title: 'Portfolio Value', // Keep static base title
      hasFilters: true,
      filterContent: filterContent,
      filtersActive: filtersActive,
      onClearFilters: clearAllFilters,
      ...(hideHeaderValue ? {} : { value: portfolioValue }),
      hasOptions: true,
    }),
    [
      widgetId,
      filterContent,
      filtersActive,
      clearAllFilters,
      hideHeaderValue,
      portfolioValue,
    ]
  );

  const cacheQueries = useMemo(
    () =>
      portfolioQuery.variables
        ? [
            {
              queryKey: 'getPortfolioByUser',
              variables: portfolioQuery.variables as Record<string, unknown>,
            },
          ]
        : [],
    [portfolioQuery]
  );

  // Keep this as a memo (do NOT collapse to a plain literal): it stabilizes
  // inline-created values — the `style` object, the `menuActions` object with its
  // inline `onOptions` handler, and `onCloseOptionsDialog`. `WidgetWrapper` is
  // `React.memo`'d, so recreating these every render would defeat its memo and
  // re-render the wrapper on every parent render.
  const wrapperProps = useMemo(
    () => ({
      metadata,
      isEditable,
      isCollapsible,
      style: allowResize
        ? {}
        : {
            height: typeof height === 'number' ? `${height}px` : height,
            minHeight: typeof height === 'number' ? `${height}px` : height,
          },
      onNameChange: handleNameChange, // Add inline name editing
      menuActions: {
        ...menuActions,
        onOptions: () => setShowOptionsDialog(true),
      },
      // Centralized options modal props
      showOptionsDialog,
      onCloseOptionsDialog: () => setShowOptionsDialog(false),
      optionsTitle: 'Portfolio Value Options',
      renderOptionsContent,
      ...(onRemove && { onRemove }),
      ...(onSettings && { onSettings }),
      ...(onCollapse && { onCollapse }),
      ...(onTabMove && { onTabMove }),
      registry: 'dashboard' as const, // Add registry for fullscreen functionality
      // Track GraphQL query for stale-while-revalidate indicator
      cacheQueries,
    }),
    [
      metadata,
      isEditable,
      isCollapsible,
      allowResize,
      height,
      handleNameChange,
      menuActions,
      showOptionsDialog,
      renderOptionsContent,
      onRemove,
      onSettings,
      onCollapse,
      onTabMove,
      cacheQueries,
    ]
  );

  return <WidgetWrapper {...wrapperProps}>{content}</WidgetWrapper>;
};

export default React.memo(PortfolioValue);
