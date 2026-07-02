import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import BotNotFoundNotice from '@/components/bots/BotNotFoundNotice';
import {
  BotPanelInsights,
  BotPanelLayout,
  type BotPanelInsightsTab,
} from '@/components/bots/panels';
import BotChartPanel from '@/components/bots/panels/contents/chart/BotChartPanel';
import BotFormPanel from '@/components/bots/panels/contents/form/BotFormPanel';
import { type PanelContentConfig } from '@/components/bots/panels/PanelContainer';
import MainLayout from '@/components/layout/MainLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProfitLossPercChip, StrategyChip } from '@/components/ui/chip';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import {
  DataTable,
  type BulkAction,
} from '@/components/ui/data-table/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import InlineNoteCell from '@/components/ui/InlineNoteCell';
import { BacktestPermanentCheckbox } from '@/components/widgets/bots/backtest';
import { BacktestResultsFullModal } from '@/components/widgets/bots/backtest/redesign';
import CoinPair from '@/components/widgets/shared/CoinPair';
import { TradingTerminalUtilsProvider } from '@/context/TradingTerminalUtilsContext';
import { useBotModeGuard } from '@/hooks/bots/base/useBotModeGuard';
import { useBotPageLoading } from '@/hooks/bots/base/useBotPageLoading';
import { useBotPageRedirect } from '@/hooks/bots/base/useBotPageRedirect';
import {
  useDeleteBacktests,
  useExportBacktests,
  useImportBacktestAsPaper,
  useLoadBacktestDetails,
  useShareBacktest,
} from '@/hooks/useBacktestDataManagement';
import { buildBacktestShareUrl } from '@/lib/shareLinks';
import { useBacktests } from '@/hooks/useBacktests';
import { useBacktestsSummary } from '@/hooks/useBacktestsSummary';
import { useComboBacktests } from '@/hooks/useComboBacktests';
import { useSetBacktestNote } from '@/hooks/useSetBacktestNote';
import { logger } from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/stores/authStore';
import { indicatorStore } from '@/stores/indicatorStore';
import { useTablePreferencesStore } from '@/stores/tablePreferencesStore';
import {
  BotTypesEnum,
  type BotChartData,
  type DCABacktestingResultHistory,
  type DCABotSettings,
} from '@/types';
import { exampleOrdersStore } from '@/utils/bots/dca/example-orders';
import { removePaperPrefix } from '@/utils/exchangeUtils';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Database,
  Download,
  FileUp,
  MoreVertical,
  Share2,
  Trash2,
  Upload,
} from 'lucide-react';

const INITIAL_LOADING_DELAY_MS = 1000;

const ComboBotEditWidget = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  useBotPageRedirect('/combo');
  const isLoading = useBotPageLoading(INITIAL_LOADING_DELAY_MS);

  const [selectedBacktest, setSelectedBacktest] =
    useState<DCABacktestingResultHistory | null>(null);
  const [activeInsightsTab, setActiveInsightsTab] = useState('history');
  // Clicking a backtest row opens the redesigned full-screen results modal
  // instead of rendering Overview/Deals/Analysis/Stats inline in the widget.
  const [resultsModalOpen, setResultsModalOpen] = useState(false);
  const [pendingBacktestId, setPendingBacktestId] = useState<string | null>(
    null
  );
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [backtestsToDelete, setBacktestsToDelete] = useState<string[]>([]);

  // Hooks for delete and export
  const deleteBacktestsMutation = useDeleteBacktests();
  const exportBacktestsMutation = useExportBacktests();
  const shareBacktestMutation = useShareBacktest();
  const importAsPaperMutation = useImportBacktestAsPaper();
  const loadBacktestDetailsMutation = useLoadBacktestDetails();
  const user = useAuthStore((state) => state.user);

  // Initialize Actions column as pinned right
  useEffect(() => {
    const tableId = 'combo-backtests-table-edit';
    const prefs = useTablePreferencesStore.getState().preferences[tableId];
    if (!prefs?.pinnedColumns?.right?.includes('actions')) {
      useTablePreferencesStore.getState().setPinnedColumns(tableId, {
        left: prefs?.pinnedColumns?.left || [],
        right: ['actions'],
      });
    }
  }, []);

  const hasBotId = Boolean(id);
  const safeBotId = id ?? '';

  // Keep this bot's real paper/live mode authoritative over the global
  // toggle so a refresh doesn't flip it (and surface a clear error when the
  // bot exists in neither mode instead of "Unknown exchange"). Thread 4872.
  const modeGuard = useBotModeGuard(safeBotId, BotTypesEnum.combo, {
    enabled: hasBotId,
  });
  const [chartData, setChartData] = useState<BotChartData>({});
  const handleFormDataChange = useCallback((data: BotChartData) => {
    setChartData(data);
  }, []);

  useEffect(() => {
    return () => {
      indicatorStore.reset();
      exampleOrdersStore.reset();
    };
  }, []);

  const {
    backtests,
    isLoading: backtestsLoading,
    error: backtestsError,
  } = useBacktests({
    filters: {
      page: 0,
      pageSize: 25,
    },
    enabled: hasBotId,
  });

  const backtestsSummary = useBacktestsSummary({
    backtests,
    isLoading: backtestsLoading,
    error: backtestsError,
    messages: {
      loadingSubtitle: 'Loading linked combo backtests',
    },
  });

  // Fetch combo backtests using the hook
  const {
    backtests: comboBacktests,
    isLoading: comboBacktestsLoading,
    error: comboBacktestsError,
  } = useComboBacktests();

  // Auto-select a newly completed backtest when it appears in the list
  useEffect(() => {
    if (!pendingBacktestId) return;
    const found = comboBacktests.find((b) => b._id === pendingBacktestId);
    if (found) {
      setSelectedBacktest(found);
      setResultsModalOpen(true);
      setPendingBacktestId(null);
      logger.info('[ComboBotEdit] Auto-selected completed backtest', {
        id: pendingBacktestId,
      });
    }
  }, [comboBacktests, pendingBacktestId]);

  const handleBacktestComplete = useCallback((backtestId: string) => {
    logger.info('[ComboBotEdit] Backtest completed, pending selection', {
      backtestId,
    });
    setPendingBacktestId(backtestId);
    setActiveInsightsTab('history');
  }, []);

  // Handle export single or multiple backtests
  const handleExportBacktests = useCallback(
    async (backtestIds: string[], format: 'json' | 'csv' = 'json') => {
      try {
        logger.info('[ComboBotEdit] Exporting backtests', {
          backtestIds,
          format,
          prefix: 'BACKTEST_EXPORT',
        });
        await exportBacktestsMutation.mutateAsync({ ids: backtestIds, format });
        toast.success(
          `Exported ${backtestIds.length} backtest${backtestIds.length > 1 ? 's' : ''} successfully`
        );
      } catch (error) {
        logger.error('[ComboBotEdit] Export failed', {
          error,
          prefix: 'BACKTEST_EXPORT',
        });
        toast.error(
          error instanceof Error ? error.message : 'Failed to export backtests'
        );
      }
    },
    [exportBacktestsMutation]
  );

  // Handle delete confirmation
  const handleDeleteBacktests = useCallback((backtestIds: string[]) => {
    setBacktestsToDelete(backtestIds);
    setShowDeleteDialog(true);
  }, []);

  const buildShareUrl = useCallback(
    (shareId: string) =>
      buildBacktestShareUrl({
        path: '/combo/backtests',
        shareId,
        subKind: 'combo',
      }),
    []
  );

  const handleShareBacktest = useCallback(
    async (backtest: DCABacktestingResultHistory) => {
      try {
        const result = await shareBacktestMutation.mutateAsync({
          id: backtest._id,
          shareId: backtest.shareId,
          backtestType: 'combo',
        });
        const url = buildShareUrl(result.shareId);
        await navigator.clipboard.writeText(url);
        toast.success('Link copied');
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Failed to share backtest'
        );
      }
    },
    [buildShareUrl, shareBacktestMutation]
  );

  const handleLoadBacktest = useCallback(
    (backtest: DCABacktestingResultHistory) => {
      try {
        // Stage the backtest settings for the fresh form on /combo/new
        // (same one-shot channel as "Copy to live"); the new form reads
        // it via useBotConfigPreload.
        sessionStorage.setItem(
          'botConfig',
          JSON.stringify({
            type: BotTypesEnum.combo,
            settings: backtest.settings,
          })
        );
        toast.success('Backtest settings loaded into new combo bot form');
        navigate('/combo/new');
      } catch (error) {
        logger.error('[ComboBotEdit] Failed to load backtest settings', {
          id: backtest._id,
          error: error instanceof Error ? error.message : String(error),
        });
        toast.error('Failed to load backtest settings into bot form');
      }
    },
    [navigate]
  );

  const handleLoadBacktestDetails = useCallback(
    async (backtest: DCABacktestingResultHistory) => {
      try {
        await loadBacktestDetailsMutation.mutateAsync({ id: backtest._id });
      } catch (error) {
        logger.warn(
          '[ComboBotEdit] Load details fallback to in-memory backtest',
          {
            error: error instanceof Error ? error.message : String(error),
            id: backtest._id,
          }
        );
      }
      setSelectedBacktest(backtest);
      setResultsModalOpen(true);
    },
    [loadBacktestDetailsMutation]
  );

  const handleImportAsPaper = useCallback(
    async (backtest: DCABacktestingResultHistory, trades = false) => {
      try {
        const exchange = removePaperPrefix(backtest.exchange);
        const result = await importAsPaperMutation.mutateAsync({
          id: backtest._id,
          backtestType: 'combo',
          exchange,
          from: backtest.duration?.firstDataTime
            ? new Date(backtest.duration.firstDataTime).getTime()
            : undefined,
          to: backtest.duration?.lastDataTime
            ? new Date(backtest.duration.lastDataTime).getTime()
            : undefined,
          trades,
        });
        toast.success(`Import backtest as paper bot: ${result.message}`);
      } catch (error) {
        toast.error(
          `Import backtest as paper bot: ${
            error instanceof Error ? error.message : 'Failed to import'
          }`
        );
      }
    },
    [importAsPaperMutation]
  );

  // Confirm delete
  const confirmDelete = useCallback(async () => {
    try {
      logger.info('[ComboBotEdit] Deleting backtests', {
        ids: backtestsToDelete,
        prefix: 'BACKTEST_DELETE',
      });
      await deleteBacktestsMutation.mutateAsync({
        ids: backtestsToDelete,
        backtestType: 'combo',
      });
      toast.success(
        `Deleted ${backtestsToDelete.length} backtest${backtestsToDelete.length > 1 ? 's' : ''} successfully`
      );
      setShowDeleteDialog(false);
      setBacktestsToDelete([]);

      // Clear selected backtest if it was deleted
      if (
        selectedBacktest &&
        backtestsToDelete.includes(selectedBacktest._id)
      ) {
        setSelectedBacktest(null);
      }
    } catch (error) {
      logger.error('[ComboBotEdit] Delete failed', {
        error,
        prefix: 'BACKTEST_DELETE',
      });
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete backtests'
      );
    }
  }, [backtestsToDelete, deleteBacktestsMutation, selectedBacktest]);

  // Inline note editing for the backtest table
  const setBacktestNoteMutation = useSetBacktestNote();
  const [backtestNoteOverrides, setBacktestNoteOverrides] = useState<
    Record<string, string>
  >({});

  const handleSaveBacktestNote = useCallback(
    (backtestId: string, next: string, prev: string) => {
      setBacktestNoteOverrides((o) => ({ ...o, [backtestId]: next }));
      setBacktestNoteMutation.mutate(
        { id: backtestId, note: next, type: BotTypesEnum.combo },
        {
          onError: () => {
            setBacktestNoteOverrides((o) => ({ ...o, [backtestId]: prev }));
          },
        }
      );
    },
    [setBacktestNoteMutation]
  );

  // Define columns for the backtest data table
  const backtestColumns = useMemo<ColumnDef<DCABacktestingResultHistory>[]>(
    () => [
      {
        accessorKey: 'symbol',
        header: 'Pair',
        cell: ({ row }) => {
          const baseAsset = row.original.baseAsset;
          const quoteAsset = row.original.quoteAsset;

          if (!baseAsset || !quoteAsset) {
            return <span className="text-muted-foreground">N/A</span>;
          }

          return (
            <CoinPair
              baseAsset={baseAsset}
              quoteAsset={quoteAsset}
              iconSize="sm"
              showText={true}
            />
          );
        },
      },
      {
        accessorKey: 'serverSide',
        header: 'Server Side',
        cell: ({ row }) => (
          <div className="text-sm">
            {row.original.serverSide === null
              ? 'no'
              : row.original.serverSide
                ? 'yes'
                : 'no'}
          </div>
        ),
      },
      {
        accessorKey: 'savePermanent',
        header: 'Save Permanently',
        cell: ({ row }) => (
          <BacktestPermanentCheckbox
            id={row.original._id ?? ''}
            type={BotTypesEnum.combo}
            checked={!!row.original.savePermanent}
          />
        ),
      },
      {
        accessorKey: 'settings.name',
        header: 'Name',
        cell: ({ row }) => {
          const hasLocalData = (row.original.deals?.length ?? 0) > 0;
          return (
            <div className="font-medium inline-flex items-center gap-1">
              <span>{row.original.settings?.name || ''}</span>
              {hasLocalData ? (
                <span title="Local backtest details available">
                  <Database
                    className="h-3.5 w-3.5 text-primary"
                    aria-label="Local backtest details available"
                  />
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        accessorKey: 'settings.startCondition',
        header: 'Start Condition',
        cell: ({ row }) => (
          <div className="text-sm">
            {row.original.settings?.startCondition || 'N/A'}
          </div>
        ),
      },
      {
        accessorKey: 'settings.strategy',
        header: 'Strategy',
        cell: ({ row }) => {
          const strategy = row.original.settings?.strategy || 'LONG';
          return <StrategyChip strategy={strategy} size="sm" />;
        },
      },
      {
        accessorKey: 'time',
        header: 'Created Time',
        cell: ({ row }) => {
          const date = row.original.time
            ? new Date(row.original.time).toLocaleString()
            : 'N/A';
          return <div className="text-sm text-muted-foreground">{date}</div>;
        },
      },
      {
        accessorKey: 'financial.avgNetDailyPerc',
        header: 'Avg. Net Daily',
        cell: ({ row }) => {
          const value = row.original.financial?.avgNetDailyPerc || 0;
          return <ProfitLossPercChip value={value} size="sm" />;
        },
      },
      {
        accessorKey: 'financial.annualizedReturn',
        header: 'Annualized Return',
        cell: ({ row }) => {
          const value = row.original.financial?.annualizedReturn;
          if (value === null || value === undefined)
            return <span className="text-muted-foreground">-</span>;
          return <ProfitLossPercChip value={value} size="sm" />;
        },
      },
      {
        accessorKey: 'financial.maxDrawDownPerc',
        header: '% Max. Draw Down',
        cell: ({ row }) => {
          const value = row.original.financial?.maxDrawDownPerc || 0;
          // Drawdown is always shown as negative
          return <ProfitLossPercChip value={-Math.abs(value)} size="sm" />;
        },
      },
      {
        accessorKey: 'financial.maxDrawDownEquityPerc',
        header: '% Max. Equity Draw Down',
        cell: ({ row }) => {
          const value = row.original.financial?.maxDrawDownEquityPerc;
          if (value === null || value === undefined)
            return <span className="text-muted-foreground">-</span>;
          // Drawdown is always shown as negative
          return <ProfitLossPercChip value={-Math.abs(value)} size="sm" />;
        },
      },
      {
        accessorKey: 'financial.netProfitTotalPerc',
        header: '% Net Profit',
        cell: ({ row }) => {
          const value = row.original.financial?.netProfitTotalPerc || 0;
          return <ProfitLossPercChip value={value} size="sm" showSign={true} />;
        },
      },
      {
        accessorKey: 'financial.unrealizedPnL',
        header: 'Unrealized Profit',
        cell: ({ row }) => {
          const value = row.original.financial?.unrealizedPnL || 0;
          const isPositive = value >= 0;
          return (
            <span
              className={`text-sm font-medium ${isPositive ? 'text-profit' : 'text-loss'}`}
            >
              {isPositive ? '+' : ''}
              {value.toFixed(8)}
            </span>
          );
        },
      },
      {
        accessorKey: 'duration.botWorkingTimeNumber',
        header: 'Bot Working Time',
        cell: ({ row }) => {
          const workingTime = row.original.duration?.botWorkingTime;
          if (!workingTime) return <div className="text-sm">N/A</div>;
          const d = workingTime.d || 0;
          const h = workingTime.h || 0;
          const min = workingTime.min || 0;
          return (
            <div className="text-sm text-muted-foreground">
              {d}d {h}h {min}m
            </div>
          );
        },
      },
      {
        accessorKey: 'duration.firstDataTime',
        header: 'Start Date',
        cell: ({ row }) => {
          const date = row.original.duration?.firstDataTime
            ? new Date(row.original.duration.firstDataTime).toLocaleString()
            : 'N/A';
          return <div className="text-sm text-muted-foreground">{date}</div>;
        },
      },
      {
        accessorKey: 'duration.lastDataTime',
        header: 'End Date',
        cell: ({ row }) => {
          const date = row.original.duration?.lastDataTime
            ? new Date(row.original.duration.lastDataTime).toLocaleString()
            : 'N/A';
          return <div className="text-sm text-muted-foreground">{date}</div>;
        },
      },
      {
        accessorKey: 'duration.periodName',
        header: 'Testing Period Name',
        cell: ({ row }) => (
          <div className="text-sm">
            {row.original.duration?.periodName || 'N/A'}
          </div>
        ),
      },
      {
        accessorKey: 'duration.maxDealDuration',
        header: 'Max Deal Duration',
        cell: ({ row }) => {
          const maxDuration = row.original.duration?.maxDealDuration;
          if (!maxDuration) return <div className="text-sm">N/A</div>;
          const d = maxDuration.d || 0;
          const h = maxDuration.h || 0;
          const min = maxDuration.min || 0;
          return (
            <div className="text-sm text-muted-foreground">
              {d}d {h}h {min}m
            </div>
          );
        },
      },
      {
        accessorKey: 'interval',
        header: 'Interval',
        cell: ({ row }) => (
          <div className="text-sm">{row.original.interval || 'N/A'}</div>
        ),
      },
      {
        accessorKey: 'numerical.actualPriceDeviation',
        header: 'Actual Price Deviation',
        cell: ({ row }) => {
          const value = row.original.numerical?.actualPriceDeviation;
          return (
            <div className="text-sm">{value !== undefined ? value : 'N/A'}</div>
          );
        },
      },
      {
        accessorKey: 'numerical.all',
        header: 'Deals',
        cell: ({ row }) => (
          <div className="text-sm font-medium">
            {row.original.numerical?.all || 0}
          </div>
        ),
      },
      {
        accessorKey: 'numerical.avgDCATriggered',
        header: 'Avg DCA Orders Triggered',
        cell: ({ row }) => (
          <div className="text-sm">
            {row.original.numerical?.avgDCATriggered || 0}
          </div>
        ),
      },
      {
        accessorKey: 'numerical.dealsPerDay',
        header: 'Deals Per Day',
        cell: ({ row }) => (
          <div className="text-sm">
            {row.original.numerical?.dealsPerDay?.toFixed(1) || '0.0'}
          </div>
        ),
      },
      {
        accessorKey: 'usage.avgRealUsage',
        header: 'Avg Real Usage',
        cell: ({ row }) => (
          <div className="text-sm">
            {row.original.usage?.avgRealUsage?.toFixed(3) || '0.000'}
          </div>
        ),
      },
      {
        accessorKey: 'ratios.buyAndHold.perc',
        header: 'Buy and Hold Return',
        cell: ({ row }) => {
          const value = row.original.ratios?.buyAndHold?.perc;
          if (value === null || value === undefined)
            return <div className="text-sm">-</div>;
          const isPositive = value >= 0;
          return (
            <div
              className={`text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}
            >
              {isPositive ? '+' : ''}
              {value.toFixed(2)}%
            </div>
          );
        },
      },
      {
        accessorKey: 'ratios.profitFactor',
        header: 'Profit Factor',
        cell: ({ row }) => {
          const value = row.original.ratios?.profitFactor;
          if (value === null || value === undefined)
            return <div className="text-sm">∞</div>;
          return <div className="text-sm">{value.toFixed(2)}</div>;
        },
      },
      {
        accessorKey: 'ratios.sharpe',
        header: 'Sharpe Ratio',
        cell: ({ row }) => {
          const value = row.original.ratios?.sharpe;
          if (value === null || value === undefined)
            return <div className="text-sm">-</div>;
          return <div className="text-sm">{value.toFixed(3)}</div>;
        },
      },
      {
        accessorKey: 'ratios.sortino',
        header: 'Sortino Ratio',
        cell: ({ row }) => {
          const value = row.original.ratios?.sortino;
          if (value === null || value === undefined)
            return <div className="text-sm">-</div>;
          return <div className="text-sm">{value.toFixed(3)}</div>;
        },
      },
      {
        accessorKey: 'ratios.cwr',
        header: 'CWR',
        cell: ({ row }) => {
          const value = row.original.ratios?.cwr;
          if (value === null || value === undefined)
            return <div className="text-sm">-</div>;
          return <div className="text-sm">{value.toFixed(4)}</div>;
        },
      },
      {
        accessorKey: 'note',
        header: 'Notes',
        size: 200,
        cell: ({ row }) => {
          const backtestId = row.original._id ?? '';
          const currentNote =
            backtestNoteOverrides[backtestId] ?? row.original.note ?? '';
          return (
            <InlineNoteCell
              id={backtestId}
              note={currentNote}
              onSave={handleSaveBacktestNote}
            />
          );
        },
      },
      {
        id: 'actions',
        header: 'Actions',
        meta: {
          pinned: 'right',
        },
        cell: ({ row }) => {
          const backtest = row.original;
          return (
            <div className="flex items-center justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => handleShareBacktest(backtest)}
                  >
                    <Share2 className="mr-2 h-4 w-4" />
                    Share
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleLoadBacktest(backtest)}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Load in settings
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => void handleLoadBacktestDetails(backtest)}
                  >
                    <FileUp className="mr-2 h-4 w-4" />
                    Load details
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleDeleteBacktests([backtest._id])}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                  {user?.importAsPaper && (
                    <DropdownMenuItem
                      onClick={() => void handleImportAsPaper(backtest)}
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      Import as paper bot
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [
      backtestNoteOverrides,
      handleDeleteBacktests,
      handleImportAsPaper,
      handleLoadBacktest,
      handleLoadBacktestDetails,
      handleSaveBacktestNote,
      handleShareBacktest,
      user?.importAsPaper,
    ]
  );

  // Badge for history tab
  const historyTableBadge = useMemo<ReactNode>(() => {
    if (comboBacktestsLoading) {
      return <Badge variant="secondary">Loading...</Badge>;
    }
    if (comboBacktestsError) {
      return <Badge variant="destructive">Error</Badge>;
    }
    const count = comboBacktests.length;
    return count > 0 ? (
      <Badge variant="default">{count}</Badge>
    ) : (
      <Badge variant="outline">0</Badge>
    );
  }, [comboBacktests.length, comboBacktestsLoading, comboBacktestsError]);

  // Handle row click to select a backtest
  const handleBacktestSelect = useCallback(
    (backtest: DCABacktestingResultHistory) => {
      setSelectedBacktest(backtest);
      // Open the full-screen results modal (deals hydrate below; the modal's
      // view model rebuilds reactively once they arrive).
      setResultsModalOpen(true);

      if ((backtest.deals?.length ?? 0) === 0) {
        void loadBacktestDetailsMutation
          .mutateAsync({ id: backtest._id })
          .catch((error) => {
            logger.debug('[ComboBotEdit] Could not hydrate backtest deals', {
              id: backtest._id,
              error: error instanceof Error ? error.message : String(error),
            });
          });
      }
    },
    [loadBacktestDetailsMutation]
  );

  useEffect(() => {
    if (!selectedBacktest) return;
    if ((selectedBacktest.deals?.length ?? 0) > 0) return;

    const hydratedBacktest = comboBacktests.find(
      (backtest) =>
        backtest._id === selectedBacktest._id &&
        (backtest.deals?.length ?? 0) > 0
    );

    if (hydratedBacktest) {
      setSelectedBacktest(hydratedBacktest);
    }
  }, [comboBacktests, selectedBacktest]);

  const chartPanel = useMemo<PanelContentConfig>(
    () => ({
      content: (
        <BotChartPanel
          widgetId="combo-edit-bot-chart"
          data={{
            botId: safeBotId,
            ...(chartData.symbol ? { symbol: chartData.symbol } : {}),
            exchange: chartData.exchange || 'binance',
            ...(chartData.botId ? { botId: chartData.botId } : {}),
          }}
          variant="panel"
          className="h-full"
          {...(chartData.symbol ? { symbol: chartData.symbol } : {})}
        />
      ),
      contentClassName: 'flex h-full flex-col',
      containerClassName: 'min-h-[320px]',
    }),
    [safeBotId, chartData]
  );

  const formPanel = useMemo<PanelContentConfig>(
    () => ({
      content: (
        <BotFormPanel
          widgetId="combo-edit-bot"
          mode="edit"
          botId={safeBotId}
          botType={BotTypesEnum.combo}
          terminal={false}
          // On mobile, BotPanelLayout provides the top-level tabs (Settings/Chart/Backtests),
          // but the form should still show its internal section navigation
          disableMobileAutoDetect
          onFormDataChange={handleFormDataChange}
          onBacktestComplete={handleBacktestComplete}
        />
      ),
      contentClassName: 'flex h-full flex-col',
      containerClassName: 'min-h-[360px]',
    }),
    [safeBotId, handleFormDataChange, handleBacktestComplete]
  );

  const insightsTabs = useMemo<BotPanelInsightsTab[]>(() => {
    // Define bulk actions for the backtest table
    const bulkActions: BulkAction<DCABacktestingResultHistory>[] = [
      {
        id: 'export-json',
        label: 'Export as JSON',
        icon: Download,
        onAction: (selectedRows) => {
          const ids = selectedRows.map((row) => row._id);
          void handleExportBacktests(ids, 'json');
        },
      },
      {
        id: 'export-csv',
        label: 'Export as CSV',
        icon: Download,
        onAction: (selectedRows) => {
          const ids = selectedRows.map((row) => row._id);
          void handleExportBacktests(ids, 'csv');
        },
      },
      {
        id: 'delete',
        label: 'Delete',
        icon: Trash2,
        destructive: true,
        onAction: (selectedRows) => {
          const ids = selectedRows.map((row) => row._id);
          handleDeleteBacktests(ids);
        },
      },
    ];

    const tabs: BotPanelInsightsTab[] = [
      {
        key: 'history',
        title: 'History',
        badge: historyTableBadge,
        bodyClassName: 'p-0',
        content: comboBacktestsLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="h-32 w-full animate-pulse rounded bg-muted" />
          </div>
        ) : comboBacktestsError ? (
          <div className="flex items-center justify-center h-full text-destructive">
            Error loading backtests
          </div>
        ) : (
          <DataTable
            tableId="combo-backtests-table"
            columns={backtestColumns}
            data={comboBacktests}
            enableGlobalFilter={true}
            enableSorting={true}
            enableColumnVisibility={true}
            getRowId={(row) => row._id}
            showPagination={true}
            initialPageSize={10}
            emptyMessage="No backtests available"
            className="h-full"
            onRowClick={handleBacktestSelect}
            bulkActions={bulkActions}
            defaultPinnedColumns={{ left: [], right: ['actions'] }}
          />
        ),
        // Results (Overview/Deals/Analysis/Stats) now open in the
        // full-screen modal on row click — no inline subtabs in the widget.
      },
    ];

    return tabs;
  }, [
    historyTableBadge,
    comboBacktests,
    comboBacktestsLoading,
    comboBacktestsError,
    backtestColumns,
    handleBacktestSelect,
    handleExportBacktests,
    handleDeleteBacktests,
  ]);

  const loadingChartPanel = useMemo<PanelContentConfig>(
    () => ({
      title: 'Bot performance chart',
      description: 'Fetching bot metrics…',
      content: (
        <div className="flex h-full flex-col gap-md">
          <div className="h-5 w-52 animate-pulse rounded bg-muted" />
          <div className="h-[220px] w-full animate-pulse rounded-xl bg-muted" />
          <div className="flex gap-xs">
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ),
      containerClassName: 'min-h-[320px]',
    }),
    []
  );

  const loadingFormPanel = useMemo<PanelContentConfig>(
    () => ({
      title: 'Bot configuration',
      description: 'Loading current settings…',
      content: (
        <div className="flex h-full flex-col gap-md">
          <div className="space-y-sm">
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="h-11 w-full animate-pulse rounded bg-muted" />
          </div>
          <div className="h-11 w-full animate-pulse rounded bg-muted" />
          <div className="h-11 w-full animate-pulse rounded bg-muted" />
          <div className="h-24 w-full animate-pulse rounded bg-muted" />
          <div className="mt-auto flex gap-xs">
            <div className="h-10 w-24 animate-pulse rounded bg-muted" />
            <div className="h-10 w-24 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ),
      containerClassName: 'min-h-[360px]',
    }),
    []
  );

  const loadingInsightsTabs = useMemo<BotPanelInsightsTab[]>(
    () => [
      {
        key: 'history',
        title: 'History',
        badge: <Badge variant="secondary">...</Badge>,
        content: (
          <div className="flex h-full flex-col gap-sm">
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="h-28 w-full animate-pulse rounded bg-muted" />
            <div className="h-28 w-full animate-pulse rounded bg-muted" />
          </div>
        ),
      },
      {
        key: 'stats',
        title: 'Stats',
        enabled: false,
        content: null,
      },
    ],
    []
  );

  if (!hasBotId) {
    return (
      <MainLayout pageTitle="Combo Bot - Edit" activePage="/combo" navigationBack>
        <div className="p-lg">
          <div className="mx-auto max-w-3xl rounded-xl border border-amber-200 bg-amber-50 px-md py-md text-amber-900">
            No bot ID provided.
          </div>
        </div>
      </MainLayout>
    );
  }

  if (modeGuard.notFound) {
    return (
      <MainLayout pageTitle="Combo Bot - Edit" activePage="/combo" navigationBack>
        <BotNotFoundNotice
          backTo="/combo"
          backLabel="combo bots"
          botId={safeBotId}
        />
      </MainLayout>
    );
  }

  return (
    <MainLayout
      pageTitle="Combo Bot - Edit"
      activePage="/combo"
      fullyScrollable
      navigationBack
    >
      <div className="flex flex-col gap-md">
        {isLoading ? (
          <BotPanelLayout
            chart={loadingChartPanel}
            form={loadingFormPanel}
            insights={
              <BotPanelInsights
                tabs={loadingInsightsTabs}
                value={activeInsightsTab}
                onTabChange={setActiveInsightsTab}
              />
            }
            className="flex-1"
            key={`combo-${safeBotId || 'edit'}`}
            botType="combo"
            mobileFullscreen
            scrollable
          />
        ) : (
          <BotPanelLayout
            chart={chartPanel}
            form={formPanel}
            insights={
              <BotPanelInsights
                tabs={insightsTabs}
                value={activeInsightsTab}
                onTabChange={setActiveInsightsTab}
                actions={
                  backtestsSummary.subtitle ? (
                    <span>{backtestsSummary.subtitle}</span>
                  ) : undefined
                }
              />
            }
            className="flex-1"
            key={`combo-${safeBotId || 'edit'}`}
            botType="combo"
            mobileFullscreen
            scrollable
          />
        )}
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmationDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={confirmDelete}
        title="Delete Backtests"
        description={`Are you sure you want to delete ${backtestsToDelete.length} backtest${backtestsToDelete.length > 1 ? 's' : ''}? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
      />

      {/* Full-screen backtest results modal (opened from a table row click) */}
      {selectedBacktest && (
        <BacktestResultsFullModal
          open={resultsModalOpen}
          onOpenChange={setResultsModalOpen}
          result={selectedBacktest}
          strategy="Combo"
          settings={(selectedBacktest.settings ?? {}) as DCABotSettings}
          meta={{
            symbol: selectedBacktest.symbol,
            exchange: selectedBacktest.exchange,
            baseAsset: selectedBacktest.baseAsset,
            quoteAsset: selectedBacktest.quoteAsset,
          }}
          botName={selectedBacktest.settings?.name}
        />
      )}
    </MainLayout>
  );
};

const ComboBotEdit = () => {
  return (
    <TradingTerminalUtilsProvider>
      <ComboBotEditWidget />
    </TradingTerminalUtilsProvider>
  );
};

export default ComboBotEdit;
