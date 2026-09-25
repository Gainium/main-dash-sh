/**
 * "Stats" tab of the bot details drawer — the redesign's replacement for
 * legacy main-dash's full-width "Bot Statistics" widget on the bot page
 * (`components/dcabot/components/botStats.tsx`).
 *
 * Everything legacy split across its own Overview / Stats switcher — grade,
 * KPIs and donuts, then the metric cards — in ONE scroll, rendered with the
 * redesign's backtest-results templates so a live bot and a backtest of the
 * same strategy read the same.
 *
 * Data: `useBotFullStats`. The drawer's bot normally comes from the list
 * query, whose fragment strips `stats` to a chart-only slice, so the full
 * block is fetched for this one bot when the tab is opened, and overlaid by
 * socket-pushed stats when the bot recomputes.
 */

import type { PeriodValue } from '@/components/ui/PeriodDatePicker';
import { Skeleton } from '@/components/ui/skeleton';
import { useBotFullStats } from '@/hooks/useBotFullStats';
import { useBotPairStats } from '@/hooks/useBotPairStats';
import { useShareContext } from '@/hooks/useShareContext';
import type { BotSymbolsStats, BotTypesEnum } from '@/types';
import { useMemo, useState, type FC } from 'react';

import { DrawerSection } from '../drawer/DrawerSection';

import { BotStatsBreakdown } from './BotStatsBreakdown';
import { BotStatsOverview } from './BotStatsOverview';
import { BotPairStatsTable } from './BotPairStatsTable';
import {
  buildBotStatsBreakdown,
  buildBotStatsHeadline,
  type BotStatsSourceBot,
} from './botStatsViewModel';
import {
  buildPairStatsRows,
  buildPairStatsRowsFromSymbolStats,
} from './pairStatsViewModel';

export interface BotStatsTabProps {
  botId: string;
  botType: BotTypesEnum;
  /** The drawer's bot — supplies profit / avg-daily / open-P&L / settings. */
  bot: BotStatsSourceBot & {
    stats?: unknown;
    symbolStats?: unknown;
  };
  /** False while the tab is not the active one — gates the fetch. */
  active?: boolean;
}

const StatsSkeleton: FC = () => (
  <div className="flex flex-col gap-md">
    <div className="flex flex-wrap gap-sm">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-[68px] flex-1 min-w-[130px] rounded-xl" />
      ))}
    </div>
    <Skeleton className="h-[240px] w-full rounded-xl" />
  </div>
);

export const BotStatsTab: FC<BotStatsTabProps> = ({
  botId,
  botType,
  bot,
  active = true,
}) => {
  // Share-link visitors read the same stats without a token.
  const { shareId } = useShareContext();

  const { stats, symbolStats, isLoading, isError } = useBotFullStats({
    botId,
    type: botType,
    shareId: shareId ?? null,
    enabled: active,
    existing: bot.stats as Parameters<typeof buildBotStatsHeadline>[0] | undefined,
    existingSymbolStats: bot.symbolStats as BotSymbolsStats[] | undefined,
  });

  const headline = useMemo(
    () => (stats ? buildBotStatsHeadline(stats, bot) : null),
    [stats, bot]
  );
  const breakdown = useMemo(
    () => (stats ? buildBotStatsBreakdown(stats, bot) : null),
    [stats, bot]
  );
  // Per-pair breakdown only earns its space on multi-pair bots. The stored
  // symbolStats seed one row even for a single-pair bot, hence `> 1`.
  const multiPair =
    !!bot.settings?.useMulti ||
    (bot.symbol?.length ?? 0) > 1 ||
    (symbolStats?.length ?? 0) > 1;

  const [range, setRange] = useState<PeriodValue | null>(null);
  const pairStats = useBotPairStats({
    botId,
    type: botType,
    shareId: shareId ?? null,
    from: range?.from.getTime(),
    to: range?.to.getTime(),
    enabled: active && multiPair,
  });
  const pairRows = useMemo(
    () =>
      pairStats.unavailable
        ? buildPairStatsRowsFromSymbolStats(symbolStats)
        : buildPairStatsRows(pairStats.rows),
    [pairStats.unavailable, pairStats.rows, symbolStats]
  );

  if (isLoading) return <StatsSkeleton />;

  if (isError) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        Statistics could not be loaded.
      </div>
    );
  }

  if (!headline || !breakdown) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        No statistics yet — this bot has not closed any deals.
      </div>
    );
  }

  // One continuous view, NOT a nested tab set: this already sits behind the
  // drawer's own "Stats" tab, and a second Overview/Stats switcher one level
  // in read as a duplicate of the tab bar right above it. Legacy main-dash
  // needed the switcher because its widget lived inline on the bot page with
  // no tab of its own; here the drawer tab does that job.
  // DrawerSection (a headerless WidgetWrapper) is what carries the "Enter
  // fullscreen" control; without it this tab had no route into full-screen at
  // all. This component is rendered straight into the tab rather than through
  // the drawer widget registry, so it has no widget id of its own — derive a
  // stable one from the bot. `bare` keeps the title off
  // the tab body (the tab bar above already says "Stats") while still naming
  // the widget in the full-screen view.
  return (
    <DrawerSection
      widgetId={`drawer-bot-stats-${botId}`}
      widgetType="drawer-bot-stats"
      title="Statistics"
      bare
    >
      <div className="flex flex-col gap-md">
        <BotStatsOverview vm={headline} />
        <BotStatsBreakdown vm={breakdown} />
        {multiPair && (
          <BotPairStatsTable
            botId={botId}
            rows={pairRows}
            isLoading={pairStats.isLoading}
            range={range}
            // An older backend has no per-pair query, so no range to apply.
            {...(pairStats.unavailable ? {} : { onRangeChange: setRange })}
            fromStoredStats={pairStats.unavailable}
          />
        )}
      </div>
    </DrawerSection>
  );
};
