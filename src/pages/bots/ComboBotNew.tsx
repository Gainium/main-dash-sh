import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  BotPanelInsights,
  BotPanelLayout,
  type BotPanelInsightsTab,
} from '@/components/bots/panels';
import BotChartPanel from '@/components/bots/panels/contents/chart/BotChartPanel';
import BotFormPanel from '@/components/bots/panels/contents/form/BotFormPanel';
import { type PanelContentConfig } from '@/components/bots/panels/PanelContainer';
import MainLayout from '@/components/layout/MainLayout';
import { ExtensionSlot, Slot } from '@/lib/extensions';
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
import { buildBacktestShareUrl } from '@/lib/shareLinks';
import { useShareContext } from '@/hooks/useShareContext';
import { GraphQLClient } from '@/lib/api';
import { botQueries } from '@/lib/api/GraphQLQueries-bot-queries';
import CoinPair from '@/components/widgets/shared/CoinPair';
import { TradingTerminalUtilsProvider } from '@/context/TradingTerminalUtilsContext';
import { useBotPageLoading } from '@/hooks/bots/base/useBotPageLoading';
import { useBotPageRedirect } from '@/hooks/bots/base/useBotPageRedirect';
import { useGraphQL } from '@/hooks/useGraphQL';
import {
  useDeleteBacktests,
  useExportBacktests,
  useImportBacktestAsPaper,
  useLoadBacktestDetails,
  useShareBacktest,
} from '@/hooks/useBacktestDataManagement';
import { useBacktests } from '@/hooks/useBacktests';
import { useBotConfigPreload } from '@/hooks/useBotConfigPreload';
import { useBacktestsSummary } from '@/hooks/useBacktestsSummary';
import { useComboBacktests } from '@/hooks/useComboBacktests';
import { useSetBacktestNote } from '@/hooks/useSetBacktestNote';
import { logger } from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';
import { mapBotSettingsToFormData } from '@/mappers/bots/dca/map-bot-settings-to-form-data';
import { useAuthStore } from '@/stores/authStore';
import { indicatorStore } from '@/stores/indicatorStore';
import { useTablePreferencesStore } from '@/stores/tablePreferencesStore';
import {
  BotTypesEnum,
  type BotChartData,
  type ComboBot,
  type DCABacktestingResultHistory,
  type DCABot,
  type DCABotSettings,
} from '@/types';
import type { BotFormData } from '@/types/bots/form';
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

const INITIAL_LOADING_DELAY_MS = 1200;

const ComboBotNewWidget = () => {
  useBotPageRedirect('/combo');
  const isLoading = useBotPageLoading(INITIAL_LOADING_DELAY_MS);

  const [selectedBacktest, setSelectedBacktest] =
    useState<DCABacktestingResultHistory | null>(null);
  const [formReloadKey, setFormReloadKey] = useState(0);

  // Preloaded form seed from sessionStorage.botConfig (set by the
  // curated-presets widget, wizard slot, More-strategies overlay) plus
  // URL hints. Returns null when nothing is staged.
  const preload = useBotConfigPreload();

  // Clone-from-list flow: `/combo/new?load=<id>` fetches the source bot,
  // maps its settings to formData, and seeds the form with a "(Clone)"
  // name suffix — mirrors the hedge bot clone path.
  const [searchParams] = useSearchParams();
  const loadFromBotId = searchParams.get('load');
  const loadQuery = useGraphQL<ComboBot>(
    'getComboBot',
    botQueries.getComboBot({ id: loadFromBotId ?? '' }),
    { enabled: Boolean(loadFromBotId) }
  );

  const [loadedFormData, setLoadedFormData] = useState<
    Partial<BotFormData> | undefined
  >(undefined);
  const [loadHandled, setLoadHandled] = useState(false);

  useEffect(() => {
    if (!loadFromBotId || loadHandled) return;
    if (loadQuery.isLoading) return;

    if (loadQuery.error) {
      toast.error('Failed to load bot configuration');
      setLoadHandled(true);
      return;
    }

    const payload = loadQuery.data;
    if (!payload) return;

    if (payload.status !== 'OK' || !payload.data) {
      toast.error(payload.reason || 'Failed to load bot configuration');
      setLoadHandled(true);
      return;
    }

    try {
      const bot = payload.data;
      const { formData } = mapBotSettingsToFormData(
        BotTypesEnum.combo,
        bot.settings,
        { bot: bot as unknown as DCABot }
      );
      const base = formData.name?.trim();
      setLoadedFormData({
        ...formData,
        name: base ? `${base} (Clone)` : 'Combo bot (Clone)',
      });
    } catch (err) {
      logger.error('[ComboBotNew] Failed to map cloned bot settings', {
        error: err instanceof Error ? err.message : String(err),
      });
      toast.error('Failed to load bot configuration');
    } finally {
      setLoadHandled(true);
    }
  }, [
    loadFromBotId,
    loadHandled,
    loadQuery.isLoading,
    loadQuery.error,
    loadQuery.data,
  ]);

  const isLoadingClone =
    Boolean(loadFromBotId) && !loadHandled;

  useEffect(() => {
    return () => {
      indicatorStore.reset();
      exampleOrdersStore.reset();
    };
  }, []);
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
    const tableId = 'combo-backtests-table-new';
    const prefs = useTablePreferencesStore.getState().preferences[tableId];
    if (!prefs?.pinnedColumns?.right?.includes('actions')) {
      useTablePreferencesStore.getState().setPinnedColumns(tableId, {
        left: prefs?.pinnedColumns?.left || [],
        right: ['actions'],
      });
    }
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
      logger.info('[ComboBotNew] Auto-selected completed backtest', {
        id: pendingBacktestId,
      });
    }
  }, [comboBacktests, pendingBacktestId]);

  const handleBacktestComplete = useCallback((backtestId: string) => {
    logger.info('[ComboBotNew] Backtest completed, pending selection', {
      backtestId,
    });
    setPendingBacktestId(backtestId);
    setActiveInsightsTab('history');
  }, []);

  // Handle export single or multiple backtests
  const handleExportBacktests = useCallback(
    async (backtestIds: string[], format: 'json' | 'csv' = 'json') => {
      try {
        logger.info('[ComboBotNew] Exporting backtests', {
          backtestIds,
          format,
          prefix: 'BACKTEST_EXPORT',
        });
        await exportBacktestsMutation.mutateAsync({ ids: backtestIds, format });
        toast.success(
          `Exported ${backtestIds.length} backtest${backtestIds.length > 1 ? 's' : ''} successfully`
        );
      } catch (error) {
        logger.error('[ComboBotNew] Export failed', {
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

  // Public share viewer hydration via `?backtestShare=<id>`.
  const { backtestShareId } = useShareContext();
  const [shareLookupAttempted, setShareLookupAttempted] = useState(false);
  useEffect(() => {
    if (!backtestShareId || shareLookupAttempted) return;
    setShareLookupAttempted(true);

    const local = comboBacktests.find((b) => b.shareId === backtestShareId);
    if (local) {
      setSelectedBacktest(local);
      setActiveInsightsTab('history');
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
    const { query, variables } = botQueries.getComboBacktestByShareId({
      shareId: backtestShareId,
    });

    client
      .request<{
        getComboBacktestByShareId: {
          status: string;
          reason?: string;
          data?: DCABacktestingResultHistory;
        };
      }>(query, variables)
      .then((response) => {
        const payload = response.getComboBacktestByShareId;
        if (payload?.status === 'OK' && payload.data) {
          setSelectedBacktest(payload.data);
          setActiveInsightsTab('history');
        } else {
          toast.error(
            payload?.reason || 'Could not load shared backtest by link'
          );
        }
      })
      .catch((err) => {
        logger.error('[ComboBotNew] getComboBacktestByShareId failed', {
          error: err instanceof Error ? err.message : String(err),
          shareId: backtestShareId,
        });
        toast.error(
          err instanceof Error ? err.message : 'Failed to load shared backtest'
        );
      });
  }, [backtestShareId, comboBacktests, shareLookupAttempted]);

  const handleLoadBacktest = useCallback(
    (backtest: DCABacktestingResultHistory) => {
      try {
        const { formData: mappedFormData } = mapBotSettingsToFormData(
          BotTypesEnum.combo,
          {
            settings: backtest.settings,
            exchangeUUID: backtest.exchangeUUID,
          }
        );
        setLoadedFormData(mappedFormData);
        setFormReloadKey((prev) => prev + 1);
        toast.success('Backtest settings loaded into combo bot form');
      } catch (error) {
        logger.error('[ComboBotNew] Failed to load backtest settings', {
          id: backtest._id,
          error: error instanceof Error ? error.message : String(error),
        });
        toast.error('Failed to load backtest settings into bot form');
      }
    },
    []
  );

  const handleLoadBacktestDetails = useCallback(
    async (backtest: DCABacktestingResultHistory) => {
      try {
        await loadBacktestDetailsMutation.mutateAsync({ id: backtest._id });
      } catch (error) {
        logger.warn(
          '[ComboBotNew] Load details fallback to in-memory backtest',
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
      logger.info('[ComboBotNew] Deleting backtests', {
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
      logger.error('[ComboBotNew] Delete failed', {
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
            logger.debug('[ComboBotNew] Could not hydrate backtest deals', {
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

  const [chartData, setChartData] = useState<BotChartData>({});
  const handleFormDataChange = useCallback((data: BotChartData) => {
    setChartData(data);
  }, []);

  const chartPanel = useMemo<PanelContentConfig>(
    () => ({
      content: (
        <BotChartPanel
          widgetId="combo-bot-chart"
          className="h-full"
          {...(chartData.symbol ? { symbol: chartData.symbol } : {})}
          data={{
            ...(chartData.symbol ? { symbol: chartData.symbol } : {}),
            exchange: chartData.exchange || 'binance',
            ...(chartData.botId ? { botId: chartData.botId } : {}),
          }}
        />
      ),
      contentClassName: 'flex h-full flex-col',
      containerClassName: 'min-h-[320px]',
    }),
    [chartData]
  );

  const formPanel = useMemo<PanelContentConfig>(
    () => ({
      content: (
        <BotFormPanel
          key={`combo-create-form-${formReloadKey}`}
          widgetId="combo-create-bot"
          mode="create"
          botType={BotTypesEnum.combo}
          terminal={false}
          // On mobile, BotPanelLayout provides the top-level tabs (Settings/Chart/Backtests),
          // but the form should still show its internal section navigation
          disableMobileAutoDetect
          initialFormData={loadedFormData ?? preload?.initialFormData}
          onFormDataChange={handleFormDataChange}
          onBacktestComplete={handleBacktestComplete}
        />
      ),
      contentClassName: 'flex h-full flex-col',
      containerClassName: 'min-h-[360px]',
    }),
    [
      formReloadKey,
      handleFormDataChange,
      handleBacktestComplete,
      preload?.initialFormData,
      loadedFormData,
    ]
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

  const loadingFormPanel = useMemo<PanelContentConfig>(
    () => ({
      title: 'Configure your combo bot',
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

  // Share-mode: render the shared backtest detail with the full set of
  // tabs (Overview / Deals / Analysis / Stats) so visitors get the same
  // depth the owner sees, matching legacy main-dash.
  if (backtestShareId) {
    const hasAnalysis =
      !!selectedBacktest &&
      ((selectedBacktest.deals?.length ?? 0) > 0 ||
        (selectedBacktest.periodicStats?.length ?? 0) > 0);
    return (
      <MainLayout pageTitle="Shared backtest" activePage="/combo/backtests">
        <div className="flex flex-col gap-md p-md">
          {selectedBacktest ? (
            <Tabs defaultValue="bt-overview" className="w-full">
              <TabsList>
                <TabsTrigger value="bt-overview">Overview</TabsTrigger>
                <TabsTrigger value="bt-deals">Deals</TabsTrigger>
                <TabsTrigger value="bt-analysis" disabled={!hasAnalysis}>
                  Analysis
                </TabsTrigger>
                <TabsTrigger value="bt-stats">Stats</TabsTrigger>
              </TabsList>
              <TabsContent value="bt-overview" className="mt-md">
                <BacktestOverviewTab backtest={selectedBacktest} />
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
              <TabsContent value="bt-stats" className="mt-md">
                <BacktestStatsTab backtest={selectedBacktest} />
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
      pageTitle="Combo Bot - New"
      activePage="/combo/new"
      fullyScrollable
      navigationBack
    >
      <Slot name="bot.formMounted" />
      <div className="flex flex-col gap-md">
        {isLoading || isLoadingClone ? (
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
            key={`combo-new`}
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
                  <div className="flex items-center gap-xs">
                    {backtestsSummary.subtitle ? (
                      <span>{backtestsSummary.subtitle}</span>
                    ) : null}
                    {selectedBacktest && (
                      <ShareBacktestButton
                        backtestId={selectedBacktest._id}
                        existingShareId={selectedBacktest.shareId}
                        backtestType="combo"
                        sharePath="/combo/backtests"
                        canShare={
                          !!user?.id &&
                          (selectedBacktest as { userId?: string }).userId ===
                            user.id
                        }
                      />
                    )}
                  </div>
                }
              />
            }
            className="flex-1"
            key={`combo-new`}
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

      {/* Extension slot for optional UI (survey prompt, dialogs, etc). */}
      <ExtensionSlot name="comboBotNew.extensions" />

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

const ComboBotNew = () => {
  return (
    <TradingTerminalUtilsProvider>
      <ComboBotNewWidget />
    </TradingTerminalUtilsProvider>
  );
};

export default ComboBotNew;
