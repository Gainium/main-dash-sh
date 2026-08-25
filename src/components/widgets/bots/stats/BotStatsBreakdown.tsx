/**
 * Live-bot Statistics → Stats.
 *
 * The detailed half of legacy main-dash's "Bot Statistics" widget: the
 * General / Winners / Losers / Performance Ratios / DCA Usage cards. Legacy
 * fed the BACKTEST result blocks (`generalBlock` / `profitLossBlock` /
 * `performaceBlock` / `dcaBlock`) with bot data; the redesign equivalent is
 * this, rendering the same `StatsSection` masonry the backtest Stats tab uses.
 *
 * Field-for-field parity with `BacktestStatsTab` where the metric exists on
 * both sides. Metrics the live-bot stats block does not carry (testing period,
 * backtest timing, standard deviations — the backend leaves them off) are
 * simply absent rather than shown as "N/A".
 */

import { MasonryLayout } from '@/components/ui/MasonryLayout';
import {
  Activity,
  Percent,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type React from 'react';

import { StatItem, StatItemWithChip, StatsSection } from '../statsPrimitives';
import type { BotStatsBreakdownVM } from './botStatsViewModel';

const fmtPct = (v: number | null | undefined): string =>
  typeof v === 'number' ? `${v.toFixed(2)}%` : 'N/A';

const fmtRatio = (v: number | null): string =>
  v === null ? 'N/A' : v.toString();

export interface BotStatsBreakdownProps {
  vm: BotStatsBreakdownVM;
}

export const BotStatsBreakdown: React.FC<BotStatsBreakdownProps> = ({ vm }) => (
  <MasonryLayout gap={16} containerBreakpoints={{ default: 1, 640: 2, 1024: 3 }}>
    <StatsSection title="General" icon={Activity}>
      <div className="space-y-xs">
        <StatItemWithChip
          label="Net result"
          value={vm.general.netPerc}
          additionalText={vm.general.netText}
        />
        <StatItemWithChip
          label="Avg daily return"
          value={vm.general.avgDailyPerc}
          additionalText={vm.general.avgDailyText}
        />
        <StatItemWithChip
          label="Annualized return"
          value={vm.general.annualizedPerc}
        />
        <StatItem
          label="Total deals (profit:loss:open)"
          value={vm.general.dealsText}
        />
        <StatItem
          label="Max deal duration"
          value={vm.general.maxDealDuration}
        />
        <StatItem label="Deals/day" value={vm.general.dealsPerDay.toFixed(2)} />
        <StatItemWithChip
          label="Open P&L"
          value={vm.general.openPnlPerc}
          additionalText={vm.general.openPnlText}
        />
        <StatItem label="Bot working time" value={vm.general.workingTime} />
      </div>
    </StatsSection>

    <StatsSection title="Winners" icon={TrendingUp}>
      <div className="space-y-xs">
        <StatItem label="№" value={vm.winners.count} />
        <StatItemWithChip label="Win, %" value={vm.winners.winRate} />
        <StatItemWithChip
          label="Gross profit"
          value={vm.winners.grossProfitPerc}
          additionalText={vm.winners.grossProfitText}
        />
        <StatItemWithChip
          label="Max deal profit"
          value={vm.winners.maxDealProfitPerc}
          additionalText={vm.winners.maxDealProfitText}
        />
        <StatItemWithChip
          label="Avg deal profit"
          value={vm.winners.avgDealProfitPerc}
          additionalText={vm.winners.avgDealProfitText}
        />
        <StatItemWithChip
          label="Max Run-Up"
          value={vm.winners.maxRunUpPerc}
          additionalText={vm.winners.maxRunUpText}
        />
        <StatItem
          label="Max Consecutive Wins"
          value={vm.winners.maxConsecutiveWins}
        />
        <StatItem
          label="Average winning trade duration"
          value={vm.winners.avgWinningTradeDuration}
        />
        <StatItem
          label="Max winning trade duration"
          value={vm.winners.maxWinningTradeDuration}
        />
      </div>
    </StatsSection>

    <StatsSection title="Losers" icon={TrendingDown}>
      <div className="space-y-xs">
        <StatItem label="№" value={vm.losers.count} />
        <StatItemWithChip
          label="Gross loss"
          value={vm.losers.grossLossPerc}
          additionalText={vm.losers.grossLossText}
        />
        <StatItemWithChip
          label="Max deal loss"
          value={vm.losers.maxDealLossPerc}
          additionalText={vm.losers.maxDealLossText}
        />
        <StatItemWithChip
          label="Avg deal loss"
          value={vm.losers.avgDealLossPerc}
          additionalText={vm.losers.avgDealLossText}
        />
        <StatItemWithChip
          label="Max Realized DD"
          value={vm.losers.maxRealizedDdPerc}
          additionalText={vm.losers.maxRealizedDdText}
        />
        {vm.losers.maxEquityDdPerc !== null && (
          <StatItemWithChip
            label="Max Equity DD"
            value={vm.losers.maxEquityDdPerc}
            {...(vm.losers.maxEquityDdText
              ? { additionalText: vm.losers.maxEquityDdText }
              : {})}
          />
        )}
        <StatItem
          label="Max Consecutive Losses"
          value={vm.losers.maxConsecutiveLosses}
        />
        <StatItem
          label="Average losing trade duration"
          value={vm.losers.avgLosingTradeDuration}
        />
        <StatItem
          label="Max losing trade duration"
          value={vm.losers.maxLosingTradeDuration}
        />
      </div>
    </StatsSection>

    <StatsSection title="Performance Ratios" icon={Target}>
      <div className="space-y-xs">
        <StatItem
          label="Profit Factor"
          value={
            Number.isFinite(vm.ratios.profitFactor)
              ? vm.ratios.profitFactor.toFixed(3)
              : 'Infinity'
          }
        />
        {vm.ratios.sharpeRatio !== null && (
          <StatItem
            label="Sharpe Ratio"
            value={fmtRatio(vm.ratios.sharpeRatio)}
          />
        )}
        {vm.ratios.sortinoRatio !== null && (
          <StatItem
            label="Sortino Ratio"
            value={fmtRatio(vm.ratios.sortinoRatio)}
          />
        )}
        {vm.ratios.cwr !== null && (
          <StatItem
            label="Consistency-Weighted Return"
            value={fmtRatio(vm.ratios.cwr)}
          />
        )}
        <StatItemWithChip
          label="Buy-and-Hold Return"
          value={vm.ratios.buyAndHoldPerc}
          additionalText={vm.ratios.buyAndHoldText}
        />
      </div>
    </StatsSection>

    {vm.showDca && (
      <StatsSection title="DCA Usage" icon={Percent}>
        <div className="space-y-xs">
          <StatItem label="Actual ratio" value={fmtPct(vm.dca.maxUsagePerc)} />
          <StatItem
            label="Max theoretical usage"
            value={vm.dca.maxTheoreticalUsage}
          />
          <StatItem label="Actual max usage" value={vm.dca.maxRealUsage} />
          {vm.dca.avgDealUsage !== null && (
            <StatItem label="Avg deal usage" value={vm.dca.avgDealUsage} />
          )}
          <StatItem
            label="Max DCA orders trigger"
            value={vm.dca.maxDcaTriggered}
          />
          {vm.dca.avgDcaTriggered !== null && (
            <StatItem
              label="Av. DCA orders trigger"
              value={vm.dca.avgDcaTriggered}
            />
          )}
          <StatItem
            label="Covered Price deviation"
            value={fmtPct(vm.dca.coveredPriceDeviation)}
          />
          <StatItem
            label="Used Price deviation"
            value={fmtPct(vm.dca.actualPriceDeviation)}
          />
        </div>
      </StatsSection>
    )}
  </MasonryLayout>
);
