import { Activity, DollarSign, Wallet } from 'lucide-react';
import React from 'react';
import type { BotListStats } from '@/hooks/useBotListStats';
import { StatsBoxes, type StatBox } from './StatsBoxes';

export interface BotListStatsBoxesProps {
  stats: BotListStats;
  privacyMode: boolean;
  isLoading: boolean;
  /**
   * Subtitle wording for the Active Bots box. Grid bots have no `dealsInBot`
   * concept so the "active deals" phrasing is meaningless there — Grid pages
   * pass `bots`, which restates the active count as "X active bots".
   * DCA/Combo/Hedge/Trading use the default `deals`.
   */
  activityLabel?: 'deals' | 'bots';
  className?: string;
}

function formatSigned(n: number): string {
  return `${n >= 0 ? '+' : ''}$${n.toFixed(2)}`;
}

export const BotListStatsBoxes: React.FC<BotListStatsBoxesProps> = ({
  stats,
  privacyMode,
  isLoading,
  activityLabel = 'deals',
  className,
}) => {
  const activitySubtitle =
    activityLabel === 'bots'
      ? `${stats.activeBots} active bots`
      : `${stats.activeDeals} active deals`;

  const boxes: StatBox[] = [
    {
      title: 'Active Bots',
      tooltip: 'Bots with something open right now, out of the bots running.',
      value: privacyMode ? '***' : `${stats.activeBots}/${stats.runningBots}`,
      subtitle: activitySubtitle,
      icon: <Activity className="w-4 h-4" />,
      isLoading,
    },
    {
      title: 'Realized PnL',
      tooltip:
        'Profit banked from closed deals across the bots in this list. Deals still running are not counted — those show as Unrealized PnL on each bot.',
      value: privacyMode ? '***' : `$${stats.totalProfit.toFixed(2)}`,
      subtitle: privacyMode
        ? '***'
        : `Today ${formatSigned(stats.todayProfit)}`,
      icon: <DollarSign className="w-4 h-4" />,
      colorClass:
        stats.totalProfit >= 0
          ? 'from-green-500 to-green-600'
          : 'from-red-500 to-red-600',
      isLoading,
    },
    {
      title: 'Capital Deployed',
      tooltip:
        'Money these bots have working in open deals right now, and how much of their combined maximum that is.',
      value: privacyMode ? '***' : `$${stats.capitalDeployed.toFixed(0)}`,
      subtitle: privacyMode
        ? '***'
        : `${stats.utilization.toFixed(1)}% utilization`,
      icon: <Wallet className="w-4 h-4" />,
      isLoading,
    },
  ];

  return <StatsBoxes boxes={boxes} className={className} />;
};

export default BotListStatsBoxes;
