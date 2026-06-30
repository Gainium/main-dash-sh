import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  BotPanelInsights,
  type BotPanelInsightsTab,
} from '@/components/bots/panels';
import {
  BotPanelLayout,
  type BotPanelInsightsConfig,
} from '@/components/bots/panels/BotPanelLayout';
import BotChartPanel from '@/components/bots/panels/contents/chart/BotChartPanel';
import BotFormPanel from '@/components/bots/panels/contents/form/BotFormPanel';
import { usePanelMenuBridge } from '@/components/bots/panels/hooks/usePanelMenuBridge';
import { type PanelContentConfig } from '@/components/bots/panels/PanelContainer';
import MainLayout from '@/components/layout/MainLayout';
import WidgetContainer from '@/components/layout/WidgetContainer';
import { ExtensionSlot, Slot } from '@/lib/extensions';
import { Badge } from '@/components/ui/badge';
import { ProfitLossPercChip } from '@/components/ui/chip';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import {
  DataTable,
  type BulkAction,
} from '@/components/ui/data-table/data-table';
import InlineNoteCell from '@/components/ui/InlineNoteCell';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  BacktestPermanentCheckbox,
  GridBacktestEquityCurveTab,
  GridBacktestOverviewTab,
  GridBacktestStatsTab,
  GridBacktestTransactionsTab,
  ShareBacktestButton,
} from '@/components/widgets/bots/backtest';
import { BacktestResultsFullModal } from '@/components/widgets/bots/backtest/redesign';
import { useShareContext } from '@/hooks/useShareContext';
import { useAuthStore } from '@/stores/authStore';
import { GraphQLClient } from '@/lib/api';
import { botQueries } from '@/lib/api/GraphQLQueries-bot-queries';
import { TVChartPicker } from '@/components/widgets/shared/TradingViewChart';
import type { TradingViewChartRef } from '@/components/widgets/shared/TradingViewChart/TradingViewChart';
import {
  TradingTerminalUtilsProvider,
  useTradingTerminalUtils,
} from '@/context/TradingTerminalUtilsContext';
import { useBotPageLoading } from '@/hooks/bots/base/useBotPageLoading';
import { useBotPageRedirect } from '@/hooks/bots/base/useBotPageRedirect';
import { useBotConfigPreload } from '@/hooks/useBotConfigPreload';
import { useGraphQL } from '@/hooks/useGraphQL';
import { mapGridBotSettingsToFormData } from '@/mappers/bots/grid/map-grid-bot-settings-to-form-data';
import type { BotFormData } from '@/types/bots/form';
import {
  useDeleteBacktests,
  useExportBacktests,
} from '@/hooks/useBacktestDataManagement';
import { useGridBacktests } from '@/hooks/useGridBacktests';
import { useSetBacktestNote } from '@/hooks/useSetBacktestNote';
import { logger } from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import CoinPair from '@/components/widgets/shared/CoinPair';
import { math } from '@/lib/utils/math';
import {
  BotTypesEnum,
  type Bot,
  type GRIDBacktestingResultHistory,
} from '@/types';
import { exampleOrdersStore } from '@/utils/bots/dca/example-orders';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, MoreVertical, Trash2 } from 'lucide-react';

const INITIAL_LOADING_DELAY_MS = 1200;

const GridBotNewWidget = () => {
  useBotPageRedirect('/grid');
  const isLoading = useBotPageLoading(INITIAL_LOADING_DELAY_MS);

  const [selectedBacktest, setSelectedBacktest] =
    useState<GRIDBacktestingResultHistory | null>(null);
  const [activeInsightsTab, setActiveInsightsTab] = useState('backtests');
  // Clicking a backtest row opens the redesigned full-screen results modal
  // instead of rendering Overview/Transactions/Equity/Stats inline.
  const [resultsModalOpen, setResultsModalOpen] = useState(false);
  const [pendingBacktestId, setPendingBacktestId] = useState<string | null>(
    null
  );

  useEffect(() => {
    return () => {
      exampleOrdersStore.reset();
    };
  }, []);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [backtestsToDelete, setBacktestsToDelete] = useState<string[]>([]);

  // Hooks for delete and export
  const deleteBacktestsMutation = useDeleteBacktests();
  const exportBacktestsMutation = useExportBacktests();
  const user = useAuthStore((state) => state.user);

  const {
    backtests: gridBacktests,
    isLoading: gridBacktestsLoading,
    error: gridBacktestsError,
  } = useGridBacktests();

  // Auto-select a newly completed backtest when it appears in the list
  useEffect(() => {
    if (!pendingBacktestId) return;
    const found = gridBacktests.find((b) => b._id === pendingBacktestId);
    if (found) {
      setSelectedBacktest(found);
      setResultsModalOpen(true);
      setPendingBacktestId(null);
      logger.info('[GridBotNew] Auto-selected completed backtest', {
        id: pendingBacktestId,
      });
    }
  }, [gridBacktests, pendingBacktestId]);

  // Public share viewer hydration via `?backtestShare=<id>`.
  const { backtestShareId } = useShareContext();
  const [shareLookupAttempted, setShareLookupAttempted] = useState(false);
  useEffect(() => {
    if (!backtestShareId || shareLookupAttempted) return;
    setShareLookupAttempted(true);

    const local = gridBacktests.find((b) => b.shareId === backtestShareId);
    if (local) {
      setSelectedBacktest(local);
      setActiveInsightsTab('backtests');
      return;
    }

    const endpoint =
      import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
    const token = useAuthStore.getState().tokens?.accessToken;
    const client = new GraphQLClient(
      endpoint,
      token ?? 'demo',
      undefined,
      backtestShareId
    );
    const { query, variables } = botQueries.getGridBacktestByShareId({
      shareId: backtestShareId,
    });

    client
      .request<{
        getGridBacktestByShareId: {
          status: string;
          reason?: string;
          data?: GRIDBacktestingResultHistory;
        };
      }>(query, variables)
      .then((response) => {
        const payload = response.getGridBacktestByShareId;
        if (payload?.status === 'OK' && payload.data) {
          setSelectedBacktest(payload.data);
          setActiveInsightsTab('backtests');
        } else {
          toast.error(
            payload?.reason || 'Could not load shared backtest by link'
          );
        }
      })
      .catch((err) => {
        logger.error('[GridBotNew] getGridBacktestByShareId failed', {
          error: err instanceof Error ? err.message : String(err),
          shareId: backtestShareId,
        });
        toast.error(
          err instanceof Error ? err.message : 'Failed to load shared backtest'
        );
      });
  }, [backtestShareId, gridBacktests, shareLookupAttempted]);

  // Preloaded form seed from sessionStorage.botConfig (set by the
  // curated-presets widget, wizard slot, More-strategies overlay) plus
  // URL hints. Returns null when nothing is staged.
  const preload = useBotConfigPreload();

  // Clone-from-template via `/grid/new?load=<id>`: fetch the source bot,
  // map its settings to BotFormData, append "(Clone)" to the name, and
  // seed BotFormPanel. Mirrors the hedge flow in HedgeBotFormProvider.
  const [searchParams] = useSearchParams();
  const loadFromBotId = searchParams.get('load');
  const loadQueryInput = useMemo(
    () => botQueries.getBot({ id: loadFromBotId ?? '' }),
    [loadFromBotId]
  );
  const loadQuery = useGraphQL<Bot>('getBot', loadQueryInput, {
    enabled: Boolean(loadFromBotId),
  });

  const [loadErrorHandled, setLoadErrorHandled] = useState(false);
  useEffect(() => {
    if (!loadFromBotId || loadErrorHandled) return;
    if (loadQuery.isLoading) return;
    const status = loadQuery.data?.status;
    if (loadQuery.error || (status && status !== 'OK')) {
      toast.error('Failed to load bot to clone — starting from scratch');
      setLoadErrorHandled(true);
    }
  }, [
    loadFromBotId,
    loadQuery.isLoading,
    loadQuery.data,
    loadQuery.error,
    loadErrorHandled,
  ]);

  const clonedInitialFormData = useMemo<Partial<BotFormData> | undefined>(() => {
    if (!loadFromBotId) return undefined;
    const sourceBot =
      loadQuery.data?.status === 'OK' ? loadQuery.data.data : null;
    if (!sourceBot) return undefined;
    try {
      const { formData } = mapGridBotSettingsToFormData(sourceBot.settings, {
        bot: {
          exchange: sourceBot.exchange,
          exchangeUUID: sourceBot.exchangeUUID,
          settings: sourceBot.settings as unknown as Record<string, unknown>,
        },
      });
      const base = formData.name?.trim();
      return { ...formData, name: base ? `${base} (Clone)` : '(Clone)' };
    } catch (err) {
      logger.error('[GridBotNew] Failed to map source bot for clone', { err });
      return undefined;
    }
  }, [loadFromBotId, loadQuery.data]);

  // While the source bot is loading, hold the form mount so the seed lands
  // on first render (Grid doesn't have the formReloadKey pattern that DCA
  // uses). Once the fetch resolves (success or error) we mount normally.
  const isLoadingClone =
    Boolean(loadFromBotId) && loadQuery.isLoading && !loadErrorHandled;

  // Callback fired by BotForm when a local backtest finishes and is persisted
  const handleBacktestComplete = useCallback((backtestId: string) => {
    logger.info('[GridBotNew] Backtest completed, pending selection', {
      backtestId,
    });
    setPendingBacktestId(backtestId);
    setActiveInsightsTab('backtests');
  }, []);

  // Badge for backtests tab
  const backtestsBadge = useMemo<ReactNode>(() => {
    if (gridBacktestsLoading) {
      return <Badge variant="secondary">Loading...</Badge>;
    }
    if (gridBacktestsError) {
      return <Badge variant="destructive">Error</Badge>;
    }
    const count = gridBacktests.length;
    return count > 0 ? (
      <Badge variant="default">{count}</Badge>
    ) : (
      <Badge variant="outline">0</Badge>
    );
  }, [gridBacktests.length, gridBacktestsLoading, gridBacktestsError]);

  // Handle export
  const handleExportBacktests = useCallback(
    async (backtestIds: string[], format: 'json' | 'csv' = 'json') => {
      try {
        logger.info('[GridBotNew] Exporting backtests', {
          backtestIds,
          format,
          prefix: 'GRID_BACKTEST_EXPORT',
        });
        await exportBacktestsMutation.mutateAsync({ ids: backtestIds, format });
        toast.success(
          `Exported ${backtestIds.length} backtest${backtestIds.length > 1 ? 's' : ''} successfully`
        );
      } catch (error) {
        logger.error('[GridBotNew] Export failed', {
          error,
          prefix: 'GRID_BACKTEST_EXPORT',
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

  // Confirm delete
  const confirmDelete = useCallback(async () => {
    try {
      logger.info('[GridBotNew] Deleting backtests', {
        ids: backtestsToDelete,
        prefix: 'GRID_BACKTEST_DELETE',
      });
      await deleteBacktestsMutation.mutateAsync({
        ids: backtestsToDelete,
        backtestType: 'grid',
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
      logger.error('[GridBotNew] Delete failed', {
        error,
        prefix: 'GRID_BACKTEST_DELETE',
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
        { id: backtestId, note: next, type: BotTypesEnum.grid },
        {
          onError: () => {
            setBacktestNoteOverrides((o) => ({ ...o, [backtestId]: prev }));
          },
        }
      );
    },
    [setBacktestNoteMutation]
  );

  const backtestColumns = useMemo<ColumnDef<GRIDBacktestingResultHistory>[]>(
    () => [
      {
        accessorKey: 'symbol',
        header: 'Pair',
        cell: ({ row }) => {
          const { baseAsset, quoteAsset } = row.original;
          if (!baseAsset || !quoteAsset)
            return (
              <div className="text-sm">{row.original.symbol || 'N/A'}</div>
            );
          return (
            <CoinPair
              baseAsset={baseAsset}
              quoteAsset={quoteAsset}
              iconSize="sm"
              showText
            />
          );
        },
      },
      {
        accessorKey: 'serverSide',
        header: 'Server Side',
        cell: ({ row }) => (
          <div className="text-sm">
            {row.original.serverSide ? 'yes' : 'no'}
          </div>
        ),
      },
      {
        accessorKey: 'savePermanent',
        header: 'Save Permanently',
        cell: ({ row }) => (
          <BacktestPermanentCheckbox
            id={row.original._id ?? ''}
            type={BotTypesEnum.grid}
            checked={!!row.original.savePermanent}
          />
        ),
      },
      {
        accessorKey: 'settings.name',
        header: 'Name',
        cell: ({ row }) => (
          <div className="font-medium">{row.original.settings?.name || ''}</div>
        ),
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
        accessorKey: 'financial.profitTotalUsd',
        header: '$ Net Profit',
        cell: ({ row }) => {
          const usd = row.original.financial?.profitTotalUsd ?? 0;
          const perc = row.original.financial?.profitTotalPerc ?? 0;
          const isPositive = usd >= 0;
          return (
            <div className="flex flex-col items-start gap-0.5">
              <span
                className={`text-sm font-medium ${isPositive ? 'text-profit' : 'text-loss'}`}
              >
                {isPositive ? '+' : ''}${math.round(usd)}
              </span>
              <ProfitLossPercChip value={perc} size="sm" showSign />
            </div>
          );
        },
      },
      {
        accessorKey: 'financial.profitTotal',
        header: 'P&L',
        cell: ({ row }) => {
          const val = row.original.financial?.profitTotal ?? 0;
          const isPositive = +val >= 0;
          return (
            <span
              className={`text-sm ${isPositive ? 'text-profit' : 'text-loss'}`}
            >
              {val} {row.original.quoteAsset}
            </span>
          );
        },
      },
      {
        accessorKey: 'financial.profitTotalPerc',
        header: '% Net Profit',
        cell: ({ row }) => {
          const value = row.original.financial?.profitTotalPerc || 0;
          return <ProfitLossPercChip value={value} size="sm" showSign />;
        },
      },
      {
        accessorKey: 'financial.budgetUsd',
        header: '$ Budget',
        cell: ({ row }) => (
          <div className="text-sm">
            ${math.round(row.original.financial?.budgetUsd ?? 0)}
          </div>
        ),
      },
      {
        accessorKey: 'financial.avgNetDailyPerc',
        header: 'Avg Net Daily',
        cell: ({ row }) => {
          const value = row.original.financial?.avgNetDailyPerc || 0;
          return <ProfitLossPercChip value={value} size="sm" />;
        },
      },
      {
        accessorKey: 'financial.avgNetDailyUsd',
        header: '$ Avg Net Daily',
        cell: ({ row }) => (
          <div className="text-sm">
            ${row.original.financial?.avgNetDailyUsd ?? 0}
          </div>
        ),
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
        accessorKey: 'financial.avgTransactionProfitUsd',
        header: '$ Avg Transaction Profit',
        cell: ({ row }) => (
          <div className="text-sm">
            ${row.original.financial?.avgTransactionProfitUsd ?? 0}
          </div>
        ),
      },
      {
        accessorKey: 'financial.avgTransactionProfit',
        header: 'Avg Transaction Profit',
        cell: ({ row }) => (
          <div className="text-sm">
            {row.original.financial?.avgTransactionProfit ?? 0}
          </div>
        ),
      },
      {
        accessorKey: 'financial.initialBalancesUsd',
        header: '$ Initial Balances',
        cell: ({ row }) => (
          <div className="text-sm">
            ${row.original.financial?.initialBalancesUsd ?? 0}
          </div>
        ),
      },
      {
        accessorKey: 'financial.initialBalances',
        header: 'Initial Balances',
        cell: ({ row }) => (
          <div className="text-sm">
            {row.original.financial?.initialBalances ?? 0}
          </div>
        ),
      },
      {
        accessorKey: 'financial.currentBalancesUsd',
        header: '$ Current Balances',
        cell: ({ row }) => (
          <div className="text-sm">
            ${row.original.financial?.currentBalancesUsd ?? 0}
          </div>
        ),
      },
      {
        accessorKey: 'financial.currentBalances',
        header: 'Current Balances',
        cell: ({ row }) => (
          <div className="text-sm">
            {row.original.financial?.currentBalances ?? 0}
          </div>
        ),
      },
      {
        accessorKey: 'financial.valueChange',
        header: 'Value Change',
        cell: ({ row }) => {
          const { valueChangeUsd, initialBalancesUsd } =
            row.original.financial ?? {};
          const perc = initialBalancesUsd
            ? math.round((+(valueChangeUsd ?? 0) / +initialBalancesUsd) * 100)
            : 0;
          return <ProfitLossPercChip value={perc} size="sm" />;
        },
      },
      {
        accessorKey: 'financial.valueChangeUsd',
        header: '$ Value Change',
        cell: ({ row }) => (
          <div className="text-sm">
            ${row.original.financial?.valueChangeUsd ?? 0}
          </div>
        ),
      },
      {
        accessorKey: 'financial.startPrice',
        header: 'Initial Price',
        cell: ({ row }) => (
          <div className="text-sm">
            {row.original.financial?.startPrice ?? 0}
          </div>
        ),
      },
      {
        accessorKey: 'financial.lastPrice',
        header: 'Last Price',
        cell: ({ row }) => (
          <div className="text-sm">
            {row.original.financial?.lastPrice ?? 0}
          </div>
        ),
      },
      {
        accessorKey: 'financial.breakevenPrice',
        header: 'Breakeven Price',
        cell: ({ row }) => (
          <div className="text-sm">
            {row.original.financial?.breakevenPrice ?? 0}
          </div>
        ),
      },
      {
        accessorKey: 'duration.botWorkingTime',
        header: 'Bot Working Time',
        cell: ({ row }) => {
          const wt = row.original.duration?.botWorkingTime;
          if (!wt) return <div className="text-sm">N/A</div>;
          return (
            <div className="text-sm text-muted-foreground">
              {wt.d || 0}d {wt.h || 0}h {wt.min || 0}m
            </div>
          );
        },
      },
      {
        accessorKey: 'duration.firstDataTime',
        header: 'Start Date',
        cell: ({ row }) => {
          const ts = row.original.duration?.firstDataTime;
          return (
            <div className="text-sm text-muted-foreground">
              {ts ? new Date(ts).toLocaleString() : 'N/A'}
            </div>
          );
        },
      },
      {
        accessorKey: 'duration.lastDataTime',
        header: 'End Date',
        cell: ({ row }) => {
          const ts = row.original.duration?.lastDataTime;
          return (
            <div className="text-sm text-muted-foreground">
              {ts ? new Date(ts).toLocaleString() : 'N/A'}
            </div>
          );
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
        accessorKey: 'interval',
        header: 'Interval',
        cell: ({ row }) => (
          <div className="text-sm">{row.original.interval || 'N/A'}</div>
        ),
      },
      {
        accessorKey: 'numerical.all',
        header: 'Transactions',
        cell: ({ row }) => (
          <div className="text-sm font-medium">
            {row.original.numerical?.all || 0}
          </div>
        ),
      },
      {
        accessorKey: 'numerical.transactionsPerDay',
        header: 'Transactions/Day',
        cell: ({ row }) => (
          <div className="text-sm">
            {row.original.numerical?.transactionsPerDay?.toFixed(1) || '0.0'}
          </div>
        ),
      },
      {
        accessorKey: 'numerical.buy',
        header: 'Buy Transactions',
        cell: ({ row }) => (
          <div className="text-sm">{row.original.numerical?.buy || 0}</div>
        ),
      },
      {
        accessorKey: 'numerical.sell',
        header: 'Sell Transactions',
        cell: ({ row }) => (
          <div className="text-sm">{row.original.numerical?.sell || 0}</div>
        ),
      },
      {
        accessorKey: 'ratios.buyAndHold.valueUsd',
        header: '$ Buy & Hold Return',
        cell: ({ row }) => {
          const value = row.original.ratios?.buyAndHold?.valueUsd;
          if (value === null || value === undefined)
            return <div className="text-sm">-</div>;
          return <div className="text-sm">${value}</div>;
        },
      },
      {
        accessorKey: 'ratios.buyAndHold.perc',
        header: '% Buy & Hold Return',
        cell: ({ row }) => {
          const value = row.original.ratios?.buyAndHold?.perc;
          if (value === null || value === undefined)
            return <div className="text-sm">-</div>;
          return <ProfitLossPercChip value={value} size="sm" />;
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
        id: 'actions',
        header: 'Actions',
        meta: { pinned: 'right' },
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
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteBacktests([backtest._id]);
                    }}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [handleDeleteBacktests, backtestNoteOverrides, handleSaveBacktestNote]
  );

  // Handle row click to select a backtest and open the full-screen modal
  const handleBacktestSelect = useCallback(
    (backtest: GRIDBacktestingResultHistory) => {
      setSelectedBacktest(backtest);
      setResultsModalOpen(true);
    },
    []
  );

  // Sync selected backtest with the latest data from the list
  /*  useEffect(() => {
    if (!selectedBacktest) return;
    const updated = gridBacktests.find((b) => b._id === selectedBacktest._id);
    if (updated && updated !== selectedBacktest) {
      setSelectedBacktest(updated);
    }
  }, [gridBacktests, selectedBacktest]); */

  const [chartMenu, handleChartMenuChange] = usePanelMenuBridge();
  const [chartData, setChartData] = useState<{
    symbol?: string;
    exchange?: string;
    botId?: string;
  }>({});

  const handleFormDataChange = useCallback(
    (nextData: { symbol?: string; exchange?: string; botId?: string }) => {
      setChartData(nextData);
    },
    []
  );

  const tvRef = useRef<TradingViewChartRef | null>(null);

  const { setCoordinates, activePickerField, onActiveChanged } =
    useTradingTerminalUtils();

  const chartPanel: PanelContentConfig = useMemo(() => {
    const base: PanelContentConfig = {
      content: (
        <>
          <BotChartPanel
            widgetId="grid-bot-chart"
            className="h-full"
            data={{
              ...(chartData.symbol ? { symbol: chartData.symbol } : {}),
              ...(chartData.exchange ? { exchange: chartData.exchange } : {}),
              ...(chartData.botId ? { botId: chartData.botId } : {}),
            }}
            onPanelMenuChange={handleChartMenuChange}
            ref={tvRef}
          />
          <TVChartPicker
            chartRef={tvRef}
            isActive={!!activePickerField}
            onPick={setCoordinates}
            onActiveChange={onActiveChanged}
          />
        </>
      ),
      contentClassName: 'flex h-full flex-col',
      containerClassName: 'min-h-[320px]',
    };

    if (chartMenu) {
      base.menu = chartMenu;
    }

    return base;
  }, [
    chartMenu,
    handleChartMenuChange,
    chartData,
    activePickerField,
    onActiveChanged,
    setCoordinates,
  ]);

  const formPanel: PanelContentConfig = useMemo(() => {
    const initialFormData = clonedInitialFormData ?? preload?.initialFormData;
    const base: PanelContentConfig = {
      content: (
        <BotFormPanel
          widgetId="grid-create-bot"
          mode="create"
          botType={BotTypesEnum.grid}
          onFormDataChange={handleFormDataChange}
          terminal={false}
          disableMobileAutoDetect
          initialFormData={initialFormData}
          onBacktestComplete={handleBacktestComplete}
        />
      ),
      contentClassName: 'flex h-full flex-col',
      containerClassName: 'min-h-[360px]',
    };

    return base;
  }, [
    handleFormDataChange,
    handleBacktestComplete,
    preload?.initialFormData,
    clonedInitialFormData,
  ]);

  const insightsConfig = useMemo(() => {
    // Bulk actions for the backtest table
    const bulkActions: BulkAction<GRIDBacktestingResultHistory>[] = [
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
        key: 'backtests',
        title: 'Backtests',
        badge: backtestsBadge,
        bodyClassName: 'p-0',
        content: gridBacktestsLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="h-32 w-full animate-pulse rounded bg-muted" />
          </div>
        ) : gridBacktestsError ? (
          <div className="flex items-center justify-center h-full text-destructive">
            Error loading backtests
          </div>
        ) : (
          <DataTable
            tableId="grid-backtests-table-new"
            columns={backtestColumns}
            data={gridBacktests}
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
            defaultColumnVisibility={{
              serverSide: false,
              savePermanent: false,
              note: false,
              'financial.profitTotal': false,
              'financial.profitTotalPerc': false,
              'financial.avgNetDailyUsd': false,
              'financial.avgTransactionProfit': false,
              'financial.initialBalances': false,
              'financial.currentBalances': false,
              'financial.valueChangeUsd': false,
              'financial.startPrice': false,
              'financial.lastPrice': false,
              'financial.breakevenPrice': false,
              'duration.firstDataTime': false,
              'duration.lastDataTime': false,
              'numerical.transactionsPerDay': false,
              'numerical.buy': false,
              'numerical.sell': false,
              'ratios.buyAndHold.perc': false,
            }}
          />
        ),
        // Results (Overview/Transactions/Equity/Stats) now open in the
        // full-screen modal on row click — no inline subtabs in the widget.
      },
    ];

    const canShareSelected =
      !!selectedBacktest &&
      !!user?.id &&
      (selectedBacktest as { userId?: string }).userId === user.id;

    return {
      defaultTab: 'backtests',
      resetKey: selectedBacktest?._id,
      actions: (
        <div className="flex items-center gap-xs">
          {gridBacktestsLoading ? <span>Loading grid backtests</span> : null}
          {selectedBacktest && (
            <ShareBacktestButton
              backtestId={selectedBacktest._id}
              existingShareId={
                (selectedBacktest as { shareId?: string | null }).shareId
              }
              backtestType="grid"
              sharePath="/grid/backtests"
              canShare={canShareSelected}
            />
          )}
        </div>
      ),
      tabs,
    };
  }, [
    backtestsBadge,
    backtestColumns,
    gridBacktests,
    gridBacktestsLoading,
    gridBacktestsError,
    handleBacktestSelect,
    handleExportBacktests,
    handleDeleteBacktests,
    selectedBacktest,
    user?.id,
  ]);

  const loadingInsightsConfig: BotPanelInsightsConfig = useMemo(
    () => ({
      defaultTab: 'backtests',
      tabs: [
        {
          key: 'backtests',
          title: 'Backtests',
          badge: <Badge variant="secondary">...</Badge>,
          content: (
            <div className="flex h-full flex-col gap-sm">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="h-28 w-full animate-pulse rounded bg-muted" />
              <div className="h-28 w-full animate-pulse rounded bg-muted" />
            </div>
          ),
        },
      ],
    }),
    []
  );

  const loadingChartPanel: PanelContentConfig = useMemo(
    () => ({
      title: 'Market chart',
      description: 'Preparing live data…',
      content: (
        <div className="flex h-full flex-col gap-md">
          <div className="h-5 w-48 animate-pulse rounded bg-muted" />
          <div className="h-[220px] w-full animate-pulse rounded-xl bg-muted" />
          <div className="flex gap-xs">
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ),
      containerClassName: 'min-h-[320px]',
    }),
    []
  );

  const loadingFormPanel: PanelContentConfig = useMemo(
    () => ({
      title: 'Configure your grid bot',
      description: 'Getting forms ready…',
      content: (
        <div className="flex h-full flex-col gap-md">
          <div className="space-y-sm">
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
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

  // Share-mode: render the shared backtest detail with the full set of
  // tabs (Overview / Transactions / Equity Curve / Stats) so visitors
  // get the same depth the owner sees, matching legacy main-dash.
  if (backtestShareId) {
    return (
      <MainLayout pageTitle="Shared backtest" activePage="/grid/backtests">
        <div className="flex flex-col gap-md p-md">
          {selectedBacktest ? (
            <Tabs defaultValue="bt-overview" className="w-full">
              <TabsList>
                <TabsTrigger value="bt-overview">Overview</TabsTrigger>
                <TabsTrigger value="bt-transactions">Transactions</TabsTrigger>
                <TabsTrigger value="bt-equity">Equity Curve</TabsTrigger>
                <TabsTrigger value="bt-stats">Stats</TabsTrigger>
              </TabsList>
              <TabsContent value="bt-overview" className="mt-md">
                <GridBacktestOverviewTab backtest={selectedBacktest} />
              </TabsContent>
              <TabsContent value="bt-transactions" className="mt-md">
                <GridBacktestTransactionsTab backtest={selectedBacktest} />
              </TabsContent>
              <TabsContent value="bt-equity" className="mt-md">
                <GridBacktestEquityCurveTab backtest={selectedBacktest} />
              </TabsContent>
              <TabsContent value="bt-stats" className="mt-md">
                <GridBacktestStatsTab backtest={selectedBacktest} />
              </TabsContent>
            </Tabs>
          ) : (
            <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
              Loading shared backtest…
            </div>
          )}
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout
      pageTitle="Grid Bot - New"
      activePage="/grid/new"
      fullyScrollable
      navigationBack
    >
      <Slot name="bot.formMounted" />
      <WidgetContainer layout="flex">
        {isLoading || isLoadingClone ? (
          <BotPanelLayout
            chart={loadingChartPanel}
            form={loadingFormPanel}
            insights={
              <BotPanelInsights
                tabs={loadingInsightsConfig.tabs}
                value={activeInsightsTab}
                onTabChange={setActiveInsightsTab}
              />
            }
            className="flex-1"
            botType="grid"
            key="grid-new"
            mobileFullscreen
            scrollable
          />
        ) : (
          <BotPanelLayout
            chart={chartPanel}
            form={formPanel}
            insights={
              <BotPanelInsights
                tabs={insightsConfig.tabs}
                value={activeInsightsTab}
                onTabChange={setActiveInsightsTab}
                actions={insightsConfig.actions}
              />
            }
            className="flex-1"
            botType="grid"
            key="grid-new"
            mobileFullscreen
            scrollable
          />
        )}
      </WidgetContainer>

      {/* Extension slot for optional UI (survey prompt, dialogs, etc). */}
      <ExtensionSlot name="gridBotNew.extensions" />

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
          strategy="Grid"
          meta={{
            symbol: selectedBacktest.symbol,
            exchange: String(selectedBacktest.exchange ?? ''),
            baseAsset: selectedBacktest.baseAsset,
            quoteAsset: selectedBacktest.quoteAsset,
          }}
          botName={selectedBacktest.settings?.name}
        />
      )}
    </MainLayout>
  );
};

const GridBotNew = () => {
  return (
    <TradingTerminalUtilsProvider>
      <GridBotNewWidget />
    </TradingTerminalUtilsProvider>
  );
};

export default GridBotNew;
