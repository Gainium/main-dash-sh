/**
 * Live-bot Statistics → Overview.
 *
 * The headline half of legacy main-dash's "Bot Statistics" widget: confidence
 * grade, the KPI strip (net result / avg daily / open P&L / max equity DD /
 * max deal duration) and the win-rate + profit-factor donuts.
 *
 * It renders the SAME atoms as the backtest results Overview
 * (`statsPrimitives`) so a bot's numbers and a backtest's numbers read
 * identically — which is the whole point of the legacy widget, and the reason
 * it imported the backtest result blocks verbatim.
 *
 * Deliberately NO equity curve or deal-P&L scatter here: the drawer's own
 * Overview tab already renders both (`drawer-performance-chart`), and
 * duplicating them one tab over would be noise.
 */

import type React from 'react';

import { Donut, Kpi, MetricRow, Panel } from '../statsPrimitives';
import { BotStatsConfidenceGrade } from './BotStatsConfidenceGrade';
import type { BotStatsHeadlineVM } from './botStatsViewModel';

const fmtUsd = (v: number, d = 2): string =>
  (v < 0 ? '-$' : '$') +
  Math.abs(v).toLocaleString('en-US', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });

const fmtPct = (v: number, d = 2): string =>
  (v > 0 ? '+' : '') + v.toFixed(d) + '%';

export interface BotStatsOverviewProps {
  vm: BotStatsHeadlineVM;
}

export const BotStatsOverview: React.FC<BotStatsOverviewProps> = ({ vm }) => {
  const profitFactorLabel = Number.isFinite(vm.profitFactor)
    ? vm.profitFactor.toFixed(2)
    : '∞';

  const winRate =
    vm.wins + vm.losses > 0 ? (vm.wins / (vm.wins + vm.losses)) * 100 : 0;

  return (
    // Container queries, not viewport ones: this renders inside the bot
    // drawer, a ~600px column on a 1280px screen — `lg:` would fire on the
    // viewport and overflow the drawer.
    <div className="@container flex flex-col gap-md">
      {/* KPI row */}
      <div className="flex flex-wrap gap-sm">
        <Kpi
          label="Net Result"
          value={fmtPct(vm.netPerc)}
          sub={fmtUsd(vm.netUsd)}
          tone={vm.netPerc >= 0 ? 'up' : 'down'}
          big
        />
        <Kpi
          label="Avg Daily Return"
          value={fmtPct(vm.avgDailyPerc)}
          sub={fmtUsd(vm.avgDailyUsd)}
          tone={vm.avgDailyPerc >= 0 ? 'up' : 'down'}
        />
        <Kpi
          label="Open P&L"
          value={fmtPct(vm.openPnlPerc)}
          sub={fmtUsd(vm.openPnlUsd)}
          tone={vm.openPnlPerc >= 0 ? 'up' : 'down'}
        />
        {vm.maxEquityDdPerc !== null && (
          <Kpi
            label="Max Equity DD"
            value={vm.maxEquityDdPerc.toFixed(2) + '%'}
            sub={vm.maxEquityDdUsd !== null ? fmtUsd(vm.maxEquityDdUsd) : ''}
            tone="down"
          />
        )}
        <Kpi label="Max Deal Duration" value={vm.maxDealDuration} grey />
        <Kpi label="Bot Working Time" value={vm.workingTime} grey />
      </div>

      {/* grade + donuts + metric list */}
      <div className="flex flex-col gap-md @3xl:flex-row">
        <div className="@3xl:w-[240px] @3xl:shrink-0">
          <BotStatsConfidenceGrade
            grade={vm.confidenceGrade}
            deals={vm.closedDeals}
          />
        </div>

        <div className="flex flex-1 flex-col gap-md">
          <div className="flex flex-col gap-md @lg:flex-row">
            <Panel title="Win Rate" className="flex-1 items-center">
              <Donut
                value={`${winRate.toFixed(0)}%`}
                label="Win Rate"
                // Open deals are excluded so the green arc matches the
                // centered win-rate = wins / (wins + losses).
                segments={[
                  { value: vm.wins, color: 'var(--color-profit)' },
                  { value: vm.losses, color: 'var(--color-loss)' },
                ]}
              />
            </Panel>
            <Panel title="Profit Factor" className="flex-1 items-center">
              <Donut
                value={profitFactorLabel}
                label="Profit Factor"
                segments={[
                  { value: vm.wins, color: 'var(--color-profit)' },
                  { value: vm.losses, color: 'var(--color-loss)' },
                ]}
              />
            </Panel>
          </div>

          <Panel title="Performance Metrics">
            <MetricRow k="Deals" v={vm.wins + vm.losses + vm.open} />
            <MetricRow k="Winners" v={vm.wins} tone="up" />
            <MetricRow k="Losers" v={vm.losses} tone="down" />
            <MetricRow k="Open" v={vm.open} />
            <div className="my-1.5 border-t border-border/60" />
            <MetricRow k="Deals / day" v={vm.dealsPerDay.toFixed(2)} />
            <MetricRow
              k="Annualized Return"
              v={vm.annualizedPerc !== null ? fmtPct(vm.annualizedPerc) : '—'}
              tone={
                vm.annualizedPerc === null
                  ? 'neutral'
                  : vm.annualizedPerc >= 0
                    ? 'up'
                    : 'down'
              }
            />
          </Panel>
        </div>
      </div>
    </div>
  );
};
