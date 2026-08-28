import React from 'react';
import { useBotDcaOrderFill } from '@/hooks/useBotDcaOrderFill';
import { DualArcProgressGauge } from '../ui/DualArcProgressGauge';

/**
 * The bots tables' USAGE column: a money-usage ring labelled with the bot's
 * DCA ladder.
 *
 * The ring's percentage is cost-vs-max. The label under it is filled / total
 * DCA orders across the bot's open deals — the same quantity the deals table
 * and the deal card print under their own usage rings. Without it the column
 * said how much money was deployed but not how many safety orders had
 * triggered, which is what users read a usage ring for.
 */
export const BotUsageCell: React.FC<{
  botId: string;
  usageTotal?: number;
  dealType?: 'dca' | 'combo';
}> = ({ botId, usageTotal, dealType = 'dca' }) => {
  const fill = useBotDcaOrderFill(botId, dealType);

  return (
    <div
      className="flex items-center justify-center"
      title={
        fill ? `${fill.complete} of ${fill.all} DCA orders filled` : undefined
      }
    >
      <DualArcProgressGauge
        size={40}
        outerPercentage={usageTotal || 0}
        innerPercentage={0}
        outerProgressColor="#10b981"
        showInnerGauge={false}
        displayMode="outer"
        centerText={`${(usageTotal || 0).toFixed(0)}%`}
        label={fill ? `${fill.complete}/${fill.all}` : ''}
        animate={false}
      />
    </div>
  );
};
