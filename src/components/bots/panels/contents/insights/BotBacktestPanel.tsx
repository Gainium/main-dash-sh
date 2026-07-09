import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  BotPanelInsights,
  type BotPanelInsightsTab,
} from '@/components/bots/panels';
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  BacktestAnalysisTab,
  BacktestDealsTab,
  BacktestOverviewTab,
  BacktestPermanentCheckbox,
  BacktestStatsTab,
  ShareBacktestButton,
} from '@/components/widgets/bots/backtest';
import { BacktestResultsFullModal } from '@/components/widgets/bots/backtest/redesign';
import CoinPair from '@/components/widgets/shared/CoinPair';
import {
  useDeleteBacktests,
  useExportBacktests,
  useImportBacktestAsPaper,
  useLoadBacktestDetails,
  useShareBacktest,
} from '@/hooks/useBacktestDataManagement';
import { useBacktests } from '@/hooks/useBacktests';
import { useBacktestsSummary } from '@/hooks/useBacktestsSummary';
import { useDcaBacktests } from '@/hooks/useDcaBacktests';
import { useSetBacktestNote } from '@/hooks/useSetBacktestNote';
import { useShareContext } from '@/hooks/useShareContext';
import { GraphQLClient } from '@/lib/api';
import { botQueries } from '@/lib/api/GraphQLQueries-bot-queries';
import { buildBacktestShareUrl } from '@/lib/shareLinks';
import { logger } from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/stores/authStore';
import { useTablePreferencesStore } from '@/stores/tablePreferencesStore';
import {
  BotTypesEnum,
  type DCABacktestingResultHistory,
  type DCABotSettings,
} from '@/types';
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

export interface BotBacktestPanelApi {
  /**
   * Ready-to-mount <BotPanelInsights> element, CONTROLLED by
   * activeInsightsTab/onActiveInsightsTabChange. The page drops this into
   * BotPanelLayout's `insights` slot in its non-loading branch.
   */
  insights: ReactNode;
  /**
   * Wire into <BotFormPanel onBacktestComplete={...} /> in the page's form
   * slot. Sets pendingBacktestId + switches activeInsightsTab to 'backtests'.
   */
  onBacktestComplete: (backtestId: string) => void;
  /**
   * True when ?backtestShare= is present AND enableShareViewer is set (New
   * only). Always false when enableShareViewer is unset.
   */
  isShareMode: boolean;
  /**
   * The tabbed Overview/Stats/Deals/Analysis block rendered in share mode.
   * Null unless isShareMode.
   */
  shareContent: ReactNode;
}

export interface BotBacktestPanelProps {
  /**
   * Drives the create/edit divergences preserved byte-for-byte:
   *  - 'create': handleLoadBacktestDetails ends with
   *     onActiveInsightsTabChange('bt-overview'); header actions carry the
   *     ShareBacktestButton; enableShareViewer is meaningful.
   *  - 'edit':   handleLoadBacktestDetails ends with setResultsModalOpen(true);
   *     header actions are the subtitle span only.
   */
  mode: 'create' | 'edit';

  /** DataTable persistence id. New: 'dca-backtests-table-new'. Edit: 'dca-backtests-table'. */
  tableId: string;

  /**
   * tableId used by the one-shot "pin actions right" init effect. Defaults
   * to `tableId`. Edit MUST pass 'dca-backtests-table-edit' to preserve the
   * pre-existing mismatch (its DataTable uses 'dca-backtests-table', so the
   * pinned-init write targets a different key and is effectively a no-op).
   */
  pinnedInitTableId?: string;

  /**
   * Controlled insights tab value, OWNED BY THE PAGE (shared with
   * BotPanelLayout's mobile top-level tabs and the page's loading-state
   * BotPanelInsights).
   */
  activeInsightsTab: string;
  onActiveInsightsTabChange: (tab: string) => void;

  /** Passed to useBacktests({ enabled }). New: omit/true. Edit: hasBotId. */
  backtestsEnabled?: boolean;

  /** Passed to useBacktestsSummary({ messages }). Edit: { loadingSubtitle: 'Loading linked backtests' }. */
  summaryMessages?: { loadingSubtitle?: string };

  /**
   * "Load in settings" row/menu action. Panel calls this; impl differs and
   * STAYS in the page.
   */
  onLoadBacktestIntoForm: (backtest: DCABacktestingResultHistory) => void;

  /** Render the ?backtestShare= public viewer path (New only). */
  enableShareViewer?: boolean;

  /** Show the header ShareBacktestButton for the selected backtest (New only). */
  showShareSelectedButton?: boolean;

  /**
   * Render-prop. Receives the ready insights node + onBacktestComplete +
   * share state, returns the page's own tree. The panel appends the delete
   * ConfirmationDialog and the BacktestResultsFullModal AFTER the returned
   * tree (suppressed in share mode).
   */
  children: (api: BotBacktestPanelApi) => ReactNode;
}

export function BotBacktestPanel({
  mode,
  tableId,
  pinnedInitTableId,
  activeInsightsTab,
  onActiveInsightsTabChange,
  backtestsEnabled,
  summaryMessages,
  onLoadBacktestIntoForm,
  enableShareViewer,
  showShareSelectedButton,
  children,
}: BotBacktestPanelProps) {
  const [selectedBacktest, setSelectedBacktest] =
    useState<DCABacktestingResultHistory | null>(null);
  // Clicking a backtest row opens the redesigned full-screen results modal
  // instead of rendering Overview/Stats/Deals/Analysis inline in the widget.
  const [resultsModalOpen, setResultsModalOpen] = useState(false);
  // Track a newly completed backtest ID so we can auto-select it once it appears in the list
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
    const pinTableId = pinnedInitTableId ?? tableId;
    const prefs = useTablePreferencesStore.getState().preferences[pinTableId];
    if (!prefs?.pinnedColumns?.right?.includes('actions')) {
      useTablePreferencesStore.getState().setPinnedColumns(pinTableId, {
        left: prefs?.pinnedColumns?.left || [],
        right: ['actions'],
      });
    }
  }, [pinnedInitTableId, tableId]);

  const {
    backtests,
    isLoading: backtestsLoading,
    error: backtestsError,
  } = useBacktests({
    filters: {
      page: 0,
      pageSize: 25,
    },
    enabled: backtestsEnabled ?? true,
  });

  const backtestsSummary = useBacktestsSummary({
    backtests,
    isLoading: backtestsLoading,
    error: backtestsError,
    ...(summaryMessages ? { messages: summaryMessages } : {}),
  });

  // Fetch DCA backtests for the table
  const {
    backtests: dcaBacktests,
    isLoading: dcaBacktestsLoading,
    error: dcaBacktestsError,
  } = useDcaBacktests();

  // Auto-select a newly completed backtest when it appears in the list
  useEffect(() => {
    if (!pendingBacktestId) return;
    const found = dcaBacktests.find((b) => b._id === pendingBacktestId);
    if (found) {
      setSelectedBacktest(found);
      setResultsModalOpen(true);
      setPendingBacktestId(null);
      logger.info('[BotBacktestPanel] Auto-selected completed backtest', {
        id: pendingBacktestId,
      });
    }
  }, [dcaBacktests, pendingBacktestId]);

  // Public share viewer: when the URL carries `?backtestShare=<id>` we
  // fetch the shared backtest by share id and hydrate it as the active
  // selection. New only (gated by enableShareViewer).
  const { backtestShareId } = useShareContext();
  const [shareLookupAttempted, setShareLookupAttempted] = useState(false);
  useEffect(() => {
    if (!enableShareViewer) return;
    if (!backtestShareId || shareLookupAttempted) return;
    setShareLookupAttempted(true);

    // First, try the already-loaded list — owner refreshing their own
    // link shouldn't pay for a second round-trip.
    const local = dcaBacktests.find((b) => b.shareId === backtestShareId);
    if (local) {
      setSelectedBacktest(local);
      onActiveInsightsTabChange('bt-overview');
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
    const { query, variables } = botQueries.getBacktestByShareId({
      shareId: backtestShareId,
    });

    client
      .request<{
        getBacktestByShareId: {
          status: string;
          reason?: string;
          data?: DCABacktestingResultHistory;
        };
      }>(query, variables)
      .then((response) => {
        const payload = response.getBacktestByShareId;
        if (payload?.status === 'OK' && payload.data) {
          setSelectedBacktest(payload.data);
          onActiveInsightsTabChange('bt-overview');
        } else {
          toast.error(
            payload?.reason || 'Could not load shared backtest by link'
          );
        }
      })
      .catch((err) => {
        logger.error('[BotBacktestPanel] getBacktestByShareId failed', {
          error: err instanceof Error ? err.message : String(err),
          shareId: backtestShareId,
        });
        toast.error(
          err instanceof Error ? err.message : 'Failed to load shared backtest'
        );
      });
  }, [
    enableShareViewer,
    backtestShareId,
    dcaBacktests,
    shareLookupAttempted,
    onActiveInsightsTabChange,
  ]);

  // Callback fired by BotForm when a local backtest finishes and is persisted
  const handleBacktestComplete = useCallback(
    (backtestId: string) => {
      logger.info('[BotBacktestPanel] Backtest completed, pending selection', {
        backtestId,
      });
      setPendingBacktestId(backtestId);
      onActiveInsightsTabChange('backtests');
    },
    [onActiveInsightsTabChange]
  );

  // Badge for backtests tab
  const backtestsBadge = useMemo<ReactNode>(() => {
    if (dcaBacktestsLoading) {
      return <Badge variant="secondary">Loading...</Badge>;
    }
    if (dcaBacktestsError) {
      return <Badge variant="destructive">Error</Badge>;
    }
    const count = dcaBacktests.length;
    return count > 0 ? (
      <Badge variant="default">{count}</Badge>
    ) : (
      <Badge variant="outline">0</Badge>
    );
  }, [dcaBacktests.length, dcaBacktestsLoading, dcaBacktestsError]);

  // Handle export single or multiple backtests
  const handleExportBacktests = useCallback(
    async (backtestIds: string[], format: 'json' | 'csv' = 'json') => {
      try {
        logger.info('[BotBacktestPanel] Exporting backtests', {
          backtestIds,
          format,
          prefix: 'BACKTEST_EXPORT',
        });
        await exportBacktestsMutation.mutateAsync({ ids: backtestIds, format });
        toast.success(
          `Exported ${backtestIds.length} backtest${backtestIds.length > 1 ? 's' : ''} successfully`
        );
      } catch (error) {
        logger.error('[BotBacktestPanel] Export failed', {
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
        path: '/bot/backtests',
        shareId,
        subKind: 'dca',
      }),
    []
  );

  const handleShareBacktest = useCallback(
    async (backtest: DCABacktestingResultHistory) => {
      try {
        const result = await shareBacktestMutation.mutateAsync({
          id: backtest._id,
          shareId: backtest.shareId,
          backtestType: 'dca',
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

  const handleLoadBacktestDetails = useCallback(
    async (backtest: DCABacktestingResultHistory) => {
      try {
        await loadBacktestDetailsMutation.mutateAsync({ id: backtest._id });
      } catch (error) {
        logger.warn(
          '[BotBacktestPanel] Load details fallback to in-memory backtest',
          {
            error: error instanceof Error ? error.message : String(error),
            id: backtest._id,
          }
        );
      }
      setSelectedBacktest(backtest);
      if (mode === 'create') {
        onActiveInsightsTabChange('bt-overview');
      } else {
        setResultsModalOpen(true);
      }
    },
    [loadBacktestDetailsMutation, mode, onActiveInsightsTabChange]
  );

  const handleImportAsPaper = useCallback(
    async (backtest: DCABacktestingResultHistory, trades = false) => {
      try {
        const exchange = removePaperPrefix(backtest.exchange);
        const result = await importAsPaperMutation.mutateAsync({
          id: backtest._id,
          backtestType: 'dca',
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
      logger.info('[BotBacktestPanel] Deleting backtests', {
        ids: backtestsToDelete,
        prefix: 'BACKTEST_DELETE',
      });
      await deleteBacktestsMutation.mutateAsync({ ids: backtestsToDelete });
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
      logger.error('[BotBacktestPanel] Delete failed', {
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
        { id: backtestId, note: next, type: BotTypesEnum.dca },
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
            type={BotTypesEnum.dca}
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
                    onClick={() => onLoadBacktestIntoForm(backtest)}
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
      onLoadBacktestIntoForm,
      handleLoadBacktestDetails,
      handleSaveBacktestNote,
      handleShareBacktest,
      user?.importAsPaper,
    ]
  );

  // Handle row click to select a backtest and open the full-screen results modal
  const handleBacktestSelect = useCallback(
    (backtest: DCABacktestingResultHistory) => {
      setSelectedBacktest(backtest);
      // Open the full-screen results modal (deals hydrate below, the modal's
      // view model rebuilds reactively once they arrive).
      setResultsModalOpen(true);

      if ((backtest.deals?.length ?? 0) === 0) {
        void loadBacktestDetailsMutation
          .mutateAsync({ id: backtest._id })
          .catch((error) => {
            logger.debug('[BotBacktestPanel] Could not hydrate backtest deals', {
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

    const hydratedBacktest = dcaBacktests.find(
      (backtest) =>
        backtest._id === selectedBacktest._id &&
        (backtest.deals?.length ?? 0) > 0
    );

    if (hydratedBacktest) {
      setSelectedBacktest(hydratedBacktest);
    }
  }, [dcaBacktests, selectedBacktest]);

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
        key: 'backtests',
        title: 'Backtests',
        badge: backtestsBadge,
        bodyClassName: 'p-0',
        content: dcaBacktestsLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="h-32 w-full animate-pulse rounded bg-muted" />
          </div>
        ) : dcaBacktestsError ? (
          <div className="flex items-center justify-center h-full text-destructive">
            Error loading backtests
          </div>
        ) : (
          <DataTable
            tableId={tableId}
            columns={backtestColumns}
            data={dcaBacktests}
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
        // Results (Overview/Stats/Deals/Analysis) now open in the
        // full-screen modal on row click — no inline subtabs in the widget.
      },
    ];

    return tabs;
  }, [
    backtestsBadge,
    tableId,
    dcaBacktests,
    dcaBacktestsLoading,
    dcaBacktestsError,
    backtestColumns,
    handleBacktestSelect,
    handleExportBacktests,
    handleDeleteBacktests,
  ]);

  const canShareSelected =
    !!selectedBacktest &&
    !!user?.id &&
    (selectedBacktest as { userId?: string }).userId === user.id;

  const insightsActions = useMemo<ReactNode>(() => {
    if (showShareSelectedButton) {
      return (
        <div className="flex items-center gap-xs">
          {backtestsSummary.subtitle ? (
            <span>{backtestsSummary.subtitle}</span>
          ) : null}
          {selectedBacktest && (
            <ShareBacktestButton
              backtestId={selectedBacktest._id}
              existingShareId={selectedBacktest.shareId}
              backtestType="dca"
              sharePath="/bot/backtests"
              canShare={canShareSelected}
            />
          )}
        </div>
      );
    }
    return backtestsSummary.subtitle ? (
      <span>{backtestsSummary.subtitle}</span>
    ) : undefined;
  }, [
    showShareSelectedButton,
    backtestsSummary.subtitle,
    selectedBacktest,
    canShareSelected,
  ]);

  const insights = (
    <BotPanelInsights
      tabs={insightsTabs}
      value={activeInsightsTab}
      onTabChange={onActiveInsightsTabChange}
      actions={insightsActions}
    />
  );

  const isShareMode = Boolean(enableShareViewer) && Boolean(backtestShareId);

  // Share-mode: render the shared backtest detail with the full set of
  // tabs (Overview / Stats / Deals / Analysis). The page wraps this in
  // its own MainLayout(pageTitle="Shared backtest").
  const shareContent = useMemo<ReactNode>(() => {
    if (!isShareMode) return null;
    const hasAnalysis =
      !!selectedBacktest &&
      ((selectedBacktest.deals?.length ?? 0) > 0 ||
        (selectedBacktest.periodicStats?.length ?? 0) > 0);
    return (
      <div className="flex flex-col gap-md p-md">
        {selectedBacktest ? (
          <Tabs defaultValue="bt-overview" className="w-full">
            <TabsList>
              <TabsTrigger value="bt-overview">Overview</TabsTrigger>
              <TabsTrigger value="bt-stats">Stats</TabsTrigger>
              <TabsTrigger value="bt-deals">Deals</TabsTrigger>
              <TabsTrigger value="bt-analysis" disabled={!hasAnalysis}>
                Analysis
              </TabsTrigger>
            </TabsList>
            <TabsContent value="bt-overview" className="mt-md">
              <BacktestOverviewTab backtest={selectedBacktest} />
            </TabsContent>
            <TabsContent value="bt-stats" className="mt-md">
              <BacktestStatsTab backtest={selectedBacktest} />
            </TabsContent>
            <TabsContent value="bt-deals" className="mt-md">
              <BacktestDealsTab backtest={selectedBacktest} />
            </TabsContent>
            <TabsContent value="bt-analysis" className="mt-md">
              {hasAnalysis ? (
                <BacktestAnalysisTab backtest={selectedBacktest} />
              ) : (
                <div className="text-sm text-muted-foreground">
                  No analysis data available for this backtest.
                </div>
              )}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
            Loading shared backtest…
          </div>
        )}
      </div>
    );
  }, [isShareMode, selectedBacktest]);

  const api: BotBacktestPanelApi = {
    insights,
    onBacktestComplete: handleBacktestComplete,
    isShareMode,
    shareContent,
  };

  return (
    <>
      {children(api)}
      {!isShareMode && (
        <>
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
              strategy="DCA"
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
        </>
      )}
    </>
  );
}

export default BotBacktestPanel;
