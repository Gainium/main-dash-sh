import { BacktestResultsFullModal } from '@/components/widgets/bots/backtest/redesign';
import { BACKTEST_DB_UPDATED_EVENT } from '@/constants/backtest';
import type {
  BacktestingSettings,
  DCABacktestingResult,
  DCABotSettings,
  StoreBacktest,
} from '@/types';
import {
  getAllFull as getLocalBacktests,
  getHedgeAllFull as getLocalHedgeBacktests,
} from '@/utils/backtest/db';
import { useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  BarChart3,
  Database,
  Download,
  HardDrive,
  RefreshCw,
  Server,
  Trash2,
  Upload,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BacktestMobileView } from '../components/backtest/BacktestMobileView';
import BuyAndHoldChart from '../components/charts/BuyAndHoldChart';
import PerformanceMetricsChart from '../components/charts/PerformanceMetricsChart';
import ProfitLossChart from '../components/charts/ProfitLossChart';
import ReturnsRiskChart from '../components/charts/ReturnsRiskChart';
import MainLayout from '../components/layout/MainLayout';
import WidgetContainer from '../components/layout/WidgetContainer';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { ConfirmationDialog } from '../components/ui/confirmation-dialog';
import { DataTable } from '../components/ui/data-table/data-table';
import {
  DetailDrawer,
  DetailDrawerContent,
  DetailDrawerHeader,
  DetailDrawerTitle,
} from '../components/ui/detail-drawer';
import { Input } from '../components/ui/input';
import { PageTransition } from '../components/ui/MotionWrapper';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs';
import Widget from '../components/ui/widget';
import {
  useDeleteBacktests,
  useExportBacktests,
  useImportBacktests,
} from '../hooks/useBacktestDataManagement';
import { useBacktests, type BacktestData } from '../hooks/useBacktests';
import { toast } from '../lib/toast';
import { formatBytes, formatDate } from '../utils/formatters';

// Transform BacktestData to display format
interface BacktestDisplayData extends BacktestData {
  displayName: string;
  displayPair: string;
  displayStrategy: string;
  displayProfit: number;
  displayReturn: number;
  displaySize: number;
  displayCreated: string;
}

const BacktestDataPage: React.FC = () => {
  // const { user } = useAuthStore();
  const [activeTypeTab, setActiveTypeTab] = useState<
    'regular' | 'hedge' | 'combo' | 'grid'
  >('regular');
  const [activeDataTab, setActiveDataTab] = useState<'local' | 'remote'>(
    'remote'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [strategyFilter, setStrategyFilter] = useState<string>('all');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [localBacktests, setLocalBacktests] = useState<StoreBacktest[]>([]);
  const [localHedgeBacktests, setLocalHedgeBacktests] = useState<
    StoreBacktest[]
  >([]);
  const [isLocalLoading, setIsLocalLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();

  // Dialog states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showDetailDrawer, setShowDetailDrawer] = useState(false);
  const [selectedBacktest, setSelectedBacktest] =
    useState<BacktestDisplayData | null>(null);
  // Redesigned full-screen results modal — opened from a row's action.
  // The modal reads `strategy` from the row's `settings.strategy` and renders
  // the right view (DCA / Combo / Grid) internally. Saved rows may have
  // `deals`/`portfolio`/`transaction` stripped (short history) — the modal
  // degrades gracefully.
  const [resultsRow, setResultsRow] = useState<BacktestDisplayData | null>(
    null
  );
  const [resultsOpen, setResultsOpen] = useState(false);

  const openResults = useCallback((row: BacktestDisplayData) => {
    setResultsRow(row);
    setResultsOpen(true);
  }, []);

  // Enhanced Widget Component (same as TradingBots page)
  const EnhancedStatsWidget: React.FC<{
    title: string;
    value: string | number;
    subtitle?: string;
    icon: React.ReactNode;
    colorClass?: string;
    isLoading?: boolean;
  }> = ({
    title,
    value,
    subtitle,
    icon,
    colorClass = 'from-blue-500 to-blue-600',
    isLoading = false,
  }) => {
    if (isLoading) {
      return (
        <Widget noPadding className="p-md relative overflow-hidden">
          <div className="space-y-md animate-pulse">
            <div className="flex items-center justify-between">
              <div className="h-4 bg-muted rounded w-20"></div>
              <div className="h-6 w-6 bg-muted rounded"></div>
            </div>
            <div className="space-y-sm">
              <div className="h-8 bg-muted rounded w-24"></div>
              <div className="h-3 bg-muted rounded w-16"></div>
            </div>
          </div>
        </Widget>
      );
    }

    return (
      <Widget
        noPadding
        className="p-md relative overflow-hidden group hover:shadow-lg transition-all duration-200"
      >
        {/* Background gradient */}
        <div
          className={`absolute inset-0 bg-linear-to-br ${colorClass} opacity-5 group-hover:opacity-10 transition-opacity`}
        />

        <div className="relative z-10 space-y-md">
          {/* Header with icon */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">
              {title}
            </h3>
            <div className="text-muted-foreground">{icon}</div>
          </div>

          {/* Main value */}
          <div className="space-y-xs">
            <div className="text-2xl font-bold">{value}</div>
            {subtitle && (
              <div className="text-sm text-muted-foreground">{subtitle}</div>
            )}
          </div>
        </div>
      </Widget>
    );
  };

  // Fetch backtest data
  const { backtests, isLoading, error, refetch } = useBacktests({
    filters: {
      page: 0,
      pageSize: 50,
    },
  });

  // Data management hooks
  const deleteBacktestsMutation = useDeleteBacktests();
  const exportBacktestsMutation = useExportBacktests();
  const importBacktestsMutation = useImportBacktests();
  // const cleanupBacktestsMutation = useCleanupBacktests();

  const loadLocalBacktests = useCallback(async () => {
    setIsLocalLoading(true);
    try {
      const [data, hedgeData] = await Promise.all([
        getLocalBacktests(),
        getLocalHedgeBacktests(),
      ]);
      setLocalBacktests(data);
      setLocalHedgeBacktests(hedgeData as unknown as StoreBacktest[]);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown error while reading local storage.';
      toast.error(`Failed to load local backtests: ${message}`);
    } finally {
      setIsLocalLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLocalBacktests();
  }, [loadLocalBacktests]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handler = () => {
      void loadLocalBacktests();
    };

    window.addEventListener(BACKTEST_DB_UPDATED_EVENT, handler);
    return () => {
      window.removeEventListener(BACKTEST_DB_UPDATED_EVENT, handler);
    };
  }, [loadLocalBacktests]);

  const convertLocalBacktest = useCallback(
    (entry: StoreBacktest): BacktestDisplayData | null => {
      try {
        const parsed = JSON.parse(entry.data) as Partial<
          DCABacktestingResult & { config?: BacktestingSettings }
        >;

        const toIsoString = (value?: number | string) => {
          if (value === undefined || value === null) {
            return undefined;
          }
          if (typeof value === 'string') {
            return value;
          }
          const date = new Date(value);
          return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
        };

        const toNumeric = (value?: number | string | null) => {
          if (value === undefined || value === null || value === '') {
            return undefined;
          }
          const parsedValue =
            typeof value === 'number' ? value : Number(value as string);
          return Number.isNaN(parsedValue) ? undefined : parsedValue;
        };

        const mapSplitTime = (
          value?: DCABacktestingResult['duration']['avgSplitDealDuration']
        ) => {
          if (!value) {
            return undefined;
          }
          const mapped: { d?: number; h?: number; min?: number; s?: number } =
            {};
          const days = toNumeric(value.d);
          const hours = toNumeric(value.h);
          const minutes = toNumeric(value.min);
          const seconds = toNumeric(value.s);
          if (days !== undefined) {
            mapped.d = days;
          }
          if (hours !== undefined) {
            mapped.h = hours;
          }
          if (minutes !== undefined) {
            mapped.min = minutes;
          }
          if (seconds !== undefined) {
            mapped.s = seconds;
          }
          return Object.keys(mapped).length > 0 ? mapped : undefined;
        };

        const avgSplitDuration = mapSplitTime(
          parsed.duration?.avgSplitDealDuration
        );
        const botWorkingTime = mapSplitTime(parsed.duration?.botWorkingTime);
        const maxDealDuration = mapSplitTime(parsed.duration?.maxDealDuration);

        let duration: BacktestData['duration'] | undefined;
        if (parsed.duration) {
          duration = {};
          if (parsed.duration.avgDealDuration !== undefined) {
            duration.avgDealDuration = parsed.duration.avgDealDuration;
          }
          if (avgSplitDuration) {
            duration.avgSplitDealDuration = avgSplitDuration;
          }
          if (parsed.duration.firstDataTime !== undefined) {
            const firstDataIso = toIsoString(parsed.duration.firstDataTime);
            if (firstDataIso) {
              duration.firstDataTime = firstDataIso;
            }
          }
          if (parsed.duration.lastDataTime !== undefined) {
            const lastDataIso = toIsoString(parsed.duration.lastDataTime);
            if (lastDataIso) {
              duration.lastDataTime = lastDataIso;
            }
          }
          if (parsed.duration.loadingDataTime !== undefined) {
            duration.loadingDataTime = parsed.duration.loadingDataTime;
          }
          if (parsed.duration.processingDataTime !== undefined) {
            duration.processingDataTime = parsed.duration.processingDataTime;
          }
          if (botWorkingTime) {
            duration.botWorkingTime = botWorkingTime;
          }
          if (parsed.duration.botWorkingTimeNumber !== undefined) {
            duration.botWorkingTimeNumber =
              parsed.duration.botWorkingTimeNumber;
          }
          if (maxDealDuration) {
            duration.maxDealDuration = maxDealDuration;
          }
          if (parsed.duration.periodName) {
            duration.periodName = parsed.duration.periodName;
          }
          if (parsed.duration.avgWinningTrade !== undefined) {
            duration.avgWinningTrade = parsed.duration.avgWinningTrade;
          }
          if (parsed.duration.maxWinningTrade !== undefined) {
            duration.maxWinningTrade = parsed.duration.maxWinningTrade;
          }
          if (parsed.duration.avgLosingTrade !== undefined) {
            duration.avgLosingTrade = parsed.duration.avgLosingTrade;
          }
          if (parsed.duration.maxLosingTrade !== undefined) {
            duration.maxLosingTrade = parsed.duration.maxLosingTrade;
          }
        }

        const profitByPeriodValue = parsed.ratios?.profitByPeriod;
        const resolvedProfitByPeriod = Array.isArray(profitByPeriodValue)
          ? profitByPeriodValue.at(-1)
          : profitByPeriodValue;

        let ratios: BacktestData['ratios'] | undefined;
        if (parsed.ratios) {
          ratios = {};
          if (parsed.ratios.profitFactor !== undefined) {
            ratios.profitFactor = parsed.ratios.profitFactor;
          }
          if (resolvedProfitByPeriod !== undefined) {
            ratios.profitByPeriod = resolvedProfitByPeriod;
          }
          if (parsed.ratios.buyAndHold) {
            ratios.buyAndHold = parsed.ratios.buyAndHold;
          }
          if (parsed.ratios.periodRatio !== undefined) {
            ratios.periodRatio = parsed.ratios.periodRatio;
          }
          if (parsed.ratios.sharpe !== undefined) {
            ratios.sharpe = parsed.ratios.sharpe;
          }
          if (parsed.ratios.sortino !== undefined) {
            ratios.sortino = parsed.ratios.sortino;
          }
          if (parsed.ratios.cwr !== undefined) {
            ratios.cwr = parsed.ratios.cwr;
          }
        }

        const rawConfidence = parsed.numerical?.confidenceGrade;
        const normalizedConfidence =
          typeof rawConfidence === 'number'
            ? rawConfidence
            : toNumeric(rawConfidence);

        let numerical: BacktestData['numerical'] | undefined;
        if (parsed.numerical) {
          numerical = {};
          if (parsed.numerical.all !== undefined) {
            numerical.all = parsed.numerical.all;
          }
          if (parsed.numerical.profit !== undefined) {
            numerical.profit = parsed.numerical.profit;
          }
          if (parsed.numerical.loss !== undefined) {
            numerical.loss = parsed.numerical.loss;
          }
          if (parsed.numerical.open !== undefined) {
            numerical.open = parsed.numerical.open;
          }
          if (parsed.numerical.closed !== undefined) {
            numerical.closed = parsed.numerical.closed;
          }
          if (parsed.numerical.maxConsecutiveWins !== undefined) {
            numerical.maxConsecutiveWins = parsed.numerical.maxConsecutiveWins;
          }
          if (parsed.numerical.maxConsecutiveLosses !== undefined) {
            numerical.maxConsecutiveLosses =
              parsed.numerical.maxConsecutiveLosses;
          }
          if (parsed.numerical.maxDCATriggered !== undefined) {
            numerical.maxDCATriggered = parsed.numerical.maxDCATriggered;
          }
          if (parsed.numerical.avgDCATriggered !== undefined) {
            numerical.avgDCATriggered = parsed.numerical.avgDCATriggered;
          }
          if (parsed.numerical.dealsPerDay !== undefined) {
            numerical.dealsPerDay = parsed.numerical.dealsPerDay;
          }
          if (parsed.numerical.coveredPriceDeviation !== undefined) {
            numerical.coveredPriceDeviation =
              parsed.numerical.coveredPriceDeviation;
          }
          if (parsed.numerical.actualPriceDeviation !== undefined) {
            numerical.actualPriceDeviation =
              parsed.numerical.actualPriceDeviation;
          }
          if (parsed.numerical.liquidationEvents !== undefined) {
            numerical.liquidationEvents = parsed.numerical.liquidationEvents;
          }
          if (normalizedConfidence !== undefined) {
            numerical.confidenceGrade = normalizedConfidence;
          }
          if (parsed.numerical.dealsForConfidenceGrade !== undefined) {
            numerical.dealsForConfidenceGrade =
              parsed.numerical.dealsForConfidenceGrade;
          }
          if (parsed.numerical.priceDeviation !== undefined) {
            numerical.priceDeviation = parsed.numerical.priceDeviation;
          }
        }

        let config: BacktestData['config'] | undefined;
        if (parsed.config) {
          config = {};
          const userFee = toNumeric(parsed.config.userFee);
          const slippage = toNumeric(parsed.config.slippage);
          const rfr = toNumeric(parsed.config.RFR);
          const mar = toNumeric(parsed.config.MAR);
          if (userFee !== undefined) {
            config.userFee = userFee;
          }
          if (slippage !== undefined) {
            config.slippage = slippage;
          }
          if (parsed.config.firstDataTime !== undefined) {
            const configFirst = toIsoString(parsed.config.firstDataTime);
            if (configFirst) {
              config.firstDataTime = configFirst;
            }
          }
          if (parsed.config.lastDataTime !== undefined) {
            const configLast = toIsoString(parsed.config.lastDataTime);
            if (configLast) {
              config.lastDataTime = configLast;
            }
          }
          if (rfr !== undefined) {
            config.RFR = rfr;
          }
          if (mar !== undefined) {
            config.MAR = mar;
          }
          if (parsed.config.pair) {
            config.pair = parsed.config.pair;
          }
          if (parsed.config.multiIdependent !== undefined) {
            config.multiIdependent = parsed.config.multiIdependent;
          }
          if (parsed.config.multiCombined !== undefined) {
            config.multiCombined = parsed.config.multiCombined;
          }
        }

        const profit = parsed.financial?.netProfitTotal ?? 0;
        const annualReturn = parsed.financial?.annualizedReturn ?? 0;
        const createdTs =
          parsed.duration?.lastDataTime ??
          parsed.duration?.firstDataTime ??
          Date.now();
        const createdIso = new Date(createdTs).toISOString();

        const localRecord: Partial<BacktestDisplayData> = {
          _id: entry.id,
          symbol: entry.symbol,
          baseAsset: entry.baseAsset,
          quoteAsset: entry.quoteAsset,
          time: createdTs,
          exchange: entry.exchange,
          savePermanent: false,
          serverSide: false,
          settings: {
            name: `${entry.symbol} Local`,
            pair: entry.symbol,
            strategy: entry.type,
          },
          displayName: `${entry.symbol} (Local)`,
          displayPair: entry.symbol,
          displayStrategy: entry.type || 'Local',
          displayProfit: profit,
          displayReturn: annualReturn,
          displaySize: entry.size ?? 0,
          displayCreated: formatDate(createdIso),
        };

        if (parsed.interval) {
          localRecord.interval = parsed.interval.toString();
        }
        if (parsed.quoteRate !== undefined) {
          localRecord.quoteRate = parsed.quoteRate;
        }
        if (parsed.financial) {
          localRecord.financial = parsed.financial;
        }
        if (duration) {
          localRecord.duration = duration;
        }
        if (parsed.usage) {
          localRecord.usage = parsed.usage;
        }
        if (numerical) {
          localRecord.numerical = numerical;
        }
        if (ratios) {
          localRecord.ratios = ratios;
        }
        if (config) {
          localRecord.config = config;
        }

        return localRecord as unknown as BacktestDisplayData;
      } catch (error) {
        console.warn('Failed to parse local backtest entry', error);
        return null;
      }
    },
    []
  );

  // Check for mobile viewport
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Transform data for display
  const displayData = useMemo((): BacktestDisplayData[] => {
    const remoteData = (backtests ?? []).map(
      (backtest: BacktestData): BacktestDisplayData => {
        // Handle different pair formats from the backend
        let pair = 'Unknown';
        if (backtest.symbol) {
          pair = backtest.symbol;
        } else if (backtest.settings?.pair) {
          if (Array.isArray(backtest.settings.pair)) {
            pair = backtest.settings.pair[0] || 'Unknown';
          } else {
            pair = backtest.settings.pair;
          }
        } else if (backtest.baseAsset && backtest.quoteAsset) {
          pair = `${backtest.baseAsset}/${backtest.quoteAsset}`;
        }

        // Extract name from settings or generate from pair
        const name =
          backtest.settings?.name || backtest.note || `${pair} Backtest`;

        // Extract strategy from settings
        const strategy = backtest.settings?.strategy || 'DCA';

        // Use time field for creation date if available
        const createdDate = backtest.time
          ? new Date(backtest.time).toISOString()
          : backtest.created || new Date().toISOString();

        return {
          ...backtest,
          serverSide: true,
          displayName: name,
          displayPair: pair,
          displayStrategy: strategy,
          displayProfit: backtest.financial?.netProfitTotal || 0,
          displayReturn: backtest.financial?.annualizedReturn || 0,
          displaySize: 0, // Will be calculated from actual data size
          displayCreated: formatDate(createdDate),
        };
      }
    );

    const localData = [
      ...localBacktests.map(convertLocalBacktest),
      ...localHedgeBacktests.map(convertLocalBacktest),
    ].filter((item): item is BacktestDisplayData => item !== null);

    return [...localData, ...remoteData];
  }, [backtests, localBacktests, convertLocalBacktest, localHedgeBacktests]);

  // Filter data based on search and filters
  const filteredData = useMemo(() => {
    return displayData.filter((item) => {
      const matchesSearch =
        searchQuery === '' ||
        item.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.displayPair.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStrategy =
        strategyFilter === 'all' ||
        item.displayStrategy.toLowerCase() === strategyFilter.toLowerCase();

      let matchesTypeTab = false;
      const strategy = item.displayStrategy;

      switch (activeTypeTab) {
        case 'regular':
          matchesTypeTab = strategy === 'DCA';
          break;
        case 'grid':
          matchesTypeTab = strategy === 'Grid';
          break;
        case 'combo':
          matchesTypeTab = strategy === 'Combo';
          break;
        case 'hedge':
          matchesTypeTab = strategy === 'HedgeDca' || strategy === 'HedgeCombo';
          break;
      }

      return matchesSearch && matchesStrategy && matchesTypeTab;
    });
  }, [displayData, searchQuery, strategyFilter, activeTypeTab]);

  // Get unique strategies for filter
  const strategies = useMemo(() => {
    const uniqueStrategies = [
      ...new Set(displayData.map((item) => item.displayStrategy)),
    ];
    return uniqueStrategies.filter(Boolean);
  }, [displayData]);

  // Calculate storage statistics
  const storageStats = useMemo(() => {
    const totalItems = filteredData.length;
    const totalSize = filteredData.reduce(
      (sum, item) => sum + item.displaySize,
      0
    );
    const profitableItems = filteredData.filter(
      (item) => item.displayProfit > 0
    ).length;
    const profitablePercentage =
      totalItems > 0 ? (profitableItems / totalItems) * 100 : 0;

    return {
      totalItems,
      totalSize,
      profitableItems,
      profitablePercentage,
    };
  }, [filteredData]);

  // Define table columns
  const columns: ColumnDef<BacktestDisplayData>[] = [
    {
      accessorKey: 'displayName',
      header: 'Name',
      cell: ({ row }) => (
        <div className="flex flex-col py-xs">
          <span className="font-medium text-sm">
            {row.original.displayName}
          </span>
          <span className="text-xs text-muted-foreground">
            {row.original.displayPair}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'displayStrategy',
      header: 'Strategy',
      cell: ({ row }) => (
        <div className="py-xs">
          <Badge variant="outline" className="text-xs">
            {row.original.displayStrategy}
          </Badge>
        </div>
      ),
    },
    {
      accessorKey: 'displayProfit',
      header: 'Net Profit',
      cell: ({ row }) => {
        const profit = row.original.displayProfit;
        return (
          <div className="py-xs">
            <span
              className={`font-medium ${
                profit >= 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {profit >= 0 ? '+' : ''}${profit.toFixed(2)}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: 'displayReturn',
      header: 'Annual Return',
      cell: ({ row }) => {
        const returnValue = row.original.displayReturn;
        return (
          <div className="py-xs">
            <span
              className={`font-medium ${
                returnValue >= 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {returnValue >= 0 ? '+' : ''}
              {returnValue.toFixed(1)}%
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: 'serverSide',
      header: 'Type',
      cell: ({ row }) => (
        <div className="py-xs">
          <Badge variant={row.original.serverSide ? 'default' : 'secondary'}>
            {row.original.serverSide ? 'Server' : 'Local'}
          </Badge>
        </div>
      ),
    },
    {
      accessorKey: 'displayCreated',
      header: 'Created',
      cell: ({ row }) => (
        <div className="py-xs">
          <span className="text-sm text-muted-foreground">
            {row.original.displayCreated}
          </span>
        </div>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-xs py-xs">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openResults(row.original)}
          >
            View Results
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedBacktest(row.original);
              setShowDetailDrawer(true);
            }}
          >
            View Details
          </Button>
        </div>
      ),
    },
  ];

  // Handle bulk actions
  const handleBulkDelete = async () => {
    if (selectedItems.length === 0) return;
    setShowDeleteDialog(true);
  };

  const confirmBulkDelete = async () => {
    try {
      await deleteBacktestsMutation.mutateAsync({ ids: selectedItems });
      toast.success(
        `Deleted ${selectedItems.length} backtest${selectedItems.length > 1 ? 's' : ''} successfully.`
      );
      setSelectedItems([]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete backtests.'
      );
    }
    setShowDeleteDialog(false);
  };

  const handleExport = async () => {
    const itemsToExport =
      selectedItems.length > 0
        ? selectedItems
        : filteredData.map((item) => item._id);

    if (itemsToExport.length === 0) {
      toast.warning('No backtests to export.');
      return;
    }

    try {
      await exportBacktestsMutation.mutateAsync({ ids: itemsToExport });
      toast.success(
        `Exported ${itemsToExport.length} backtest${itemsToExport.length > 1 ? 's' : ''} successfully.`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to export backtests.'
      );
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.csv';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const result = await importBacktestsMutation.mutateAsync(file);
        toast.success(
          `Imported ${result.importedCount} backtest${result.importedCount > 1 ? 's' : ''} successfully.`
        );
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Failed to import backtests.'
        );
      }
    };
    input.click();
  };

  const handleImportConfirm = async () => {
    // This will be called when the import dialog is confirmed
    // The actual import logic is handled in handleImport
    setShowImportDialog(false);
  };

  const handleExportConfirm = async () => {
    // This will be called when the export dialog is confirmed
    // The actual export logic is handled in handleExport
    await handleExport();
    setShowExportDialog(false);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);

    try {
      // First try the refetch function
      if (refetch) {
        await refetch();
      }

      // Also invalidate the query cache to force a fresh fetch
      // The cache key includes user identifier and trading context
      await queryClient.invalidateQueries({
        predicate: (query) => {
          const queryKey = query.queryKey;
          return (
            Array.isArray(queryKey) &&
            (queryKey[0] === 'user' ||
              queryKey[0] === 'backtests' ||
              (queryKey[0] === 'user' && queryKey.includes('getUserFiles')))
          );
        },
      });
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (error) {
    return (
      <MainLayout pageTitle="Backtest Data" activePage="backtest-data">
        <PageTransition className="h-full min-h-0 flex flex-col">
          <WidgetContainer
            layout="flex"
            verticalGap
            className="h-full min-h-0 flex-1"
          >
            <div className="flex items-center justify-center h-32">
              <div className="text-center">
                <BarChart3 className="w-8 h-8 mx-auto mb-sm text-muted-foreground opacity-50" />
                <h3 className="text-base font-medium mb-xs">
                  Failed to Load Backtest Data
                </h3>
                <p className="text-sm text-muted-foreground mb-sm">
                  {error.message}
                </p>
                <Button
                  onClick={handleRefresh}
                  variant="outline"
                  size="sm"
                  disabled={isRefreshing}
                >
                  <RefreshCw
                    className={`w-4 h-4 mr-xs ${isRefreshing ? 'animate-spin' : ''}`}
                  />
                  Retry
                </Button>
              </div>
            </div>
          </WidgetContainer>
        </PageTransition>
      </MainLayout>
    );
  }

  return (
    <MainLayout pageTitle="Backtest Data" activePage="backtest-data">
      <PageTransition className="h-full min-h-0 flex flex-col">
        <WidgetContainer
          layout="flex"
          verticalGap
          className="h-full min-h-0 flex-1"
        >
          {/* Page Header */}
          <div className="flex flex-col space-y-md">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-md">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  Backtest Data
                </h1>
                <p className="text-muted-foreground">
                  Manage and analyze your backtest results across different
                  strategies
                </p>
              </div>

              {/* Primary Actions */}
              <div className="flex flex-wrap items-center gap-xs">
                <Button variant="outline" size="sm" onClick={handleImport}>
                  <Upload className="w-4 h-4 mr-xs" />
                  Import
                </Button>
                <Button variant="outline" size="sm" onClick={handleExport}>
                  <Download className="w-4 h-4 mr-xs" />
                  Export
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                >
                  <RefreshCw
                    className={`w-4 h-4 mr-xs ${isRefreshing ? 'animate-spin' : ''}`}
                  />
                  Refresh
                </Button>
              </div>
            </div>

            {/* Search and Filters - Always visible but responsive */}
            <div className="flex flex-col sm:flex-row gap-sm">
              <div className="flex-1">
                <Input
                  placeholder="Search backtests by name or pair..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="w-full sm:w-48">
                <Select
                  value={strategyFilter}
                  onValueChange={setStrategyFilter}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Filter by strategy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Strategies</SelectItem>
                    {strategies.map((strategy) => (
                      <SelectItem key={strategy} value={strategy.toLowerCase()}>
                        {strategy}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Statistics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md">
            <EnhancedStatsWidget
              title="Total Backtests"
              value={storageStats.totalItems}
              subtitle={`${storageStats.profitableItems} profitable (${storageStats.profitablePercentage.toFixed(1)}%)`}
              icon={<Database className="w-4 h-4" />}
              colorClass="from-blue-500 to-blue-600"
              isLoading={isLoading}
            />

            <EnhancedStatsWidget
              title="Storage Used"
              value={formatBytes(storageStats.totalSize)}
              subtitle="Across all backtest data"
              icon={<HardDrive className="w-4 h-4" />}
              colorClass="from-green-500 to-green-600"
              isLoading={isLoading}
            />

            <EnhancedStatsWidget
              title="Server Data"
              value={filteredData.filter((item) => item.serverSide).length}
              subtitle="Remote backtests"
              icon={<Server className="w-4 h-4" />}
              colorClass="from-purple-500 to-purple-600"
              isLoading={isLoading}
            />

            <EnhancedStatsWidget
              title="Local Data"
              value={filteredData.filter((item) => !item.serverSide).length}
              subtitle="Local backtests"
              icon={<Database className="w-4 h-4" />}
              colorClass="from-orange-500 to-orange-600"
              isLoading={isLoading}
            />
          </div>

          {/* Main Content */}
          <div className="space-y-lg">
            {/* Backtest Type Tabs */}
            <Tabs
              value={activeTypeTab}
              onValueChange={(value) =>
                setActiveTypeTab(
                  value as 'regular' | 'hedge' | 'combo' | 'grid'
                )
              }
            >
              <div className="flex flex-col space-y-md">
                {/* Tab Navigation */}
                <div className="flex items-center justify-between">
                  <TabsList className="grid w-full max-w-lg grid-cols-5">
                    <TabsTrigger value="regular" className="text-xs sm:text-sm">
                      Regular
                    </TabsTrigger>
                    <TabsTrigger value="hedge" className="text-xs sm:text-sm">
                      Hedge
                    </TabsTrigger>
                    <TabsTrigger value="combo" className="text-xs sm:text-sm">
                      Combo
                    </TabsTrigger>
                    <TabsTrigger value="grid" className="text-xs sm:text-sm">
                      Grid
                    </TabsTrigger>
                    <TabsTrigger value="charts" className="text-xs sm:text-sm">
                      Charts
                    </TabsTrigger>
                  </TabsList>

                  {/* Bulk Actions */}
                  {selectedItems.length > 0 && (
                    <div className="flex items-center gap-xs">
                      <span className="text-sm text-muted-foreground">
                        {selectedItems.length} selected
                      </span>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleBulkDelete}
                      >
                        <Trash2 className="w-4 h-4 mr-xs" />
                        Delete Selected
                      </Button>
                    </div>
                  )}
                </div>

                {['regular', 'hedge', 'combo', 'grid'].map((tabValue) => (
                  <TabsContent
                    key={tabValue}
                    value={tabValue}
                    className="space-y-md"
                  >
                    <Tabs
                      value={activeDataTab}
                      onValueChange={(value) =>
                        setActiveDataTab(value as 'local' | 'remote')
                      }
                    >
                      <div className="flex items-center justify-between">
                        <TabsList>
                          <TabsTrigger value="remote">Remote Data</TabsTrigger>
                          <TabsTrigger value="local">Local Data</TabsTrigger>
                        </TabsList>
                      </div>

                      <TabsContent value="remote" className="mt-md">
                        {isMobile ? (
                          <BacktestMobileView
                            data={filteredData.filter(
                              (item) => item.serverSide
                            )}
                            searchQuery={searchQuery}
                            onSearchChange={setSearchQuery}
                            strategyFilter={strategyFilter}
                            onStrategyFilterChange={setStrategyFilter}
                            strategies={strategies}
                            selectedItems={selectedItems}
                            onSelectionChange={setSelectedItems}
                            onBulkDelete={handleBulkDelete}
                            onExport={handleExport}
                            isLoading={isLoading}
                          />
                        ) : (
                          <div className="rounded-lg border bg-card">
                            {isLoading ? (
                              <div className="flex items-center justify-center h-32">
                                <div className="text-center">
                                  <RefreshCw className="w-6 h-6 mx-auto mb-xs animate-spin opacity-50" />
                                  <div className="text-sm text-muted-foreground">
                                    Loading backtest data...
                                  </div>
                                </div>
                              </div>
                            ) : filteredData.filter((item) => item.serverSide)
                                .length === 0 ? (
                              <div className="flex items-center justify-center h-32">
                                <div className="text-center">
                                  <BarChart3 className="w-8 h-8 mx-auto mb-sm text-muted-foreground opacity-50" />
                                  <h3 className="text-base font-medium mb-xs">
                                    No Remote Backtest Data
                                  </h3>
                                  <p className="text-sm text-muted-foreground mb-sm">
                                    {searchQuery || strategyFilter !== 'all'
                                      ? 'No backtests match your current filters.'
                                      : 'Remote backtest data will appear here when available.'}
                                  </p>
                                  {(searchQuery ||
                                    strategyFilter !== 'all') && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setSearchQuery('');
                                        setStrategyFilter('all');
                                      }}
                                    >
                                      Clear Filters
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <DataTable
                                tableId={`backtest-data-${tabValue}-remote`}
                                columns={columns}
                                data={filteredData.filter(
                                  (item) => item.serverSide
                                )}
                                enableGlobalFilter={false}
                                enableColumnFilters={true}
                                enableSorting={true}
                                enableColumnReordering={true}
                                enableColumnVisibility={true}
                                enableColumnResizing={true}
                                enableGrouping={true}
                                showPagination={true}
                                className="border-0"
                                emptyMessage="No remote backtest data found."
                                defaultPinnedColumns={{
                                  left: [],
                                  right: ['actions'],
                                }}
                              />
                            )}
                          </div>
                        )}
                      </TabsContent>

                      <TabsContent value="local" className="mt-md">
                        {isMobile ? (
                          <BacktestMobileView
                            data={filteredData.filter(
                              (item) => !item.serverSide
                            )}
                            searchQuery={searchQuery}
                            onSearchChange={setSearchQuery}
                            strategyFilter={strategyFilter}
                            onStrategyFilterChange={setStrategyFilter}
                            strategies={strategies}
                            selectedItems={selectedItems}
                            onSelectionChange={setSelectedItems}
                            onBulkDelete={handleBulkDelete}
                            onExport={handleExport}
                            isLoading={isLocalLoading}
                          />
                        ) : (
                          <div className="rounded-lg border bg-card">
                            {isLocalLoading ? (
                              <div className="flex items-center justify-center h-32">
                                <div className="text-center">
                                  <RefreshCw className="w-6 h-6 mx-auto mb-xs animate-spin opacity-50" />
                                  <div className="text-sm text-muted-foreground">
                                    Loading local backtest data...
                                  </div>
                                </div>
                              </div>
                            ) : filteredData.filter((item) => !item.serverSide)
                                .length === 0 ? (
                              <div className="flex items-center justify-center h-32">
                                <div className="text-center">
                                  <Database className="w-8 h-8 mx-auto mb-sm text-muted-foreground opacity-50" />
                                  <h3 className="text-base font-medium mb-xs">
                                    No Local Backtest Data
                                  </h3>
                                  <p className="text-sm text-muted-foreground">
                                    Local backtest data will appear here when
                                    available.
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <DataTable
                                tableId={`backtest-data-${tabValue}-local`}
                                columns={columns}
                                data={filteredData.filter(
                                  (item) => !item.serverSide
                                )}
                                enableGlobalFilter={false}
                                enableColumnFilters={true}
                                enableSorting={true}
                                enableColumnReordering={true}
                                enableColumnVisibility={true}
                                enableColumnResizing={true}
                                enableGrouping={true}
                                showPagination={true}
                                className="border-0"
                                emptyMessage="No local backtest data found."
                                defaultPinnedColumns={{
                                  left: [],
                                  right: ['actions'],
                                }}
                              />
                            )}
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>
                  </TabsContent>
                ))}

                {/* Performance Charts */}
                <TabsContent value="charts" className="space-y-lg">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg">
                    {/* Performance Metrics Chart */}
                    <Widget noPadding className="p-lg">
                      <div className="space-y-md">
                        <div className="flex items-center gap-xs">
                          <BarChart3 className="w-5 h-5 text-primary" />
                          <h3 className="text-lg font-semibold">
                            Performance Metrics
                          </h3>
                        </div>
                        <PerformanceMetricsChart
                          data={filteredData
                            .filter(
                              (item) =>
                                item.ratios?.sharpe !== undefined ||
                                item.ratios?.sortino !== undefined ||
                                item.ratios?.cwr !== undefined ||
                                item.ratios?.profitFactor !== undefined
                            )
                            .map((item) => ({
                              name: item.displayName,
                              sharpe: item.ratios?.sharpe,
                              sortino: item.ratios?.sortino,
                              cwr: item.ratios?.cwr,
                              profitFactor: item.ratios?.profitFactor,
                            }))}
                          height={300}
                        />
                      </div>
                    </Widget>

                    {/* Profit/Loss Distribution Chart */}
                    <Widget noPadding className="p-lg">
                      <div className="space-y-md">
                        <div className="flex items-center gap-xs">
                          <BarChart3 className="w-5 h-5 text-primary" />
                          <h3 className="text-lg font-semibold">
                            Win/Loss Distribution
                          </h3>
                        </div>
                        <ProfitLossChart
                          data={filteredData.map((item) => ({
                            name: item.displayName,
                            profit: item.numerical?.profit,
                            loss: item.numerical?.loss,
                          }))}
                          height={300}
                        />
                      </div>
                    </Widget>

                    {/* Returns vs Risk Chart */}
                    <Widget noPadding className="p-lg">
                      <div className="space-y-md">
                        <div className="flex items-center gap-xs">
                          <BarChart3 className="w-5 h-5 text-primary" />
                          <h3 className="text-lg font-semibold">
                            Returns vs Risk
                          </h3>
                        </div>
                        <ReturnsRiskChart
                          data={filteredData.map((item) => ({
                            name: item.displayName,
                            annualizedReturn: item.financial?.annualizedReturn,
                            maxDrawDown: item.financial?.maxDrawDownPerc,
                            sharpe: item.ratios?.sharpe,
                          }))}
                          height={300}
                        />
                      </div>
                    </Widget>

                    {/* Buy and Hold Comparison Chart */}
                    <Widget noPadding className="p-lg">
                      <div className="space-y-md">
                        <div className="flex items-center gap-xs">
                          <BarChart3 className="w-5 h-5 text-primary" />
                          <h3 className="text-lg font-semibold">
                            Strategy vs Buy & Hold
                          </h3>
                        </div>
                        <BuyAndHoldChart
                          data={filteredData.map((item) => ({
                            name: item.displayName,
                            strategyReturn: item.financial?.annualizedReturn,
                            buyAndHoldReturn: item.ratios?.buyAndHold?.perc,
                          }))}
                          height={300}
                        />
                      </div>
                    </Widget>
                  </div>
                </TabsContent>

                {/* Placeholder tabs for other backtest types */}
                {['hedge', 'combo', 'grid'].map((type) => (
                  <TabsContent key={type} value={type} className="space-y-md">
                    <div className="rounded-lg border bg-card">
                      <div className="flex items-center justify-center h-32">
                        <div className="text-center">
                          <BarChart3 className="w-8 h-8 mx-auto mb-sm text-muted-foreground opacity-50" />
                          <h3 className="text-base font-medium mb-xs capitalize">
                            {type} Backtests
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {type} backtest data will be available here.
                          </p>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                ))}
              </div>
            </Tabs>
          </div>

          {/* Confirmation Dialogs */}
          <ConfirmationDialog
            open={showDeleteDialog}
            onOpenChange={setShowDeleteDialog}
            onConfirm={confirmBulkDelete}
            title="Delete Backtests"
            description={`Are you sure you want to delete ${selectedItems.length} selected backtest${selectedItems.length > 1 ? 's' : ''}? This action cannot be undone.`}
            confirmText="Delete"
            cancelText="Cancel"
            variant="destructive"
          />

          <ConfirmationDialog
            open={showImportDialog}
            onOpenChange={setShowImportDialog}
            onConfirm={handleImportConfirm}
            title="Import Backtests"
            description="Are you sure you want to import backtests from the selected file? This will add new backtests to your collection."
            confirmText="Import"
            cancelText="Cancel"
            variant="default"
          />

          <ConfirmationDialog
            open={showExportDialog}
            onOpenChange={setShowExportDialog}
            onConfirm={handleExportConfirm}
            title="Export Backtests"
            description={`Are you sure you want to export ${selectedItems.length} selected backtest${selectedItems.length > 1 ? 's' : ''} to a file?`}
            confirmText="Export"
            cancelText="Cancel"
            variant="default"
          />

          {/* Detail Drawer */}
          <DetailDrawer
            open={showDetailDrawer}
            onOpenChange={setShowDetailDrawer}
          >
            <DetailDrawerContent width="xl">
              <DetailDrawerHeader>
                <DetailDrawerTitle>
                  {selectedBacktest
                    ? `Backtest Details: ${selectedBacktest.displayName}`
                    : 'Backtest Details'}
                </DetailDrawerTitle>
              </DetailDrawerHeader>

              <div className="flex-1 overflow-y-auto p-lg">
                {selectedBacktest && (
                  <div className="space-y-lg">
                    <div className="grid grid-cols-2 gap-md">
                      <div>
                        <label className="text-sm font-medium text-gray-700">
                          Name
                        </label>
                        <p className="text-sm text-gray-900">
                          {selectedBacktest.displayName}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">
                          Pair
                        </label>
                        <p className="text-sm text-gray-900">
                          {selectedBacktest.displayPair}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">
                          Strategy
                        </label>
                        <p className="text-sm text-gray-900">
                          {selectedBacktest.displayStrategy}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">
                          Profit/Loss
                        </label>
                        <p className="text-sm text-gray-900">
                          {selectedBacktest.financial?.netProfitTotalUsd
                            ? `$${selectedBacktest.financial.netProfitTotalUsd.toFixed(2)}`
                            : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">
                          Win Rate
                        </label>
                        <p className="text-sm text-gray-900">
                          {selectedBacktest.numerical?.profit &&
                          selectedBacktest.numerical?.all
                            ? `${((selectedBacktest.numerical.profit / selectedBacktest.numerical.all) * 100).toFixed(1)}%`
                            : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">
                          Total Trades
                        </label>
                        <p className="text-sm text-gray-900">
                          {selectedBacktest.numerical?.all || 'N/A'}
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700">
                        Exchange
                      </label>
                      <p className="text-sm text-gray-900">
                        {selectedBacktest.exchange || 'N/A'}
                      </p>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700">
                        Time Range
                      </label>
                      <p className="text-sm text-gray-900">
                        {selectedBacktest.duration?.firstDataTime &&
                        selectedBacktest.duration?.lastDataTime
                          ? `${formatDate(selectedBacktest.duration.firstDataTime)} - ${formatDate(selectedBacktest.duration.lastDataTime)}`
                          : 'N/A'}
                      </p>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700">
                        Created
                      </label>
                      <p className="text-sm text-gray-900">
                        {selectedBacktest.created
                          ? formatDate(selectedBacktest.created)
                          : 'N/A'}
                      </p>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700">
                        Last Modified
                      </label>
                      <p className="text-sm text-gray-900">
                        {selectedBacktest.updated
                          ? formatDate(selectedBacktest.updated)
                          : 'N/A'}
                      </p>
                    </div>

                    <div className="flex gap-xs pt-4">
                      <Button variant="outline" size="sm">
                        Edit Backtest
                      </Button>
                      <Button variant="outline" size="sm">
                        Duplicate
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (selectedBacktest) {
                            setShowDetailDrawer(false);
                            openResults(selectedBacktest);
                          }
                        }}
                      >
                        View Results
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </DetailDrawerContent>
          </DetailDrawer>

          {/* Redesigned full-screen results modal */}
          {resultsRow && (
            <BacktestResultsFullModal
              open={resultsOpen}
              onOpenChange={setResultsOpen}
              result={resultsRow}
              strategy={resultsRow.settings?.strategy}
              settings={resultsRow.settings as unknown as DCABotSettings}
              meta={{
                symbol: resultsRow.symbol,
                exchange: resultsRow.exchange,
                baseAsset: resultsRow.baseAsset,
                quoteAsset: resultsRow.quoteAsset,
              }}
              botName={resultsRow.displayName || resultsRow.symbol || undefined}
            />
          )}
        </WidgetContainer>
      </PageTransition>
    </MainLayout>
  );
};

export default BacktestDataPage;
