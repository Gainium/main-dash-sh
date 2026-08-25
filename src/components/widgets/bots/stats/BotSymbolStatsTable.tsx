/**
 * Per-pair breakdown for multi-pair bots — port of legacy
 * `components/backtesting/result/symbolStats.tsx`, which legacy's Bot
 * Statistics widget rendered under the Overview tab whenever the bot traded
 * more than one pair.
 *
 * Metrics down the rows, pairs across the columns (same orientation as
 * legacy), so a 20-pair bot scrolls sideways instead of producing 20 cards.
 */

import { Card } from '@/components/ui/card';
import type React from 'react';

import type { BotSymbolStatsRowVM } from './botStatsViewModel';

const pctClass = (v: number): string =>
  v > 0 ? 'text-profit' : v < 0 ? 'text-loss' : 'text-foreground';

export interface BotSymbolStatsTableProps {
  rows: BotSymbolStatsRowVM[];
}

export const BotSymbolStatsTable: React.FC<BotSymbolStatsTableProps> = ({
  rows,
}) => {
  if (rows.length === 0) return null;

  const showAvgDuration = rows.some((r) => r.avgDealDuration !== null);

  const metrics: Array<{
    label: string;
    render: (r: BotSymbolStatsRowVM) => React.ReactNode;
  }> = [
    {
      label: 'Deals',
      render: (r) =>
        `${r.deals.profit + r.deals.loss} (profit - ${r.deals.profit}, loss - ${r.deals.loss})`,
    },
    {
      label: 'Net Result',
      render: (r) => (
        <span className={pctClass(r.netProfitPerc)}>
          {r.netProfitPerc.toFixed(2)}%
        </span>
      ),
    },
    {
      label: 'Daily return',
      render: (r) => (
        <span className={pctClass(r.dailyReturnPerc)}>
          {r.dailyReturnPerc.toFixed(2)}%
        </span>
      ),
    },
    { label: 'Win Rate', render: (r) => `${r.winRatePerc.toFixed(2)}%` },
    {
      label: 'Profit Factor',
      render: (r) =>
        Number.isFinite(r.profitFactor) ? r.profitFactor.toFixed(3) : '∞',
    },
    { label: 'Max. deal duration', render: (r) => r.maxDealDuration },
    ...(showAvgDuration
      ? [
          {
            label: 'Avg. deal duration',
            render: (r: BotSymbolStatsRowVM) => r.avgDealDuration ?? '—',
          },
        ]
      : []),
  ];

  return (
    <Card position={2} className="p-md">
      <h3 className="mb-4 text-sm font-semibold text-foreground">
        Per-pair statistics
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-surface-2 px-sm py-xs text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                &nbsp;
              </th>
              {rows.map((r) => (
                <th
                  key={r.pair}
                  className="px-sm py-xs text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {r.pair}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.label} className="border-t border-border/40">
                <td className="sticky left-0 z-10 bg-surface-2 px-sm py-xs text-left text-muted-foreground">
                  {m.label}
                </td>
                {rows.map((r) => (
                  <td
                    key={`${r.pair}-${m.label}`}
                    className="px-sm py-xs text-right tabular-nums text-foreground"
                  >
                    {m.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
