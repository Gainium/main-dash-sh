/**
 * "Stats" tab of the bot details drawer — the redesign's replacement for
 * legacy main-dash's full-width "Bot Statistics" widget on the bot page
 * (`components/dcabot/components/botStats.tsx`).
 *
 * Same two-view split as legacy — Overview (grade + KPIs + donuts) and Stats
 * (the metric cards) — rendered with the redesign's backtest-results
 * templates so a live bot and a backtest of the same strategy read the same.
 *
 * Data: `useBotFullStats`. The drawer's bot normally comes from the list
 * query, whose fragment strips `stats` to a chart-only slice, so the full
 * block is fetched for this one bot when the tab is opened, and overlaid by
 * socket-pushed stats when the bot recomputes.
 */

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useBotFullStats } from '@/hooks/useBotFullStats';
import { useShareContext } from '@/hooks/useShareContext';
import type { BotTypesEnum } from '@/types';
import { useMemo, useState, type FC } from 'react';

import { BotStatsBreakdown } from './BotStatsBreakdown';
import { BotStatsOverview } from './BotStatsOverview';
import { BotSymbolStatsTable } from './BotSymbolStatsTable';
import {
  buildBotStatsBreakdown,
  buildBotStatsHeadline,
  buildBotSymbolStatsRows,
  type BotStatsSourceBot,
} from './botStatsViewModel';

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
  const [view, setView] = useState<'overview' | 'stats'>('overview');
  // Share-link visitors read the same stats without a token.
  const { shareId } = useShareContext();

  const { stats, symbolStats, isLoading, isError } = useBotFullStats({
    botId,
    type: botType,
    shareId: shareId ?? null,
    enabled: active,
    existing: bot.stats as Parameters<typeof buildBotStatsHeadline>[0] | undefined,
    existingSymbolStats: bot.symbolStats as Parameters<
      typeof buildBotSymbolStatsRows
    >[0],
  });

  const headline = useMemo(
    () => (stats ? buildBotStatsHeadline(stats, bot) : null),
    [stats, bot]
  );
  const breakdown = useMemo(
    () => (stats ? buildBotStatsBreakdown(stats, bot) : null),
    [stats, bot]
  );
  const symbolRows = useMemo(
    () => buildBotSymbolStatsRows(symbolStats),
    [symbolStats]
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

  return (
    <Tabs
      value={view}
      onValueChange={(v) => setView(v as 'overview' | 'stats')}
      className="flex flex-col gap-md"
    >
      <TabsList className="grid w-full max-w-[280px] grid-cols-2">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="stats">Stats</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-0 flex flex-col gap-md">
        <BotStatsOverview vm={headline} />
        {/* Per-pair breakdown only earns its space on multi-pair bots. */}
        {symbolRows.length > 1 && <BotSymbolStatsTable rows={symbolRows} />}
      </TabsContent>

      <TabsContent value="stats" className="mt-0">
        <BotStatsBreakdown vm={breakdown} />
      </TabsContent>
    </Tabs>
  );
};
