/**
 * Combined hedge bot Overview — shows the hedge as ONE position (a combined
 * stats block) and then each leg's full performance widgets stacked below, so
 * the user sees long + short + combined in one place without a leg switcher.
 *
 * Combined numbers come from `computeHedgeUnPnl` (already summed across legs).
 * Per-leg sections reuse the same performance widgets the single-bot drawer
 * Overview renders, just fed each leg's transformed bot.
 */
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useMemo } from 'react';

import { ProfitAndPerc, ProfitLossPercChip } from '@/components/ui/chip';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import { BOT_METRIC_DESCRIPTIONS } from '@/lib/botMetricDescriptions';
import { getDrawerWidgetsForBot } from '@/components/bots/drawerWidgetConfig';
import DrawerWidgetRenderer from '@/components/widgets/bots/drawer/DrawerWidgetRenderer';
import type { DrawerBot } from '@/types/bots/drawer';

// Widgets that belong to other tabs (Deals/Events/Settings/Webhook/etc.) — the
// Overview renders everything except these, same as the single-bot drawer.
const NON_OVERVIEW_WIDGETS = [
  'drawer-bot-events',
  'drawer-webhook-info',
  'drawer-bot-settings',
  'drawer-deals-table',
  'drawer-orders-table',
  'drawer-backtest-results',
  'drawer-additional-details',
];

const money = (value: number, privacy?: boolean): string =>
  privacy ? '***' : `$${value.toFixed(2)}`;

const StatTile: React.FC<{
  label: string;
  tooltip?: string;
  children: React.ReactNode;
}> = ({ label, tooltip, children }) => (
  <div className="rounded-lg bg-muted p-sm">
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      {label}
      {tooltip && (
        <Tooltip tooltip={tooltip} side="top">
          <InfoIcon />
        </Tooltip>
      )}
    </div>
    <div className="mt-0.5 text-sm font-semibold">{children}</div>
  </div>
);

interface HedgeLegSectionProps {
  leg: 'long' | 'short';
  bot: DrawerBot | null;
  privacyMode?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onTradeSelect?: (trade: any) => void;
}

const HedgeLegSection: React.FC<HedgeLegSectionProps> = ({
  leg,
  bot,
  privacyMode,
  onTradeSelect,
}) => {
  const widgets = useMemo(
    () =>
      bot
        ? getDrawerWidgetsForBot(bot).filter(
            (w) => !NON_OVERVIEW_WIDGETS.includes(w.type)
          )
        : [],
    [bot]
  );

  const isLong = leg === 'long';
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${
            isLong
              ? 'bg-success/10 text-success'
              : 'bg-destructive/10 text-destructive'
          }`}
        >
          {isLong ? (
            <ArrowUpRight className="h-3.5 w-3.5" />
          ) : (
            <ArrowDownRight className="h-3.5 w-3.5" />
          )}
          {isLong ? 'Long leg' : 'Short leg'}
        </span>
        {bot?.settings?.name && (
          <span className="truncate text-sm text-muted-foreground">
            {bot.settings.name}
          </span>
        )}
      </div>
      {bot ? (
        <DrawerWidgetRenderer
          botId={bot._id}
          bot={bot}
          privacyMode={privacyMode}
          widgets={widgets}
          onTradeSelect={onTradeSelect}
        />
      ) : (
        <div className="rounded-lg bg-muted p-sm text-sm text-muted-foreground">
          This leg has no data.
        </div>
      )}
    </section>
  );
};

export interface HedgeOverviewPanelProps {
  longBot: DrawerBot | null;
  shortBot: DrawerBot | null;
  /** Combined realized profit (USD) across both legs. */
  totalProfitUsd: number;
  /**
   * Server-accurate combined unrealized (USD), summed from the bot's deals.
   * Preferred over the per-leg client calc, which reads 0 for bots on
   * exchanges missing from the price feed (e.g. Kraken futures). Falls back
   * to summing the leg bots when undefined.
   */
  unrealizedUsd?: number;
  privacyMode?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onTradeSelect?: (trade: any) => void;
}

const HedgeOverviewPanel: React.FC<HedgeOverviewPanelProps> = ({
  longBot,
  shortBot,
  totalProfitUsd,
  unrealizedUsd,
  privacyMode = false,
  onTradeSelect,
}) => {
  // Cost / max cost / avg-daily are usage- and history-based, so the per-leg
  // sum is reliable. Unrealized is taken from the deal-derived value when
  // available (the client price calc reads 0 for price-feed-less exchanges),
  // otherwise we fall back to summing the legs.
  const currentValue =
    (longBot?.currentValue ?? 0) + (shortBot?.currentValue ?? 0);
  const maxValue = (longBot?.maxValue ?? 0) + (shortBot?.maxValue ?? 0);
  const legUnPnlSum = (longBot?.unPnl ?? 0) + (shortBot?.unPnl ?? 0);
  const unPnlValue = unrealizedUsd ?? legUnPnlSum;
  const unPnlPerc = currentValue > 0 ? (unPnlValue / currentValue) * 100 : 0;
  const avgDaily = (longBot?.avgDaily ?? 0) + (shortBot?.avgDaily ?? 0);
  const avgDailyPerc = maxValue > 0 ? (avgDaily / maxValue) * 100 : 0;
  const annualizedReturn = avgDailyPerc * 365;

  return (
    <div className="space-y-6">
      {/* Combined — the hedge as one position */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            Combined
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StatTile label="Cost" tooltip={BOT_METRIC_DESCRIPTIONS.hedge.currentCost}>{money(currentValue, privacyMode)}</StatTile>
          <StatTile label="Max cost" tooltip={BOT_METRIC_DESCRIPTIONS.hedge.maxCost}>
            <span className="text-muted-foreground">
              {money(maxValue, privacyMode)}
            </span>
          </StatTile>
          <StatTile label="Unrealized PnL" tooltip={BOT_METRIC_DESCRIPTIONS.hedge.unrealizedPnl}>
            <ProfitAndPerc
              value={unPnlValue}
              percentage={unPnlPerc}
              privacyMode={privacyMode}
              chipPosition="right"
              size="sm"
            />
          </StatTile>
          <StatTile label="Realized PnL" tooltip={BOT_METRIC_DESCRIPTIONS.hedge.realizedPnl}>
            <ProfitAndPerc
              value={totalProfitUsd}
              percentage={0}
              privacyMode={privacyMode}
              hidePercentage
              size="sm"
            />
          </StatTile>
          <StatTile label="Avg daily" tooltip={BOT_METRIC_DESCRIPTIONS.hedge.avgDaily}>
            <ProfitAndPerc
              value={avgDaily}
              percentage={avgDailyPerc}
              privacyMode={privacyMode}
              chipPosition="right"
              size="sm"
            />
          </StatTile>
          <StatTile label="Annualized">
            <ProfitLossPercChip value={annualizedReturn} size="sm" />
          </StatTile>
        </div>
      </section>

      <HedgeLegSection
        leg="long"
        bot={longBot}
        privacyMode={privacyMode}
        onTradeSelect={onTradeSelect}
      />
      <HedgeLegSection
        leg="short"
        bot={shortBot}
        privacyMode={privacyMode}
        onTradeSelect={onTradeSelect}
      />
    </div>
  );
};

export default HedgeOverviewPanel;
