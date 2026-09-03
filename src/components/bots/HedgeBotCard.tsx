/* eslint-disable spacing/no-hardcoded-font-size */
/**
 * Hedge bot card for the hedge bot list pages.
 *
 * Visual structure mirrors `BotCard` (the regular trading-bots card) so
 * the two list pages feel like the same family — same outer wrapper
 * (`motion.div` + cardHoverVariants + inner `--color-inner-container`
 * surface), same header layout (BotTypeChip icon + name + StatusChip dot
 * + open-in-new-tab + dropdown menu), same CoinPair row beneath. The
 * hedge-specific bits sit in the body (long/short leg statuses, total
 * profit) and the dropdown's start/stop calls `changeStatus` with the
 * hedge id + hedge type, with optimistic store update + rollback.
 */
import { motion } from 'framer-motion';
import { ExternalLink, MoreVertical } from 'lucide-react';
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { BotActionsMenuItems } from '@/components/bots/BotActionsMenuItems';
import { BotActionsModals } from '@/components/bots/BotActionsModals';
import { useBotActions } from '@/hooks/useBotActions';
import { useLongPressMenu } from '@/hooks/useLongPressMenu';
import { Button } from '@/components/ui/button';
import {
  BotTypeChip,
  ExchangeChip,
  ProfitAndPerc,
  ProfitLossPercChip,
  StatusChip,
} from '@/components/ui/chip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import CoinPair from '@/components/widgets/shared/CoinPair';
import { useResolvePairAsset } from '@/hooks/useResolvePairAsset';
import { cardHoverVariants } from '@/lib/animations/variants';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  BotTypesEnum,
  StrategyEnum,
  type ComboBot,
  type DCABot,
  type HedgeBot,
} from '@/types';

interface HedgeBotCardProps {
  item: HedgeBot;
  index: number;
  /** Drives the edit-route prefix and the `type` we pass to changeStatus. */
  botType: BotTypesEnum.hedgeDca | BotTypesEnum.hedgeCombo;
  isSelected?: boolean;
  privacyMode?: boolean;
  /** Combined long+short unrealized PnL (USD) — passed in by the list
   *  page so the card displays the same value the table column shows. */
  unPnl?: number;
  /** Combined unrealized PnL percentage relative to total max value. */
  unPnlPerc?: number;
  /** Combined long+short realized profit (USD). The hedge wrapper's own
   *  `profit.totalUsd` is not aggregated by the backend, so the list
   *  page sums it from the legs and feeds it in here. */
  totalProfitUsd?: number;
  /** Combined current cost (USD) across legs. */
  currentCost?: number;
  /** Combined max cost (USD) across legs. */
  maxCost?: number;
  /** Combined daily avg profit (USD) and percentage. */
  avgDaily?: number;
  avgDailyPerc?: number;
  /** Combined annualized return (%). */
  annualizedReturn?: number;
  /** Per-leg utilisation percentage (0–100). */
  legUsage?: { long?: number; short?: number };
  /** Per-leg current cost (USD). */
  legCost?: { long?: number; short?: number };
  /** Per-leg max cost (USD). */
  legMaxCost?: { long?: number; short?: number };
  /** Per-leg unrealized PnL (USD) and percentage. */
  legUnPnl?: { long?: number; short?: number };
  legUnPnlPerc?: { long?: number; short?: number };
}

const findLeg = (
  bots: (DCABot | ComboBot)[] | undefined,
  strategy: StrategyEnum
): DCABot | ComboBot | undefined =>
  bots?.find((b) => b.settings?.strategy === strategy);

const formatDate = (value: string | number | undefined): string => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
};

/**
 * Per-leg summary tile inside the card body.
 *
 * Surface: `bg-card` lifted one step above the outer card's `bg-muted`,
 * no border (design-system rule: inside an inset, the next tile goes
 * one elevation up, not bordered).
 */
const HedgeLegTile: React.FC<{
  leg: DCABot | ComboBot | undefined;
  legLabel: string;
  privacyMode: boolean;
  /** Per-leg utilisation 0–100, sourced from the same usageTotal field
   *  the standalone trading-bots card renders in its dual-arc gauge. */
  usagePercent?: number;
  /** Per-leg cost (USD) and max-cost ceiling — same numbers the
   *  standalone card renders in its "Cost" tile. */
  cost?: number;
  maxCost?: number;
  /** Per-leg unrealized PnL (USD) and percentage against the leg's
   *  own max value. */
  unPnl?: number;
  unPnlPerc?: number;
}> = ({
  leg,
  legLabel,
  privacyMode,
  usagePercent,
  cost,
  maxCost,
  unPnl,
  unPnlPerc,
}) => {
  const dealsActive = leg?.dealsInBot?.active ?? 0;
  const dealsAll = leg?.dealsInBot?.all ?? 0;
  const profitUsd = leg?.profit?.totalUsd ?? 0;
  // Colour the usage value to match the standalone gauge's traffic-light
  // logic: green by default, amber > 80%, red >= 100%. Skip the tint when
  // we have no usage yet to avoid drawing attention to a placeholder zero.
  const usageDisplay =
    typeof usagePercent === 'number' && Number.isFinite(usagePercent)
      ? `${Math.round(usagePercent)}%`
      : '—';
  const usageTone =
    typeof usagePercent !== 'number'
      ? 'text-card-foreground'
      : usagePercent >= 100
        ? 'text-destructive'
        : usagePercent > 80
          ? 'text-warning'
          : 'text-card-foreground';
  return (
    <div className="rounded-md bg-card p-2 shadow-sm">
      <div className="mb-1 flex items-center justify-between gap-1">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {legLabel}
        </span>
        <StatusChip
          status={leg?.status ?? 'closed'}
          size="xs"
          dotOnly
        />
      </div>
      {leg?.exchangeUUID && (
        // `min-w-0` on the wrapper + `max-w-full` on the chip make
        // ExchangeChip's inner `truncate` actually kick in when the
        // user's exchange display name is long. Without this the chip
        // grows past the leg-tile width and overlaps the next column.
        <div className="mb-1 min-w-0">
          <ExchangeChip
            exchangeId={leg.exchangeUUID}
            {...(leg.exchange ? { provider: leg.exchange } : {})}
            size="xs"
            chipStyle="ghost"
            className="max-w-full"
          />
        </div>
      )}
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">Usage</span>
        <span className={`font-medium ${usageTone}`}>{usageDisplay}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">Cost</span>
        <span
          className="font-medium text-card-foreground truncate"
          title={
            privacyMode
              ? '***'
              : `$${(cost ?? 0).toFixed(2)} / $${(maxCost ?? 0).toFixed(2)} max`
          }
        >
          {privacyMode ? '***' : `$${(cost ?? 0).toFixed(2)}`}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">Deals</span>
        <span className="font-medium text-card-foreground">
          {dealsActive} / {dealsAll}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">Profit</span>
        <ProfitAndPerc
          value={profitUsd}
          percentage={0}
          privacyMode={privacyMode}
          hidePercentage
          chipPosition="right"
          size="xs"
        />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">Unrealized</span>
        <ProfitAndPerc
          value={unPnl ?? 0}
          percentage={unPnlPerc ?? 0}
          privacyMode={privacyMode}
          chipPosition="right"
          size="xs"
        />
      </div>
    </div>
  );
};

const HedgeBotCardComponent: React.FC<HedgeBotCardProps> = ({
  item: bot,
  botType,
  isSelected = false,
  privacyMode = false,
  unPnl,
  unPnlPerc,
  totalProfitUsd,
  currentCost,
  maxCost,
  avgDaily,
  avgDailyPerc,
  annualizedReturn,
  legUsage,
  legCost,
  legMaxCost,
  legUnPnl,
  legUnPnlPerc,
}) => {
  const navigate = useNavigate();
  const resolvePairAsset = useResolvePairAsset();

  const basePath =
    botType === BotTypesEnum.hedgeCombo ? '/hedge/combo' : '/hedge/bot';
  const viewPath = `${basePath}/view/${bot._id}`;

  const longLeg = findLeg(bot.bots, StrategyEnum.long);
  const shortLeg = findLeg(bot.bots, StrategyEnum.short);
  const name =
    longLeg?.settings?.name || shortLeg?.settings?.name || 'Hedge bot';

  const symbol = bot.symbol?.[0]?.value;
  const pairLabel =
    symbol?.symbol ?? `${symbol?.baseAsset ?? ''}${symbol?.quoteAsset ?? ''}`;
  // Resolve asset class + venue (from either leg's exchange) so tokenized
  // stocks show their real logo on the hedge card.
  const stockMeta = resolvePairAsset(
    longLeg?.exchange ?? shortLeg?.exchange,
    symbol?.baseAsset,
    symbol?.quoteAsset
  );

  // Sum the per-leg active deals — a hedge stop applies to both legs, so
  // the close-type dialog should open whenever *either* leg has open
  // deals, not just the one rendering the card chip.
  const totalActiveDeals = useMemo(
    () =>
      (longLeg?.dealsInBot?.active ?? 0) + (shortLeg?.dealsInBot?.active ?? 0),
    [longLeg?.dealsInBot?.active, shortLeg?.dealsInBot?.active]
  );
  const totalDeals = useMemo(
    () => (longLeg?.dealsInBot?.all ?? 0) + (shortLeg?.dealsInBot?.all ?? 0),
    [longLeg?.dealsInBot?.all, shortLeg?.dealsInBot?.all]
  );

  // Shared bot-action orchestration. Hedge start/stop now goes through the
  // same useBotStatusToggle as every other bot type (it optimistically
  // updates the hedge stores), retiring this card's bespoke inline toggle.
  // Clone opens the pre-filled create page via the canonical clone route,
  // and Archive is owned by BotActionsMenuItems.
  const botActions = useBotActions({
    botId: bot._id,
    botType,
    botName: name,
    status: bot.status,
    activeDeals: totalActiveDeals,
    currency: symbol?.quoteAsset ?? '',
    lastActivity: bot.created || 'Unknown',
    botData: bot,
    deleteTitle: 'Delete hedge bot',
    deleteDescription:
      'Are you sure you want to delete this hedge bot? Both legs will be removed. This action cannot be undone.',
    // Hedge bots don't support paper↔live copy yet — toast and clone on the
    // current trading context (the canonical clone route handles hedge).
    onCopyToLive: () => {
      toast.info(
        "Live↔paper copy isn't available for hedge bots yet. Cloned on the current trading context instead."
      );
      navigate(`${basePath}/new?load=${bot._id}`);
    },
  });

  // Mobile: a long press anywhere on the card opens the actions menu directly
  // (the floating pill's target is small on touch).
  const {
    open: actionsMenuOpen,
    setOpen: setActionsMenuOpen,
    shouldSuppressClick,
    longPressHandlers,
  } = useLongPressMenu();

  // Click anywhere on the card body → open the drawer (view), matching the
  // regular trading-bots card. The dropdown's "Edit" item opens the full page.
  const handleCardClick = () => {
    if (shouldSuppressClick()) return;
    navigate(viewPath);
  };

  return (
    <motion.div
      // initial={false} skips the entrance animation. Live data updates
      // (status, unPnl, etc.) cause the list to re-render, and any
      // remount that slips through (sort change, list-key churn) would
      // otherwise replay the opacity/scale entrance every tick — visible
      // as flicker on the user's side.
      initial={false}
      animate={{ opacity: 1, scale: 1 }}
      whileHover="hover"
      whileTap="tap"
      variants={cardHoverVariants}
      onClick={handleCardClick}
      {...longPressHandlers}
      className={`group min-h-[120px] cursor-pointer touch-manipulation rounded-lg border-none bg-transparent p-0 shadow-none transition-colors duration-200 ${
        isSelected ? 'ring-2 ring-primary/20' : 'hover:bg-accent/5'
      }`}
      style={{ transformOrigin: 'center', overflow: 'visible' }}
    >
      <div
        data-slot="card"
        className="bg-muted rounded-lg p-sm space-y-sm transition-all duration-200"
      >
        {/* Header — same pattern as BotCard: floating pill actions, 3-row
            content with flex-wrap chip row. */}
        <div className="relative">
          {/* Floating actions pill (WidgetWrapper pattern) */}
          <div
            className={cn(
              'absolute right-2 top-2 flex items-center gap-1 rounded-md border border-border/60 bg-muted/95 px-1 py-0.5 shadow-sm backdrop-blur-sm transition-all duration-200 ease-out z-10',
              'opacity-100 translate-x-0 pointer-events-auto',
              'sm:pointer-events-none sm:opacity-0 sm:translate-x-3 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100 sm:group-hover:translate-x-0 sm:group-focus-within:pointer-events-auto sm:group-focus-within:opacity-100 sm:group-focus-within:translate-x-0',
              // An open menu pins the pill in place in every breakpoint.
              actionsMenuOpen &&
                'sm:pointer-events-auto sm:opacity-100 sm:translate-x-0'
            )}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.open(viewPath, '_blank');
              }}
              aria-label="Open in new tab"
              className="shrink-0 rounded p-1 hover:bg-muted/60"
              title="Open in new tab"
            >
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </button>
            <DropdownMenu
              open={actionsMenuOpen}
              onOpenChange={setActionsMenuOpen}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <BotActionsMenuItems
                align="end"
                className="w-56"
                bot={{
                  id: bot._id,
                  name,
                  type: botType,
                  status: bot.status,
                }}
                {...botActions.menuProps}
              />
            </DropdownMenu>
          </div>

          {/* Content rows */}
          <div className="space-y-2 min-w-0">
            {/* Row 1: status dot + name (full width; pill covers right edge on hover) */}
            <div className="flex items-center gap-2 min-w-0">
              <StatusChip
                status={bot.status}
                size="xs"
                dotOnly
                className="shrink-0"
              />
              <h3
                className="text-xl font-bold text-card-foreground truncate flex-1 min-w-0"
                title={name}
              >
                {name}
              </h3>
            </div>

            {/* Chip row — bot type + pair, flex-wrap */}
            <div className="flex items-center gap-2 flex-wrap">
              <BotTypeChip
                botType={botType}
                size="xs"
                chipStyle="soft"
                className="shrink-0"
              />
              {symbol ? (
                <CoinPair
                  baseAsset={symbol.baseAsset}
                  quoteAsset={symbol.quoteAsset}
                  symbols={pairLabel ? [pairLabel] : []}
                  assetClass={stockMeta.assetClass}
                  exchange={stockMeta.exchange}
                  baseName={stockMeta.displayName}
                  maxDisplay={1}
                  iconSize="sm"
                  showText
                  layout="horizontal"
                  className="text-sm font-medium text-muted-foreground"
                />
              ) : (
                <span className="text-sm font-medium text-muted-foreground">
                  —
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Body — outer card padding handles outer spacing */}
        <div>
          {/* Realized + unrealized PnL side-by-side. Realized comes from
              the hedge wrapper's profit; unrealized is the long+short sum
              computed via transformDcaBotToBot in the parent list. */}
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <div className="mb-1 text-xs text-muted-foreground">
                Realized PnL
              </div>
              <ProfitAndPerc
                value={totalProfitUsd ?? bot.profit?.totalUsd ?? 0}
                percentage={0}
                privacyMode={privacyMode}
                hidePercentage
                chipPosition="bottom"
                size="md"
              />
            </div>
            <div className="min-w-0">
              <div className="mb-1 text-xs text-muted-foreground">
                Unrealized PnL
              </div>
              <ProfitAndPerc
                value={unPnl ?? 0}
                percentage={unPnlPerc ?? 0}
                privacyMode={privacyMode}
                chipPosition="bottom"
                size="md"
              />
            </div>
          </div>

          {/* Hedge-level summary — mirrors the regular bot card's
              "Cost / Deals / Avg Daily / Annualized" 2×2 grid so the two
              cards carry the same fields at the same density. All four
              values are combined across the long + short legs (the
              backend never aggregates them on the wrapper). */}
          <div className="mb-3 grid grid-cols-2 gap-3 text-sm">
            <div className="min-w-0">
              <div className="text-muted-foreground mb-1 text-xs">Cost</div>
              <div
                className="text-card-foreground font-semibold text-sm truncate"
                title={
                  privacyMode
                    ? '***'
                    : `$${(currentCost ?? 0).toFixed(2)}`
                }
              >
                {privacyMode ? '***' : `$${(currentCost ?? 0).toFixed(2)}`}
              </div>
              <div className="text-muted-foreground text-xs truncate">
                {privacyMode
                  ? '***'
                  : `Max: $${(maxCost ?? 0).toFixed(2)}`}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-muted-foreground mb-1 text-xs">Deals</div>
              <div className="text-card-foreground font-semibold text-sm truncate">
                {totalActiveDeals} / {totalDeals}
              </div>
              <div className="text-muted-foreground text-xs">Open / Total</div>
            </div>
            <div className="min-w-0">
              <div className="text-muted-foreground mb-1 text-xs">Avg Daily</div>
              <ProfitAndPerc
                value={avgDaily ?? 0}
                percentage={avgDailyPerc ?? 0}
                privacyMode={privacyMode}
                chipPosition="bottom"
                size="xs"
              />
            </div>
            <div className="min-w-0">
              <div className="text-muted-foreground mb-1 text-xs">
                Annualized
              </div>
              <ProfitLossPercChip value={annualizedReturn ?? 0} size="xs" />
              <div className="text-muted-foreground text-xs mt-0.5">
                Annual Return
              </div>
            </div>
          </div>

          <div className="mb-3 text-xs text-muted-foreground">
            Created {formatDate(bot.created)}
          </div>

          {/* Long / Short legs — status + per-leg exchange + per-leg deals
              + per-leg profit. Each hedge leg can sit on its own exchange
              (the wrapper allows cross-exchange hedging) and can carry an
              independent deal count, so surfacing both helps users tell
              at a glance how each side is performing without opening the
              drawer.

              Surface: outer card uses `bg-muted` (an inset within the
              page surface) — per the design system, nested tiles inside
              an inset go one elevation UP to `bg-card`, no border. */}
          <div className="grid grid-cols-2 gap-2">
            <HedgeLegTile
              leg={longLeg}
              legLabel="Long leg"
              privacyMode={privacyMode}
              usagePercent={legUsage?.long}
              cost={legCost?.long}
              maxCost={legMaxCost?.long}
              unPnl={legUnPnl?.long}
              unPnlPerc={legUnPnlPerc?.long}
            />
            <HedgeLegTile
              leg={shortLeg}
              legLabel="Short leg"
              privacyMode={privacyMode}
              usagePercent={legUsage?.short}
              cost={legCost?.short}
              maxCost={legMaxCost?.short}
              unPnl={legUnPnl?.short}
              unPnlPerc={legUnPnlPerc?.short}
            />
          </div>
        </div>
      </div>

      {/* Shared status / delete / success modals, driven by useBotActions.
          The stop dialog still opens before stopping a bot with active deals
          so the user picks a close-type. */}
      <BotActionsModals {...botActions.modalProps} />
    </motion.div>
  );
};

// Memoize so the live store updates that the parent list listens to don't
// cascade re-renders into every card unnecessarily. Compares the bits the
// card actually shows: identity, status, leg statuses, profits, unPnl,
// pair / name, type. Anything else (arrays of unrelated balances, etc.)
// can change without forcing a re-render.
export const HedgeBotCard = React.memo(HedgeBotCardComponent, (prev, next) => {
  if (prev.botType !== next.botType) return false;
  if (prev.unPnl !== next.unPnl) return false;
  if (prev.unPnlPerc !== next.unPnlPerc) return false;
  if (prev.totalProfitUsd !== next.totalProfitUsd) return false;
  if (prev.currentCost !== next.currentCost) return false;
  if (prev.maxCost !== next.maxCost) return false;
  if (prev.avgDaily !== next.avgDaily) return false;
  if (prev.avgDailyPerc !== next.avgDailyPerc) return false;
  if (prev.annualizedReturn !== next.annualizedReturn) return false;
  if (prev.legUsage?.long !== next.legUsage?.long) return false;
  if (prev.legUsage?.short !== next.legUsage?.short) return false;
  if (prev.legCost?.long !== next.legCost?.long) return false;
  if (prev.legCost?.short !== next.legCost?.short) return false;
  if (prev.legMaxCost?.long !== next.legMaxCost?.long) return false;
  if (prev.legMaxCost?.short !== next.legMaxCost?.short) return false;
  if (prev.legUnPnl?.long !== next.legUnPnl?.long) return false;
  if (prev.legUnPnl?.short !== next.legUnPnl?.short) return false;
  if (prev.legUnPnlPerc?.long !== next.legUnPnlPerc?.long) return false;
  if (prev.legUnPnlPerc?.short !== next.legUnPnlPerc?.short) return false;
  if (prev.privacyMode !== next.privacyMode) return false;
  if (prev.isSelected !== next.isSelected) return false;
  const a = prev.item;
  const b = next.item;
  if (a === b) return true;
  if (a._id !== b._id) return false;
  if (a.status !== b.status) return false;
  if (a.profit?.totalUsd !== b.profit?.totalUsd) return false;
  if (a.bots?.length !== b.bots?.length) return false;
  for (let i = 0; i < (a.bots?.length ?? 0); i += 1) {
    const al = a.bots[i];
    const bl = b.bots[i];
    if (al?._id !== bl?._id) return false;
    if (al?.status !== bl?.status) return false;
    if (al?.dealsInBot?.active !== bl?.dealsInBot?.active) return false;
    if (al?.settings?.name !== bl?.settings?.name) return false;
    if (al?.exchange !== bl?.exchange) return false;
    if (al?.exchangeUUID !== bl?.exchangeUUID) return false;
  }
  return true;
});

export default HedgeBotCard;
