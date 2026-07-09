import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  BotPanelInsights,
  type BotPanelInsightsTab,
} from '@/components/bots/panels';
import type {
  BacktestRowBase,
  BotBacktestDescriptor,
} from '@/components/bots/workbench/descriptors/types';
import { Badge } from '@/components/ui/badge';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import {
  DataTable,
  type BulkAction,
} from '@/components/ui/data-table/data-table';
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
  BacktestStatsTab,
  ShareBacktestButton,
} from '@/components/widgets/bots/backtest';
import { BacktestResultsFullModal } from '@/components/widgets/bots/backtest/redesign';
import {
  useDeleteBacktests,
  useExportBacktests,
  useImportBacktestAsPaper,
  useLoadBacktestDetails,
  useShareBacktest,
} from '@/hooks/useBacktestDataManagement';
import { useBacktests } from '@/hooks/useBacktests';
import { useBacktestsSummary } from '@/hooks/useBacktestsSummary';
import { useSetBacktestNote } from '@/hooks/useSetBacktestNote';
import { useShareContext } from '@/hooks/useShareContext';
import { GraphQLClient } from '@/lib/api';
import { buildBacktestShareUrl } from '@/lib/shareLinks';
import { logger } from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/stores/authStore';
import { useTablePreferencesStore } from '@/stores/tablePreferencesStore';
import type { DCABacktestingResultHistory } from '@/types';
import { removePaperPrefix } from '@/utils/exchangeUtils';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, Trash2 } from 'lucide-react';

export interface BotBacktestPanelApi {
  /**
   * Ready-to-mount <BotPanelInsights> element, CONTROLLED by
   * activeInsightsTab/onActiveInsightsTabChange. The page drops this into
   * BotPanelLayout's `insights` slot in its non-loading branch.
   */
  insights: ReactNode;
  /**
   * Wire into <BotFormPanel onBacktestComplete={...} /> in the page's form
   * slot. Sets pendingBacktestId + switches activeInsightsTab to the type's
   * backtests tab.
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

export interface BotBacktestPanelProps<TResult extends BacktestRowBase> {
  /**
   * Per-type backtest composition slice (list hook, columns, mutation kinds,
   * table ids, share plumbing, results-modal strategy). One stable module
   * constant per mounted page, so calling descriptor.useList() unconditionally
   * is Rules-of-Hooks-safe.
   */
  descriptor: BotBacktestDescriptor<TResult>;

  /**
   * Drives the create/edit divergences preserved byte-for-byte:
   *  - 'create': handleLoadBacktestDetails ends with
   *     onActiveInsightsTabChange('bt-overview'); header actions carry the
   *     ShareBacktestButton; enableShareViewer is meaningful.
   *  - 'edit':   handleLoadBacktestDetails ends with setResultsModalOpen(true);
   *     header actions are the subtitle span only.
   */
  mode: 'create' | 'edit';

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
  onLoadBacktestIntoForm: (backtest: TResult) => void;

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

export function BotBacktestPanel<TResult extends BacktestRowBase>({
  descriptor,
  mode,
  activeInsightsTab,
  onActiveInsightsTabChange,
  backtestsEnabled,
  summaryMessages,
  onLoadBacktestIntoForm,
  enableShareViewer,
  showShareSelectedButton,
  children,
}: BotBacktestPanelProps<TResult>) {
  // DataTable persistence id + the one-shot "pin actions right" init id are
  // per-mode, sourced from the descriptor. pinnedInitTableId falls back to
  // tableId per mode when absent.
  const tableId = descriptor.tableId[mode];
  const pinnedInitTableId = descriptor.pinnedInitTableId?.[mode];

  const [selectedBacktest, setSelectedBacktest] = useState<TResult | null>(
    null
  );
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
    // Only dca/combo consume the linked-summary query; grid opts out
    // (useLinkedSummary=false) and never fired this round-trip in its old page.
    enabled: descriptor.useLinkedSummary && (backtestsEnabled ?? true),
  });

  const backtestsSummary = useBacktestsSummary({
    backtests,
    isLoading: backtestsLoading,
    error: backtestsError,
    ...(summaryMessages ? { messages: summaryMessages } : {}),
  });

  // Per-type backtest list for the table. Descriptor is a stable module
  // constant per page, so calling descriptor.useList() here is hooks-safe.
  const {
    backtests: rows,
    isLoading: rowsLoading,
    error: rowsError,
  } = descriptor.useList();

  // Auto-select a newly completed backtest when it appears in the list
  useEffect(() => {
    if (!pendingBacktestId) return;
    const found = rows.find((b) => b._id === pendingBacktestId);
    if (found) {
      setSelectedBacktest(found);
      setResultsModalOpen(true);
      setPendingBacktestId(null);
      logger.info('[BotBacktestPanel] Auto-selected completed backtest', {
        id: pendingBacktestId,
      });
    }
  }, [rows, pendingBacktestId]);

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
    const local = rows.find((b) => b.shareId === backtestShareId);
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
    const { query, variables } = descriptor.getByShareId({
      shareId: backtestShareId,
    });

    client
      .request<
        Record<string, { status: string; reason?: string; data?: TResult }>
      >(query, variables)
      .then((response) => {
        // The response is keyed by the per-type query name
        // (getBacktestByShareId / getGridBacktestByShareId / …); read the
        // single payload without hardcoding the DCA key.
        const payload = Object.values(response)[0];
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
    rows,
    shareLookupAttempted,
    onActiveInsightsTabChange,
    descriptor,
  ]);

  // Callback fired by BotForm when a local backtest finishes and is persisted
  const handleBacktestComplete = useCallback(
    (backtestId: string) => {
      logger.info('[BotBacktestPanel] Backtest completed, pending selection', {
        backtestId,
      });
      setPendingBacktestId(backtestId);
      onActiveInsightsTabChange(descriptor.tabKey);
    },
    [onActiveInsightsTabChange, descriptor.tabKey]
  );

  // Badge for backtests tab
  const backtestsBadge = useMemo<ReactNode>(() => {
    if (rowsLoading) {
      return <Badge variant="secondary">Loading...</Badge>;
    }
    if (rowsError) {
      return <Badge variant="destructive">Error</Badge>;
    }
    const count = rows.length;
    return count > 0 ? (
      <Badge variant="default">{count}</Badge>
    ) : (
      <Badge variant="outline">0</Badge>
    );
  }, [rows.length, rowsLoading, rowsError]);

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
        path: descriptor.sharePath,
        shareId,
        subKind: descriptor.shareSubKind,
      }),
    [descriptor.sharePath, descriptor.shareSubKind]
  );

  const handleShareBacktest = useCallback(
    async (backtest: TResult) => {
      try {
        const result = await shareBacktestMutation.mutateAsync({
          id: backtest._id,
          shareId: backtest.shareId,
          backtestType: descriptor.kind,
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
    [buildShareUrl, shareBacktestMutation, descriptor.kind]
  );

  const handleLoadBacktestDetails = useCallback(
    async (backtest: TResult) => {
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
    async (backtest: TResult, trades = false) => {
      try {
        const exchange = removePaperPrefix(backtest.exchange);
        const result = await importAsPaperMutation.mutateAsync({
          id: backtest._id,
          backtestType: descriptor.kind,
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
    [importAsPaperMutation, descriptor.kind]
  );

  // Confirm delete
  const confirmDelete = useCallback(async () => {
    try {
      logger.info('[BotBacktestPanel] Deleting backtests', {
        ids: backtestsToDelete,
        prefix: 'BACKTEST_DELETE',
      });
      await deleteBacktestsMutation.mutateAsync({
        ids: backtestsToDelete,
        backtestType: descriptor.kind,
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
      logger.error('[BotBacktestPanel] Delete failed', {
        error,
        prefix: 'BACKTEST_DELETE',
      });
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete backtests'
      );
    }
  }, [backtestsToDelete, deleteBacktestsMutation, selectedBacktest, descriptor.kind]);

  // Inline note editing for the backtest table
  const setBacktestNoteMutation = useSetBacktestNote();
  const [backtestNoteOverrides, setBacktestNoteOverrides] = useState<
    Record<string, string>
  >({});

  const handleSaveBacktestNote = useCallback(
    (backtestId: string, next: string, prev: string) => {
      setBacktestNoteOverrides((o) => ({ ...o, [backtestId]: next }));
      setBacktestNoteMutation.mutate(
        { id: backtestId, note: next, type: descriptor.noteType },
        {
          onError: () => {
            setBacktestNoteOverrides((o) => ({ ...o, [backtestId]: prev }));
          },
        }
      );
    },
    [setBacktestNoteMutation, descriptor.noteType]
  );

  // Per-type column set — the shared panel never imports a column module
  // directly, it only calls descriptor.buildColumns(ctx).
  const backtestColumns = useMemo<ColumnDef<TResult>[]>(
    () =>
      descriptor.buildColumns(
        {
          user,
          backtestNoteOverrides,
          onSaveNote: handleSaveBacktestNote,
          onShare: handleShareBacktest,
          onLoadIntoForm: onLoadBacktestIntoForm,
          onLoadDetails: handleLoadBacktestDetails,
          onDelete: handleDeleteBacktests,
          onImportAsPaper: handleImportAsPaper,
        },
        mode
      ),
    [
      descriptor,
      mode,
      user,
      backtestNoteOverrides,
      handleSaveBacktestNote,
      handleShareBacktest,
      onLoadBacktestIntoForm,
      handleLoadBacktestDetails,
      handleDeleteBacktests,
      handleImportAsPaper,
    ]
  );

  // Handle row click to select a backtest and open the full-screen results modal
  const handleBacktestSelect = useCallback(
    (backtest: TResult) => {
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

    const hydratedBacktest = rows.find(
      (backtest) =>
        backtest._id === selectedBacktest._id &&
        (backtest.deals?.length ?? 0) > 0
    );

    if (hydratedBacktest) {
      setSelectedBacktest(hydratedBacktest);
    }
  }, [rows, selectedBacktest]);

  const insightsTabs = useMemo<BotPanelInsightsTab[]>(() => {
    // Define bulk actions for the backtest table
    const bulkActions: BulkAction<TResult>[] = [
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
        key: descriptor.tabKey,
        title: descriptor.tabTitle,
        badge: backtestsBadge,
        bodyClassName: 'p-0',
        content: rowsLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="h-32 w-full animate-pulse rounded bg-muted" />
          </div>
        ) : rowsError ? (
          <div className="flex items-center justify-center h-full text-destructive">
            Error loading backtests
          </div>
        ) : (
          <DataTable
            tableId={tableId}
            columns={backtestColumns}
            data={rows}
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
            defaultColumnVisibility={descriptor.defaultColumnVisibility}
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
    rows,
    rowsLoading,
    rowsError,
    backtestColumns,
    handleBacktestSelect,
    handleExportBacktests,
    handleDeleteBacktests,
    descriptor.tabKey,
    descriptor.tabTitle,
    descriptor.defaultColumnVisibility,
  ]);

  const canShareSelected =
    !!selectedBacktest &&
    !!user?.id &&
    (selectedBacktest as { userId?: string }).userId === user.id;

  // Linked-summary subtitle is dca/combo only (useLinkedSummary). For grid
  // (false) the descriptor opts out and no linked subtitle is shown; the
  // list-hook loading state is surfaced via the tab badge instead.
  const summarySubtitle = descriptor.useLinkedSummary
    ? backtestsSummary.subtitle
    : undefined;

  const insightsActions = useMemo<ReactNode>(() => {
    if (showShareSelectedButton) {
      return (
        <div className="flex items-center gap-xs">
          {summarySubtitle ? <span>{summarySubtitle}</span> : null}
          {selectedBacktest && (
            <ShareBacktestButton
              backtestId={selectedBacktest._id}
              existingShareId={selectedBacktest.shareId}
              backtestType={descriptor.shareSubKind}
              sharePath={descriptor.sharePath}
              canShare={canShareSelected}
            />
          )}
        </div>
      );
    }
    return summarySubtitle ? <span>{summarySubtitle}</span> : undefined;
  }, [
    showShareSelectedButton,
    summarySubtitle,
    selectedBacktest,
    canShareSelected,
    descriptor.shareSubKind,
    descriptor.sharePath,
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
    // Per-type share viewer (grid supplies Overview/Transactions/Equity/Stats);
    // dca/combo omit it and fall through to the DCA tab block below.
    if (descriptor.renderShareContent) {
      return (
        <div className="flex flex-col gap-md p-md">
          {selectedBacktest ? (
            descriptor.renderShareContent(selectedBacktest)
          ) : (
            <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
              Loading shared backtest…
            </div>
          )}
        </div>
      );
    }
    const hasAnalysis =
      !!selectedBacktest &&
      ((selectedBacktest.deals?.length ?? 0) > 0 ||
        (selectedBacktest.periodicStats?.length ?? 0) > 0);
    // The share-viewer tabs (Overview/Stats/Deals/Analysis) are DCA/combo
    // typed (both use DCABacktestingResultHistory). Grid's share viewer, if it
    // ever needs different tabs, is a grid-migration concern; cast here so the
    // shared panel stays generic over TResult.
    const shareBacktest =
      selectedBacktest as unknown as DCABacktestingResultHistory | null;
    return (
      <div className="flex flex-col gap-md p-md">
        {shareBacktest ? (
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
              <BacktestOverviewTab backtest={shareBacktest} />
            </TabsContent>
            <TabsContent value="bt-stats" className="mt-md">
              <BacktestStatsTab backtest={shareBacktest} />
            </TabsContent>
            <TabsContent value="bt-deals" className="mt-md">
              <BacktestDealsTab backtest={shareBacktest} />
            </TabsContent>
            <TabsContent value="bt-analysis" className="mt-md">
              {hasAnalysis ? (
                <BacktestAnalysisTab backtest={shareBacktest} />
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
  }, [isShareMode, selectedBacktest, descriptor]);

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
              strategy={descriptor.resultStrategy}
              settings={descriptor.getModalSettings?.(selectedBacktest)}
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
