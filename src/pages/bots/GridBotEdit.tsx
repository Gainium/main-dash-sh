import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  BotPanelInsights,
  type BotPanelInsightsTab,
} from '@/components/bots/panels';
import { BotPanelLayout } from '@/components/bots/panels/BotPanelLayout';
import BotChartPanel from '@/components/bots/panels/contents/chart/BotChartPanel';
import BotFormPanel from '@/components/bots/panels/contents/form/BotFormPanel';
import { usePanelMenuBridge } from '@/components/bots/panels/hooks/usePanelMenuBridge';
import { type PanelContentConfig } from '@/components/bots/panels/PanelContainer';
import MainLayout from '@/components/layout/MainLayout';
import { Badge } from '@/components/ui/badge';
import { ProfitLossPercChip } from '@/components/ui/chip';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import {
  DataTable,
  type BulkAction,
} from '@/components/ui/data-table/data-table';
import InlineNoteCell from '@/components/ui/InlineNoteCell';
import { BacktestPermanentCheckbox } from '@/components/widgets/bots/backtest';
import { BacktestResultsFullModal } from '@/components/widgets/bots/backtest/redesign';
import { TVChartPicker } from '@/components/widgets/shared/TradingViewChart';
import type { TradingViewChartRef } from '@/components/widgets/shared/TradingViewChart/TradingViewChart';
import {
  TradingTerminalUtilsProvider,
  useTradingTerminalUtils,
} from '@/context/TradingTerminalUtilsContext';
import { GridPageProvider } from '@/contexts/bots/grid/GridPageProvider';
import { useBotPageLoading } from '@/hooks/bots/base/useBotPageLoading';
import { useBotPageRedirect } from '@/hooks/bots/base/useBotPageRedirect';
import {
  useDeleteBacktests,
  useExportBacktests,
} from '@/hooks/useBacktestDataManagement';
import { useGridBacktests } from '@/hooks/useGridBacktests';
import { useSetBacktestNote } from '@/hooks/useSetBacktestNote';
import { useIsReadOnly } from '@/lib/demoMode';
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
  type BotChartData,
  type GRIDBacktestingResultHistory,
} from '@/types';
import { exampleOrdersStore } from '@/utils/bots/dca/example-orders';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, MoreVertical, Trash2 } from 'lucide-react';

const INITIAL_LOADING_DELAY_MS = 1000;

const GridBotEditWidget = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  useBotPageRedirect('/grid');
  const isLoading = useBotPageLoading(INITIAL_LOADING_DELAY_MS);

  const isReadOnly = useIsReadOnly();

  useEffect(() => {
    if (isReadOnly) {
      navigate('/grid', { replace: true });
    }
  }, [isReadOnly, navigate]);

  const [selectedBacktest, setSelectedBacktest] =
    useState<GRIDBacktestingResultHistory | null>(null);
  const [activeInsightsTab, setActiveInsightsTab] = useState('backtests');
  // Clicking a backtest row opens the redesigned full-screen results modal
  // instead of rendering Overview/Transactions/Equity/Stats inline.
  const [resultsModalOpen, setResultsModalOpen] = useState(false);
  const [pendingBacktestId, setPendingBacktestId] = useState<string | null>(
    null
  );
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [backtestsToDelete, setBacktestsToDelete] = useState<string[]>([]);

  useEffect(() => {
    return () => {
      exampleOrdersStore.reset();
    };
  }, []);

  const hasBotId = Boolean(id);
  const safeBotId = id ?? '';

  // Hooks for delete and export
  const deleteBacktestsMutation = useDeleteBacktests();
  const exportBacktestsMutation = useExportBacktests();

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
      logger.info('[GridBotEdit] Auto-selected completed backtest', {
        id: pendingBacktestId,
      });
    }
  }, [gridBacktests, pendingBacktestId]);

  // Callback fired by BotForm when a local backtest finishes and is persisted
  const handleBacktestComplete = useCallback((backtestId: string) => {
    logger.info('[GridBotEdit] Backtest completed, pending selection', {
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
        logger.info('[GridBotEdit] Exporting backtests', {
          backtestIds,
          format,
          prefix: 'GRID_BACKTEST_EXPORT',
        });
        await exportBacktestsMutation.mutateAsync({ ids: backtestIds, format });
        toast.success(
          `Exported ${backtestIds.length} backtest${backtestIds.length > 1 ? 's' : ''} successfully`
        );
      } catch (error) {
        logger.error('[GridBotEdit] Export failed', {
          error,
          prefix: 'GRID_BACKTEST_EXPORT',
        });
        toast.error(
          error instanceof Error ? error.message : 'Failed to export backtests'
        );
      }
    },
    // Depend on the stable `mutateAsync` reference, not the whole mutation
    // object — react-query returns a new mutation object on every render, so
    // depending on it makes this callback (and `insightsTabs`/the DataTable
    // columns built from it) churn every render and infinite-loop.
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
      logger.info('[GridBotEdit] Deleting backtests', {
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

      if (
        selectedBacktest &&
        backtestsToDelete.includes(selectedBacktest._id)
      ) {
        setSelectedBacktest(null);
      }
    } catch (error) {
      logger.error('[GridBotEdit] Delete failed', {
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
    // `.mutate` is a stable reference; the mutation object itself is recreated
    // every render. `handleSaveBacktestNote` feeds `backtestColumns`, which is
    // passed straight to the DataTable as `columns` — an unstable identity here
    // makes the whole table re-render every commit and infinite-loop.
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
  useEffect(() => {
    if (!selectedBacktest) return;
    const updated = gridBacktests.find((b) => b._id === selectedBacktest._id);
    if (updated && updated !== selectedBacktest) {
      setSelectedBacktest(updated);
    }
  }, [gridBacktests, selectedBacktest]);

  const [chartMenu, handleChartMenuChange] = usePanelMenuBridge();
  const [chartData, setChartData] = useState<BotChartData>({});

  const handleFormDataChange = useCallback((data: BotChartData) => {
    setChartData(data);
  }, []);

  const tvRef = useRef<TradingViewChartRef | null>(null);

  const { activePickerField, handleChartPick, onActiveChanged } =
    useTradingTerminalUtils();

  const chartPanel = useMemo<PanelContentConfig>(() => {
    const base: PanelContentConfig = {
      content: (
        <>
          <BotChartPanel
            widgetId="grid-edit-bot-chart"
            variant="panel"
            className="h-full"
            onPanelMenuChange={handleChartMenuChange}
            {...(chartData.symbol ? { symbol: chartData.symbol } : {})}
            data={{
              botId: safeBotId,
              ...(chartData.symbol ? { symbol: chartData.symbol } : {}),
              exchange: chartData.exchange || 'binance',
              ...(chartData.botId ? { botId: chartData.botId } : {}),
            }}
            ref={tvRef}
          />
          <TVChartPicker
            chartRef={tvRef}
            isActive={!!activePickerField}
            onPick={handleChartPick}
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
    handleChartPick,
    onActiveChanged,
    safeBotId,
  ]);

  const formPanel = useMemo<PanelContentConfig>(() => {
    const base: PanelContentConfig = {
      content: (
        <BotFormPanel
          widgetId="grid-edit-bot"
          mode="edit"
          botId={safeBotId}
          botType={BotTypesEnum.grid}
          terminal={false}
          disableMobileAutoDetect
          onFormDataChange={handleFormDataChange}
          onBacktestComplete={handleBacktestComplete}
        />
      ),
      contentClassName: 'flex h-full flex-col',
      containerClassName: 'min-h-[360px]',
    };

    return base;
  }, [safeBotId, handleFormDataChange, handleBacktestComplete]);

  const insightsTabs = useMemo<BotPanelInsightsTab[]>(() => {
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

    return [
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
            tableId="grid-backtests-table-edit"
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
  }, [
    backtestsBadge,
    backtestColumns,
    gridBacktests,
    gridBacktestsLoading,
    gridBacktestsError,
    handleBacktestSelect,
    handleExportBacktests,
    handleDeleteBacktests,
  ]);

  const loadingInsightsTabs = useMemo<BotPanelInsightsTab[]>(
    () => [
      {
        key: 'backtests',
        title: 'Backtests',
        badge: <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />,
        content: (
          <div className="flex h-full flex-col gap-sm">
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="h-28 w-full animate-pulse rounded bg-muted" />
            <div className="h-28 w-full animate-pulse rounded bg-muted" />
          </div>
        ),
      },
    ],
    []
  );

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
      description: 'Loading saved settings…',
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

  if (!hasBotId) {
    return (
      <MainLayout pageTitle="Grid Bot - Edit" activePage="/grid" navigationBack>
        <div className="p-lg">
          <div className="mx-auto max-w-3xl rounded-xl border border-amber-200 bg-amber-50 px-md py-md text-amber-900">
            No bot ID provided.
          </div>
        </div>
      </MainLayout>
    );
  }

  const resolvedPanelLayout = isLoading ? (
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
      botType="grid"
      key={`grid-${safeBotId || 'edit'}`}
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
        />
      }
      className="flex-1"
      botType="grid"
      key={`grid-${safeBotId || 'edit'}`}
      mobileFullscreen
      scrollable
    />
  );

  const content = isLoading ? (
    resolvedPanelLayout
  ) : (
    <GridPageProvider options={{ botId: safeBotId }}>
      {resolvedPanelLayout}
    </GridPageProvider>
  );

  return (
    <MainLayout pageTitle="Grid Bot - Edit" activePage="/grid" navigationBack>
      <div className="flex flex-col gap-md">{content}</div>

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

const GridBotEdit = () => {
  return (
    <TradingTerminalUtilsProvider>
      <GridBotEditWidget />
    </TradingTerminalUtilsProvider>
  );
};

export default GridBotEdit;
