import type { ColumnDef } from '@tanstack/react-table';
import type { ReactNode } from 'react';

import type { BotType } from '@/components/bots/panels/BotPanelLayout'; // 'dca'|'combo'|'grid'|'hedge-dca'|…
import {
  type BotTypesEnum,
  type DCABacktestingResultHistory,
  type DCABotSettings,
  type ExchangeEnum,
} from '@/types';

/**
 * Standalone page-descriptor module set for the unified bot page.
 *
 * Consumed ONLY by BotWorkbench + BotBacktestPanel (both under
 * components/bots/). This is intentionally SEPARATE from
 * features/bots/registry (the widget-layout / form contract); the two model
 * different concerns and a later phase may reconcile them.
 */

/**
 * Minimal row shape the SHARED panel touches directly (id, share id,
 * asset/settings hints for the modal, deals for the hydrate effect). DCA/combo
 * satisfy it via DCABacktestingResultHistory; grid via
 * GRIDBacktestingResultHistory.
 *
 * NOTE (deviation from the phase spec, required for the constraint to hold):
 *  - `exchange` is a required `ExchangeEnum` (not `string | number | null`):
 *    both DCA and GRID history carry a required `exchange: ExchangeEnum`, and
 *    the shared panel feeds it to `removePaperPrefix(exchange: ExchangeEnum)`
 *    (non-nullable) and the modal meta (`exchange?: string`, which a string
 *    enum satisfies). `shareId` is `string | undefined` (no `null`) to match
 *    both histories and the ShareBacktestButton `existingShareId` prop.
 *  - `settings` drops the `& Record<string, unknown>` intersection — an
 *    interface (DCABotSettings / grid Settings) is NOT assignable to
 *    `Record<string, unknown>` in TS, which would break
 *    `DCABacktestingResultHistory extends BacktestRowBase`. The shared panel
 *    only reads `settings?.name`; per-type column modules read the concrete
 *    settings via their own TResult.
 */
export interface BacktestRowBase {
  _id: string;
  shareId?: string;
  userId?: string;
  exchange: ExchangeEnum;
  symbol?: string;
  baseAsset?: string;
  quoteAsset?: string;
  settings?: { name?: string };
  deals?: unknown[];
  periodicStats?: unknown[];
  duration?: { firstDataTime?: number | string; lastDataTime?: number | string };
}

/**
 * Callbacks + state the per-type COLUMN factory closes over. All owned by
 * BotBacktestPanel; each type's builder uses only what it needs (grid uses
 * just onDelete + note; dca/combo use all).
 *
 * NOTE (deviation): `user` id/importAsPaper allow `null` so the real
 * `User` type (`id: string | null`, `importAsPaper?: boolean | null`) is
 * assignable. The columns only truthy-check `user?.importAsPaper`.
 */
export interface BacktestColumnContext<TResult extends BacktestRowBase> {
  user: { id?: string | null; importAsPaper?: boolean | null } | null;
  backtestNoteOverrides: Record<string, string>;
  onSaveNote: (id: string, next: string, prev: string) => void;
  onShare: (bt: TResult) => void;
  onLoadIntoForm: (bt: TResult) => void; // "Load in settings"
  onLoadDetails: (bt: TResult) => void; // "Load details"
  onDelete: (ids: string[]) => void;
  onImportAsPaper: (bt: TResult) => void;
}

/**
 * The backtest composition slice — everything BotBacktestPanel needs to stop
 * being DCA-hardcoded.
 */
export interface BotBacktestDescriptor<TResult extends BacktestRowBase> {
  /** backtestType for share/import/delete mutations. */
  kind: 'dca' | 'grid' | 'combo';
  /** useSetBacktestNote({ type }). */
  noteType: BotTypesEnum;
  /** BacktestResultsFullModal strategy prop (resultKind() regex). */
  resultStrategy: 'DCA' | 'Grid' | 'Combo';
  /** useDca/Grid/ComboBacktests. */
  useList: () => { backtests: TResult[]; isLoading: boolean; error: unknown };
  /**
   * dca/combo pull subtitle from useBacktests()+useBacktestsSummary(); grid
   * does not.
   */
  useLinkedSummary: boolean;
  /**
   * Per-mode linked-summary loading subtitle. dca forwards on edit only;
   * combo forwards on both. The workbench extracts summaryMessages[mode].
   */
  summaryMessages?: {
    create?: { loadingSubtitle?: string };
    edit?: { loadingSubtitle?: string };
  };
  /**
   * Per-type column module, referenced not inlined. `mode` lets combo diverge
   * (14 columns on create vs the full DCA-style set on edit); dca/grid ignore it.
   */
  buildColumns: (
    ctx: BacktestColumnContext<TResult>,
    mode: 'create' | 'edit'
  ) => ColumnDef<TResult>[];
  /** grid ships a big map; dca omits. */
  defaultColumnVisibility?: Record<string, boolean>;
  /** dca/grid 'backtests'; combo 'history'. */
  tabKey: string;
  /** 'Backtests' | 'History'. */
  tabTitle: string;
  tableId: { create: string; edit: string };
  /** defaults to tableId per mode when absent. */
  pinnedInitTableId?: { create?: string; edit?: string };
  /** '/bot/backtests'. */
  sharePath: string;
  shareSubKind: 'dca' | 'grid' | 'combo';
  /** botQueries.get(Dca|Grid|Combo)BacktestByShareId. */
  getByShareId: (vars: { shareId: string }) => {
    query: string;
    variables: Record<string, unknown>;
  };
  /** dca/combo cast settings; grid omits. */
  getModalSettings?: (bt: TResult) => DCABotSettings | undefined;
  /**
   * Optional per-type override for the inline `?backtestShare=` viewer. Grid
   * supplies its Overview/Transactions/Equity/Stats block; dca/combo omit it
   * and fall back to the shared DCA Overview/Stats/Deals/Analysis tabs.
   */
  renderShareContent?: (bt: TResult) => ReactNode;
}

/**
 * The whole page contract. Generic over the backtest result type; defaults to
 * DCA so the dca entry needs no explicit type arg.
 */
export interface BotPageDescriptor<
  TResult extends BacktestRowBase = DCABacktestingResultHistory,
> {
  /** BotFormPanel botType + mapper dispatch. */
  botType: BotTypesEnum;
  /** BotPanelLayout botType string + layout-key/storage prefix. */
  layoutType: BotType;
  /** useBotPageRedirect('/bot') + BotNotFoundNotice backTo. */
  basePath: string;
  /** BotNotFoundNotice backLabel ('bots'). */
  listLabel: string;
  /** render chart panel + TradingView picker? */
  hasChart: boolean;
  /** MainLayout pageTitle. */
  titles: { create: string; edit: string; share: string };
  /** MainLayout activePage. */
  activePage: { create: string; edit: string; share: string };
  /** BotChartPanel widgetId (DCA unprefixed: bot-chart/edit-bot-chart). */
  chartWidgetId: { create: string; edit: string };
  /** BotFormPanel widgetId (DCA: create-bot/edit-bot). */
  formWidgetId: { create: string; edit: string };
  /** useBotPageLoading window (create 1200 / edit 1000). */
  loadingDelayMs: { create: number; edit: number };
  backtests: BotBacktestDescriptor<TResult>;
  /**
   * Whether the EDIT loading skeleton includes a disabled "Stats" tab
   * (dca/combo do; grid does not). Defaults to true when absent.
   */
  loadingHasStatsTab?: boolean;
}

// Layout key derivation (done in BotWorkbench, NOT stored on the descriptor):
//   create layout key   = `${layoutType}-new`                          -> 'dca-new'
//   edit   layout key   = `${layoutType}-${botId || 'edit'}`           -> 'dca-<id>' / 'dca-edit'
//   create form key     = `${layoutType}-create-form-${formReloadKey}` -> 'dca-create-form-0'
