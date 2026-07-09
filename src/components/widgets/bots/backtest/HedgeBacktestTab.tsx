/**
 * Hedge backtest views — two leaf components the layout composes as
 * separate `BotPanelInsights` tabs (mirrors DCA's structure):
 *
 *   • `HedgeBacktestListView`   — the history table (always visible).
 *   • `HedgeBacktestActiveView` — Combined / Long / Short sub-tabs
 *     over the selected (or just-finished) backtest. Mounted by the
 *     layout into its own tab when there's something to show.
 *
 * Selection state (which history row is "active") lives in the layout
 * so it can drive both the active-tab visibility and auto-switching
 * on row click. In-flight progress is rendered by `BotFormFooter`
 * (and `BacktestSettingsDialog` when open) — same UX as DCA / Combo.
 *
 * History rows come from `getHedgeDCABacktests` /
 * `getHedgeComboBacktests`. Clicking a row triggers
 * `runner.loadById`, which fetches the full payload from IndexedDB
 * so deals/charts render locally even without re-running.
 */
import {
  buildHedgeBacktestColumns,
  defaultHedgeBacktestColumnVisibility,
} from '@/components/bots/panels/contents/insights/columns/hedge-backtest-columns';
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
  BacktestStatsTab,
} from '@/components/widgets/bots/backtest';
import {
  RedesignOverviewTab,
  RedesignDealsTab,
  buildBacktestViewModel,
} from '@/components/widgets/bots/backtest/redesign';
import { useSetBacktestNote } from '@/hooks/useSetBacktestNote';
import type {
  DCABacktestingResultHistory,
  DCABotSettings,
  HedgeBacktestingResult,
} from '@/types';
import type {
  HedgeBacktestHistoryItem,
  UseHedgeBacktestRunnerApi,
} from '@/hooks/bots/hedge/useHedgeBacktestRunner';
import { Loader2, Trash2 } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';

// ─── Shared helpers ────────────────────────────────────────────────

/** Synthesize a `DCABacktestingResultHistory`-shaped object out of one
 * side of a `HedgeBacktestingResult` so the DCA tabs can render it
 * unchanged. Only fields the DCA tabs actually read are filled in.
 * `settings` is forwarded so BacktestStatsTab can compute the right
 * profit-currency label (futures linear → quote, inverse → base,
 * spot → profitCurrency setting). */
const buildLegHistory = (
  side: HedgeBacktestingResult['longResult'],
  meta: {
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
    exchange: string;
    exchangeUUID?: string;
    settings?: unknown;
  }
): DCABacktestingResultHistory =>
  ({
    ...side,
    _id: `local-leg-${meta.symbol}`,
    symbol: meta.symbol,
    baseAsset: meta.baseAsset,
    quoteAsset: meta.quoteAsset,
    exchange: meta.exchange,
    exchangeUUID: meta.exchangeUUID ?? '',
    time: 0,
    userId: 'local',
    savePermanent: false,
    serverSide: false,
    ...(meta.settings ? { settings: meta.settings } : {}),
  }) as unknown as DCABacktestingResultHistory;

/** Sub-tabs that render a leg (or the combined aggregate) using the
 *  same DCA backtest components the rest of the app uses. Deals is
 *  hidden when the underlying data has no deals array (Combined
 *  aggregate or server-summary-only). */
const LegSubTabs: React.FC<{
  backtest: DCABacktestingResultHistory;
  hideDeals?: boolean;
}> = ({ backtest, hideDeals }) => {
  // Build the view-model once per leg. `meta` is omitted: buildLegHistory
  // sets symbol/exchange/baseAsset/quoteAsset on the synthesized history, and
  // buildBacktestViewModel falls back to those for the header. Leg settings
  // (forwarded onto `backtest.settings` by buildLegHistory) let the safety
  // ladder reconstruct DCA rung prices; numeric fields are coerced via num()
  // so the `as DCABotSettings` cast is type-only and runtime-safe.
  const vm = useMemo(
    () =>
      buildBacktestViewModel(
        backtest,
        (backtest.settings ?? {}) as DCABotSettings
      ),
    [backtest]
  );

  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="stats">Stats</TabsTrigger>
        <TabsTrigger value="analysis">Analysis</TabsTrigger>
        {!hideDeals && <TabsTrigger value="deals">Deals</TabsTrigger>}
      </TabsList>
      <TabsContent value="overview" className="pt-md">
        <RedesignOverviewTab vm={vm} />
      </TabsContent>
      <TabsContent value="stats" className="pt-md">
        <BacktestStatsTab backtest={backtest} />
      </TabsContent>
      <TabsContent value="analysis" className="pt-md">
        <BacktestAnalysisTab backtest={backtest} />
      </TabsContent>
      {!hideDeals && (
        <TabsContent value="deals" className="pt-md">
          <RedesignDealsTab vm={vm} />
        </TabsContent>
      )}
    </Tabs>
  );
};

// ─── Active view (Combined / Long / Short) ──────────────────────────

export interface HedgeBacktestActiveViewProps {
  result: HedgeBacktestingResult | null;
  meta: HedgeBacktestHistoryItem | null;
}

/** The selected backtest's contents. No header / close button — the
 *  surrounding tab chrome (BotPanelInsights) already handles that. */
export const HedgeBacktestActiveView: React.FC<
  HedgeBacktestActiveViewProps
> = ({ result, meta }) => {
  const [side, setSide] = useState<'long' | 'short' | 'combined'>('combined');

  // Prefer the locally-loaded full result; fall back to the server
  // meta which now ships per-leg result fields. Both have the same
  // shape minus the heavy arrays.
  const longSource = result?.longResult ?? meta?.longResult ?? null;
  const shortSource = result?.shortResult ?? meta?.shortResult ?? null;
  const hedgeSource = result?.hedgeResult ?? meta?.hedgeResult ?? null;

  const longHistory = useMemo(
    () =>
      longSource
        ? buildLegHistory(
            // Server summary's `HedgeBacktestResultSideShort` has
            // `deals` optional; the runtime `HedgeBacktestingResult`
            // requires it. The DCA tabs handle missing deals gracefully
            // via optional chaining, so the runtime type is the safe
            // common shape for both paths.
            longSource as HedgeBacktestingResult['longResult'],
            {
              symbol: meta?.long.symbol ?? 'long',
              baseAsset: meta?.long.baseAsset ?? '',
              quoteAsset: meta?.long.quoteAsset ?? '',
              exchange: meta?.long.exchange ?? '',
              exchangeUUID: meta?.long.exchangeUUID,
              settings: (meta?.long as { settings?: unknown })?.settings,
            }
          )
        : null,
    [longSource, meta?.long]
  );
  const shortHistory = useMemo(
    () =>
      shortSource
        ? buildLegHistory(
            shortSource as HedgeBacktestingResult['shortResult'],
            {
              symbol: meta?.short.symbol ?? 'short',
              baseAsset: meta?.short.baseAsset ?? '',
              quoteAsset: meta?.short.quoteAsset ?? '',
              exchange: meta?.short.exchange ?? '',
              exchangeUUID: meta?.short.exchangeUUID,
              settings: (meta?.short as { settings?: unknown })?.settings,
            }
          )
        : null,
    [shortSource, meta?.short]
  );
  const combinedHistory = useMemo(
    () =>
      hedgeSource
        ? buildLegHistory(
            // `hedgeResult` only ships financial/duration/usage/numerical/
            // ratios — enough for Overview/Stats/Analysis (Deals is
            // hidden for Combined). Forward the long leg's settings so
            // the profit-currency label resolves the same way as the
            // per-leg tabs.
            hedgeSource as unknown as HedgeBacktestingResult['longResult'],
            {
              symbol: `${meta?.long.symbol ?? 'long'} + ${meta?.short.symbol ?? 'short'}`,
              baseAsset: meta?.long.baseAsset ?? '',
              quoteAsset: meta?.long.quoteAsset ?? '',
              exchange: meta?.long.exchange ?? '',
              exchangeUUID: meta?.long.exchangeUUID,
              settings: (meta?.long as { settings?: unknown })?.settings,
            }
          )
        : null,
    [hedgeSource, meta?.long, meta?.short]
  );

  // Per-leg Deals only available locally.
  const dealsAvailableLocally = !!result;

  return (
    <div className="flex h-full flex-col">
      {!dealsAvailableLocally && (
        <div className="mb-sm rounded-md border border-amber-300 bg-amber-50 px-md py-sm text-xs text-amber-900">
          Per-deal data isn't on this device — re-run the backtest locally to
          see individual deals. Stats and analysis are shown from the server.
        </div>
      )}
      <Tabs
        value={side}
        onValueChange={(v: string) =>
          setSide(v as 'long' | 'short' | 'combined')
        }
        className="flex-1"
      >
        <TabsList>
          <TabsTrigger value="combined">Combined</TabsTrigger>
          <TabsTrigger value="long">Long leg</TabsTrigger>
          <TabsTrigger value="short">Short leg</TabsTrigger>
        </TabsList>
        <TabsContent value="combined" className="pt-md">
          {combinedHistory ? (
            <LegSubTabs backtest={combinedHistory} hideDeals />
          ) : (
            <p className="text-sm text-muted-foreground">No data.</p>
          )}
        </TabsContent>
        <TabsContent value="long" className="pt-md">
          {longHistory ? (
            <LegSubTabs
              backtest={longHistory}
              hideDeals={!dealsAvailableLocally}
            />
          ) : (
            <p className="text-sm text-muted-foreground">No leg data.</p>
          )}
        </TabsContent>
        <TabsContent value="short" className="pt-md">
          {shortHistory ? (
            <LegSubTabs
              backtest={shortHistory}
              hideDeals={!dealsAvailableLocally}
            />
          ) : (
            <p className="text-sm text-muted-foreground">No leg data.</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

// ─── List view (history table) ──────────────────────────────────────

export interface HedgeBacktestListViewProps {
  runner: UseHedgeBacktestRunnerApi;
  /** Called when the user clicks a row (or picks "Load details"). Layout
   *  loads the full payload + opens the results modal. */
  onSelect: (item: HedgeBacktestHistoryItem) => void;
  /** "Load in settings" row action — reseed both legs' form from a saved
   *  backtest. Omitted where the host can't reseed (defensive). */
  onLoadIntoForm?: (item: HedgeBacktestHistoryItem) => void;
  /** True while `loadById` is in flight after a selection. */
  activating?: boolean;
}

export const HedgeBacktestListView: React.FC<HedgeBacktestListViewProps> = ({
  runner,
  onSelect,
  onLoadIntoForm,
  activating,
}) => {
  const {
    history,
    historyLoading,
    deleteById,
    hedgeBotType,
    patchHistorySavePermanent,
  } = runner;

  // Inline note editing — optimistic local override + persist via the shared
  // setBacktestTextFields mutation (same pattern as BotBacktestPanel). The
  // hedge history list is populated by the runner (not react-query), so the
  // override map is what drives the displayed value.
  const setBacktestNoteMutation = useSetBacktestNote();
  const [backtestNoteOverrides, setBacktestNoteOverrides] = useState<
    Record<string, string>
  >({});

  const handleSaveNote = useCallback(
    (id: string, next: string, prev: string) => {
      setBacktestNoteOverrides((o) => ({ ...o, [id]: next }));
      setBacktestNoteMutation.mutate(
        { id, note: next, type: hedgeBotType },
        {
          onError: () => {
            setBacktestNoteOverrides((o) => ({ ...o, [id]: prev }));
          },
        }
      );
    },
    [setBacktestNoteMutation, hedgeBotType]
  );

  const columns = useMemo(
    () =>
      buildHedgeBacktestColumns({
        hedgeBotType,
        backtestNoteOverrides,
        onSaveNote: handleSaveNote,
        onToggleSavePermanent: patchHistorySavePermanent,
        // No-op-safe fallback when the host doesn't provide a reseed handler.
        onLoadIntoForm: onLoadIntoForm ?? (() => {}),
        onLoadDetails: onSelect,
        onDelete: (ids) => {
          void (async () => {
            for (const id of ids) {
              await deleteById(id);
            }
          })();
        },
      }),
    [
      hedgeBotType,
      backtestNoteOverrides,
      handleSaveNote,
      patchHistorySavePermanent,
      onLoadIntoForm,
      onSelect,
      deleteById,
    ]
  );

  // DataTable bulk actions — Delete only. Share / Export-JSON / Import-as-paper
  // are backend-blocked for hedge (no hedge endpoints), so they're omitted
  // rather than surfaced as no-op stubs.
  const bulkActions = useMemo<BulkAction<HedgeBacktestHistoryItem>[]>(
    () => [
      {
        id: 'delete',
        label: 'Delete',
        icon: Trash2,
        destructive: true,
        onAction: async (selectedRows) => {
          // Sequential to keep UI feedback ordered + avoid blasting
          // the server with parallel deletes when many rows selected.
          for (const row of selectedRows) {
            await deleteById(row._id);
          }
        },
      },
    ],
    [deleteById]
  );

  if (historyLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-xs h-4 w-4 animate-spin" />
        Loading history…
      </div>
    );
  }
  if (activating) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-xs h-4 w-4 animate-spin" />
        Loading backtest…
      </div>
    );
  }
  if (history.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-xs px-md py-lg text-center text-sm text-muted-foreground">
        <span>No hedge backtests yet.</span>
        <span className="text-xs">
          Run one to see results across both legs.
        </span>
      </div>
    );
  }

  return (
    <DataTable
      tableId="hedge-backtests-history"
      columns={columns}
      data={history}
      getRowId={(row) => row._id}
      onRowClick={(row) => onSelect(row)}
      enableGlobalFilter
      enableSorting
      enableColumnVisibility
      showPagination
      initialPageSize={10}
      bulkActions={bulkActions}
      defaultColumnVisibility={defaultHedgeBacktestColumnVisibility}
      defaultPinnedColumns={{ left: [], right: ['actions'] }}
      className="h-full"
      emptyMessage="No hedge backtests yet."
    />
  );
};
