/**
 * BacktestResultsFullModal.tsx — full-screen backtest results modal,
 * bot-type-aware (DCA, Combo, Grid).
 *
 * Recreates the chrome of the prototype `modalShell.jsx` (header with close
 * X, "Backtest results" title, pair + strategy/direction chips, an
 * exchange · interval · date-range subline, a Share affordance, and a
 * segmented tab bar) using the REAL design tokens and the core `Dialog`
 * primitive — no prototype CSS vars, no inline-style soup.
 *
 * The caller passes the RAW result + the bot's `strategy` string; the modal
 * normalizes that into a `kind` and renders the right view:
 *
 *  - **grid** (`GRIDBacktestingResultHistory`): Overview / Transactions /
 *    Equity / Stats, rendered by the existing `Grid*` tabs. No view-model.
 *  - **dca / combo** (`DCABacktestingResult[History]`): a `BacktestViewModel`
 *    is built via `buildBacktestViewModel`, and Overview / Stats / Deals /
 *    Analysis are rendered. The Deals tab gets `variant` so combo deals draw
 *    a decluttered per-deal chart (minigrid orders hidden).
 *
 * Stats/Analysis take a single `{ backtest: DCABacktestingResultHistory }`
 * prop, satisfied by `vm.raw` (the adapter always synthesizes a History
 * wrapper — see viewModel.ts::toHistory).
 */

import { useCallback, useMemo, useState } from 'react';
import { BookmarkPlus, Download, MoreVertical, Share2, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useShareBacktest } from '@/hooks/useBacktestDataManagement';
import { buildBacktestShareUrl } from '@/lib/shareLinks';
import { toast } from '@/lib/toast';
import { logger } from '@/lib/loggerInstance';
import { useAuthStore } from '@/stores/authStore';
import { mapBotSettingsToFormData } from '@/mappers/bots/dca/map-bot-settings-to-form-data';
import BotFormSaveTemplateDialog from '@/features/bots/widgets/BotForm/components/BotFormSaveTemplateDialog';
import {
  BotTypesEnum,
  type DCABacktestingResult,
  type DCABacktestingResultHistory,
  type DCABotSettings,
  type GRIDBacktestingResultHistory,
  type HedgeBacktestingResult,
} from '@/types';

import {
  BacktestAnalysisTab,
  BacktestStatsTab,
  GridBacktestEquityCurveTab,
  GridBacktestOverviewTab,
  GridBacktestStatsTab,
  GridBacktestTransactionsTab,
} from '@/components/widgets/bots/backtest';
import { HedgeBacktestActiveView } from '@/components/widgets/bots/backtest/HedgeBacktestTab';
import type { HedgeBacktestHistoryItem } from '@/hooks/bots/hedge/useHedgeBacktestRunner';

import { RedesignOverviewTab } from './tabs/RedesignOverviewTab';
import { RedesignDealsTab } from './tabs/RedesignDealsTab';
import {
  buildBacktestViewModel,
  type BacktestViewModel,
  type BacktestViewModelMeta,
} from './viewModel';

const DCA_TABS = ['Overview', 'Stats', 'Deals', 'Analysis'] as const;
const GRID_TABS = ['Overview', 'Transactions', 'Equity', 'Stats'] as const;
type TabKey = (typeof DCA_TABS)[number] | (typeof GRID_TABS)[number];

type ResultKind = 'dca' | 'combo' | 'grid' | 'hedge';

/**
 * Any result the modal can be opened with. The concrete engine result types
 * (DCA / Grid history) plus the saved list-row shapes, which are structural
 * supersets of the engine fields the view-model / grid tabs read. Narrowed
 * internally per `strategy`.
 */
type AnyBacktestResult =
  | DCABacktestingResult
  | DCABacktestingResultHistory
  | GRIDBacktestingResultHistory
  | object;

export interface BacktestResultsFullModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Raw backtest result. Shape depends on `strategy`. Nullable only for the
   * hedge kind, where the row may be a server-summary that isn't fully loaded
   * on this device (the hedge body reads `hedgeMeta` in that case). DCA / Grid
   * / Combo callers always pass a concrete object.
   */
  result?: AnyBacktestResult | null;
  /** Bot type signal (`settings.strategy`). Case-insensitive. Default 'DCA'. */
  strategy?: string;
  /** DCA/combo bot settings — used to build the view model. */
  settings?: DCABotSettings;
  /** Identity hints (symbol/exchange/base/quote) when the result lacks them. */
  meta?: BacktestViewModelMeta;
  /**
   * Hedge-only: the history-row / `lastRunMeta` shape. Required in practice for
   * the hedge kind — `HedgeBacktestActiveView` reads per-leg identity + falls
   * back to `meta.longResult/shortResult/hedgeResult` when `result` is null.
   */
  hedgeMeta?: HedgeBacktestHistoryItem | null;
  /** Hedge-only: drives the header strategy label ("Hedge DCA"/"Hedge Combo"). */
  hedgeBotType?: BotTypesEnum.hedgeDca | BotTypesEnum.hedgeCombo;
  /** Optional bot name, shown after the pair chip when provided. */
  botName?: string;
}

/** Normalize the strategy string into a render kind. */
function resultKind(strategy: string | undefined): ResultKind {
  const s = strategy ?? '';
  // Hedge MUST be tested first: `BotTypesEnum.hedgeCombo === 'hedgeCombo'`
  // contains 'combo', so the `/combo/i` test below would misclassify a
  // hedge-combo result as 'combo'. Same trap for 'hedgeDca' vs 'dca'.
  if (/hedge/i.test(s)) return 'hedge';
  if (/grid/i.test(s)) return 'grid';
  if (/combo/i.test(s)) return 'combo';
  return 'dca';
}

/** "Jun 5, 2026" — matches the prototype's GX.fmtDate. */
function fmtDate(t: number): string {
  if (!Number.isFinite(t) || t <= 0) return '—';
  return new Date(t).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Unified header identity, derived per-kind. */
interface HeaderModel {
  pair: string;
  exchange: string;
  interval: string;
  from: number;
  to: number;
  strategyLabel: string;
  /** dca/combo only — "Long" | "Short". Grid has no deal direction. */
  direction: string | null;
}

function headerFromVm(vm: BacktestViewModel, kind: ResultKind): HeaderModel {
  return {
    pair: vm.pair,
    exchange: vm.exchange,
    interval: String(vm.interval ?? ''),
    from: vm.from,
    to: vm.to,
    strategyLabel: kind === 'combo' ? 'Combo' : 'DCA',
    direction: vm.direction,
  };
}

function headerFromGrid(result: GRIDBacktestingResultHistory): HeaderModel {
  const base = result.baseAsset ?? '';
  const quote = result.quoteAsset ?? '';
  const pair = result.symbol || (base && quote ? `${base}/${quote}` : '');
  return {
    pair,
    exchange: result.exchange ? String(result.exchange) : '',
    interval: result.interval ? String(result.interval) : '',
    from: Number(result.duration?.firstDataTime) || 0,
    to: Number(result.duration?.lastDataTime) || 0,
    strategyLabel: 'Grid',
    direction: null,
  };
}

/**
 * Hedge identity from the history-row meta. Both legs' symbols are joined
 * with " + " (matching the combined label `HedgeBacktestActiveView`
 * synthesizes). Interval is not persisted anywhere reachable from `meta`
 * (the stored `config` is `BacktestingSettings` with no interval field, and
 * the leg results don't carry one), so it's left empty — the subline's
 * `.filter(Boolean)` drops it cleanly. Do not fabricate one.
 */
function headerFromHedge(
  meta: HedgeBacktestHistoryItem | null | undefined,
  hedgeBotType: BotTypesEnum.hedgeDca | BotTypesEnum.hedgeCombo | undefined,
): HeaderModel {
  const long = meta?.long;
  const short = meta?.short;
  const longExchange = long?.exchange ? String(long.exchange) : '';
  const shortExchange = short?.exchange ? String(short.exchange) : '';
  return {
    pair: [long?.symbol, short?.symbol].filter(Boolean).join(' + '),
    exchange:
      longExchange && longExchange === shortExchange
        ? longExchange
        : [longExchange, shortExchange].filter(Boolean).join(' · '),
    interval: '',
    from: Number(long?.duration?.firstDataTime) || 0,
    to: Number(long?.duration?.lastDataTime) || 0,
    strategyLabel:
      hedgeBotType === BotTypesEnum.hedgeCombo ? 'Hedge Combo' : 'Hedge DCA',
    direction: null,
  };
}

/**
 * Segmented tab bar — the prototype's `.g-tab` group: a `bg-muted`
 * container with the active item lifted to `bg-popover` (surface-2). No
 * borders, no underline (DESIGN_SYSTEM §3).
 */
function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly TabKey[];
  active: TabKey;
  onChange: (t: TabKey) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Backtest result sections"
      className="flex items-center gap-1 rounded-lg bg-muted p-1"
    >
      {tabs.map((t) => {
        const isActive = t === active;
        return (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              'cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
              isActive
                ? 'bg-popover text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

export function BacktestResultsFullModal({
  open,
  onOpenChange,
  result,
  strategy,
  settings,
  meta,
  hedgeMeta,
  hedgeBotType,
  botName,
}: BacktestResultsFullModalProps) {
  const kind = useMemo(() => resultKind(strategy), [strategy]);

  // DCA / combo build a view model; grid + hedge render their own views.
  const vm = useMemo<BacktestViewModel | null>(() => {
    if (kind === 'grid' || kind === 'hedge') return null;
    return buildBacktestViewModel(
      result as unknown as DCABacktestingResult | DCABacktestingResultHistory,
      settings ?? ({} as DCABotSettings),
      meta,
    );
  }, [kind, result, settings, meta]);

  const gridResult =
    kind === 'grid'
      ? (result as unknown as GRIDBacktestingResultHistory)
      : null;

  const tabs: readonly TabKey[] = kind === 'grid' ? GRID_TABS : DCA_TABS;

  // Default active tab: "Deals" for dca/combo (per prototype), "Overview" for
  // grid (no Deals tab exists).
  const [active, setActive] = useState<TabKey>(
    kind === 'grid' ? 'Overview' : 'Deals',
  );

  // Keep the active tab valid if `kind` flips while the modal stays mounted.
  const activeTab: TabKey = (tabs as readonly string[]).includes(active)
    ? active
    : tabs[0];

  const header: HeaderModel | null = vm
    ? headerFromVm(vm, kind)
    : gridResult
      ? headerFromGrid(gridResult)
      : kind === 'hedge'
        ? headerFromHedge(hedgeMeta, hedgeBotType)
        : null;

  // Analysis tab gating (dca/combo) — enable when there are deals or periodic
  // stats; the tab also self-handles the empty case.
  const analysisEnabled =
    !!vm &&
    ((vm.raw.deals?.length ?? 0) > 0 ||
      (vm.raw.periodicStats?.length ?? 0) > 0);

  // ── header overflow actions: Save as template + Share ─────────────────
  const user = useAuthStore((s) => s.user);
  const shareMutation = useShareBacktest();
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);

  // Share target — id/owner come from the raw result (dca/combo via vm.raw,
  // grid via gridResult). Only the owner of a persisted backtest can share.
  const shareInfo = useMemo(() => {
    const raw = (vm?.raw ?? gridResult ?? null) as {
      _id?: string;
      userId?: string;
      shareId?: string | null;
    } | null;
    const id = raw?._id ?? '';
    return {
      id,
      existingShareId: raw?.shareId ?? undefined,
      sharePath:
        kind === 'combo'
          ? '/combo/backtests'
          : kind === 'grid'
            ? '/grid/backtests'
            : '/bot/backtests',
      canShare: !!id && !!user?.id && raw?.userId === user.id,
    };
  }, [vm, gridResult, kind, user?.id]);

  const handleShare = useCallback(async () => {
    if (!shareInfo.id) return;
    // Hedge has no shareable backtest type (the Share item is disabled for
    // it); this guard also narrows `kind` away from 'hedge' for the
    // `backtestType`/`subKind` unions below.
    if (kind === 'hedge') return;
    try {
      const res = await shareMutation.mutateAsync({
        id: shareInfo.id,
        shareId: shareInfo.existingShareId,
        backtestType: kind,
      });
      const url = buildBacktestShareUrl({
        path: shareInfo.sharePath,
        shareId: res.shareId,
        subKind: kind,
      });
      try {
        await navigator.clipboard.writeText(url);
        toast.success('Link copied');
      } catch {
        toast.info(url);
      }
    } catch (error) {
      logger.error('[BacktestResultsFullModal] Share failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error(
        error instanceof Error ? error.message : 'Failed to share backtest',
      );
    }
  }, [shareInfo, shareMutation, kind]);

  // Export the raw result as a downloadable JSON file (works for both
  // persisted and fresh in-memory results).
  const handleExportJson = useCallback(() => {
    try {
      const json = JSON.stringify(result, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const name = (header?.pair || 'backtest').replace(/[^\w.-]+/g, '_');
      a.download = `backtest-${name}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Exported JSON');
    } catch (error) {
      logger.error('[BacktestResultsFullModal] Export JSON failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error('Failed to export JSON');
    }
  }, [result, header?.pair]);

  // "Save as template" maps the run's settings → bot form data. Grid uses a
  // different settings shape, so template-save is dca/combo only.
  const templateBotType =
    kind === 'combo' ? BotTypesEnum.combo : BotTypesEnum.dca;
  const templateFormData = useMemo(() => {
    if (kind === 'grid') return null;
    const s = settings ?? vm?.raw.settings;
    if (!s) return null;
    try {
      return mapBotSettingsToFormData(templateBotType, s).formData;
    } catch (error) {
      logger.debug('[BacktestResultsFullModal] template map failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }, [kind, settings, vm, templateBotType]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        backdropClassName="p-0 sm:p-3 md:p-4"
        className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col overflow-hidden rounded-none p-0 bg-card sm:h-[92vh] sm:max-h-[92vh] sm:w-[96vw] sm:max-w-[1400px] sm:rounded-lg"
      >
        {/* ── header (peer-surface separator → the one allowed hairline) ── */}
        <div className="flex flex-shrink-0 flex-wrap items-start gap-sm border-b border-border/60 px-sm py-sm sm:items-center sm:gap-md sm:px-md">
          {/* close — top-right on mobile, far-right of the row on desktop */}
          <button
            type="button"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
            className="order-2 ml-auto grid h-8 w-8 flex-shrink-0 cursor-pointer place-items-center rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground sm:order-3 sm:ml-0"
          >
            <X className="h-4 w-4" />
          </button>

          {/* title + identity */}
          <div className="order-1 flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="text-base font-extrabold tracking-tight text-foreground">
                Backtest results
              </span>
              {header?.pair && (
                <Badge variant="secondary" className="font-medium">
                  {header.pair}
                </Badge>
              )}
              {header && (
                <Badge variant="default" className="font-medium">
                  {header.direction
                    ? `${header.direction} · ${header.strategyLabel}`
                    : header.strategyLabel}
                </Badge>
              )}
              {botName && (
                <span className="truncate text-xs text-muted-foreground">
                  {botName}
                </span>
              )}
            </div>
            {header && (
              <div className="truncate text-xs text-muted-foreground/80">
                {[header.exchange, header.interval].filter(Boolean).join(' · ')}
                {(header.exchange || header.interval) && ' · '}
                {fmtDate(header.from)} → {fmtDate(header.to)}
              </div>
            )}
          </div>

          {/* right rail: tabs + share (full-width below the title on mobile) */}
          <div className="order-3 ml-auto flex w-full flex-shrink-0 items-center gap-md sm:order-2 sm:w-auto">
            {/* Hedge owns its own two-level Combined/Long/Short + sub-tab UI
                inside the body, so the modal's single-row TabBar is hidden. */}
            {kind !== 'hedge' && (
              <div className="min-w-0 flex-1 overflow-x-auto sm:flex-none">
                <TabBar tabs={tabs} active={activeTab} onChange={setActive} />
              </div>
            )}
            {/* overflow menu — Save as template + Share (replaces the
                standalone Share button) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="More actions"
                  className="grid h-8 w-8 flex-shrink-0 cursor-pointer place-items-center rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={!templateFormData}
                  onSelect={() => setSaveTemplateOpen(true)}
                >
                  <BookmarkPlus className="mr-2 h-3.5 w-3.5" />
                  Save as template
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={kind === 'hedge' && !result}
                  onSelect={() => handleExportJson()}
                >
                  <Download className="mr-2 h-3.5 w-3.5" />
                  Export as JSON
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!shareInfo.canShare || shareMutation.isPending}
                  onSelect={(e) => {
                    e.preventDefault();
                    void handleShare();
                  }}
                >
                  <Share2 className="mr-2 h-3.5 w-3.5" />
                  Share
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* ── body ── */}
        <div className="min-h-0 flex-1 overflow-auto p-sm sm:p-md">
          {/* hedge — renders its own Combined/Long/Short shell + sub-tabs,
              including the "deals not on this device" amber warning (driven
              by the same nullable `result`). */}
          {kind === 'hedge' && (
            <HedgeBacktestActiveView
              result={(result as HedgeBacktestingResult | null) ?? null}
              meta={hedgeMeta ?? null}
            />
          )}

          {/* grid */}
          {gridResult && activeTab === 'Overview' && (
            <GridBacktestOverviewTab backtest={gridResult} />
          )}
          {gridResult && activeTab === 'Transactions' && (
            <GridBacktestTransactionsTab backtest={gridResult} />
          )}
          {gridResult && activeTab === 'Equity' && (
            <GridBacktestEquityCurveTab backtest={gridResult} />
          )}
          {gridResult && activeTab === 'Stats' && (
            <GridBacktestStatsTab backtest={gridResult} />
          )}

          {/* dca / combo */}
          {vm && activeTab === 'Overview' && <RedesignOverviewTab vm={vm} />}
          {vm && activeTab === 'Deals' && (
            <RedesignDealsTab vm={vm} />
          )}
          {vm && activeTab === 'Stats' && <BacktestStatsTab backtest={vm.raw} />}
          {vm &&
            activeTab === 'Analysis' &&
            (analysisEnabled ? (
              <BacktestAnalysisTab backtest={vm.raw} />
            ) : (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">
                No analysis data for this backtest.
              </div>
            ))}
        </div>

        {templateFormData && (
          <BotFormSaveTemplateDialog
            open={saveTemplateOpen}
            onOpenChange={setSaveTemplateOpen}
            botType={templateBotType}
            currentFormData={templateFormData}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export default BacktestResultsFullModal;
