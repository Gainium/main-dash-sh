import { MasonryLayout } from '@/components/ui/MasonryLayout';
import {
  StatItem,
  StatItemWithChip,
  StatsSection,
} from '@/components/widgets/bots/statsPrimitives';
import type { DCABacktestingResultHistory } from '@/types';
import {
  Activity,
  Percent,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import React from 'react';

interface BacktestStatsTabProps {
  backtest: DCABacktestingResultHistory;
}

const formatDuration = (
  duration: { d?: string; h?: string; min?: string; s?: string } | undefined
) => {
  if (!duration) return 'N/A';
  const parts = [];
  if (duration.d && duration.d !== '0') parts.push(`${duration.d}d`);
  if (duration.h && duration.h !== '0') parts.push(`${duration.h}h`);
  if (duration.min && duration.min !== '0') parts.push(`${duration.min}m`);
  if (duration.s && duration.s !== '0' && parts.length === 0)
    parts.push(`${duration.s}s`);
  return parts.join(' ') || '0s';
};

const formatDurationFromMs = (ms: number | undefined) => {
  if (!ms) return '0s';
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 && parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(' ') || '0s';
};

/** Formats a profit-currency value with the resolved asset label.
 *  `profitSign` is computed by `getProfitSign` below from bot settings;
 *  the hardcoded `'BTC'` fallback only kicks in if the caller passes
 *  nothing at all (defensive, shouldn't happen in real data). */
const formatBase = (
  value: number | undefined | null,
  profitSign?: string
) => {
  const sign = profitSign || 'BTC';
  if (value === undefined || value === null) return `0 ${sign}`;
  return `${value.toFixed(8)} ${sign}`;
};

const formatUSD = (value: number | undefined | null) => {
  if (value === undefined || value === null) return '$0.00';
  return `$${value.toFixed(2)}`;
};

const formatPercent = (value: number | undefined | null) => {
  if (value === undefined || value === null) return '0%';
  return `${value.toFixed(2)}%`;
};

export const BacktestStatsTab: React.FC<BacktestStatsTabProps> = ({
  backtest,
}) => {
  const { financial, duration, numerical, ratios, usage, quoteAsset } =
    backtest;
  const baseAsset = (backtest as { baseAsset?: string }).baseAsset;

  const resolvedSettings = (() => {
    const candidate = backtest.settings as unknown;
    if (!candidate || typeof candidate !== 'object') return undefined;
    // Some payloads may wrap bot settings as { settings: { ... } }
    const maybeWrapped = candidate as Record<string, unknown>;
    if (
      'settings' in maybeWrapped &&
      maybeWrapped['settings'] &&
      typeof maybeWrapped['settings'] === 'object'
    ) {
      return maybeWrapped['settings'] as typeof backtest.settings;
    }
    return backtest.settings;
  })();

  // Mirrors legacy `dash/components/backtesting/BacktestingResults.tsx`'s
  // `profitSign` formula: futures linear → quote, futures inverse → base,
  // spot → whichever profit currency the bot's set to. Falls back to
  // `quoteAsset` when settings are absent (older history payloads).
  const profitSign = (() => {
    const settings = resolvedSettings as
      | {
          futures?: boolean;
          coinm?: boolean;
          profitCurrency?: 'base' | 'quote' | string;
        }
      | undefined;
    if (!settings) return quoteAsset;
    if (settings.futures) {
      return settings.coinm ? baseAsset : quoteAsset;
    }
    return settings.profitCurrency === 'base' ? baseAsset : quoteAsset;
  })();

  // Calculate DCA settings description
  const dcaDescription = resolvedSettings?.useDca
    ? `DCA max/grid's ${resolvedSettings?.ordersCount || 5} orders each ${resolvedSettings?.orderSize || '0.0005'} ${profitSign || quoteAsset || 'BTC'} step ${resolvedSettings?.step || '5'}% levels`
    : 'DCA not used';

  const tpDescription = resolvedSettings?.useTp
    ? `TP ${resolvedSettings?.tpPerc || '0'}%`
    : 'Not use TP';
  const slDescription = resolvedSettings?.useSl
    ? `SL ${resolvedSettings?.slPerc || '0'}%`
    : 'Not use SL';

  // Format testing period
  const testingPeriodFrom = duration?.firstDataTime
    ? new Date(duration.firstDataTime).toLocaleString()
    : 'N/A';
  const testingPeriodTo = duration?.lastDataTime
    ? new Date(duration.lastDataTime).toLocaleString()
    : 'N/A';

  // Format backtest timing
  const backtestTiming = `load data - ${duration?.loadingDataTime || 0} s, process data - ${duration?.processingDataTime || 0} s`;

  // Calculate win percentage
  const winPercentage = numerical?.all
    ? ((numerical?.profit || 0) / numerical.all) * 100
    : 0;

  // Calculate usage percentages for DCA section
  const aiUsagePerc =
    usage?.maxTheoreticalUsage && usage?.avgRealUsage
      ? (usage.avgRealUsage / usage.maxTheoreticalUsage) * 100
      : 0;

  const actualRatioPerc =
    usage?.maxTheoreticalUsage && usage?.maxRealUsage
      ? (usage.maxRealUsage / usage.maxTheoreticalUsage) * 100
      : 0;

  return (
    <div className="w-full h-full overflow-auto p-md">
      <MasonryLayout
        gap={16}
        containerBreakpoints={{ default: 1, 640: 2, 1024: 3 }}
      >
        {/* Full Settings Section */}
        <StatsSection title="Full Settings">
          <div className="space-y-xs">
            <StatItem
              label="Exchange"
              value={backtest.exchange?.toUpperCase() || 'N/A'}
            />
            <StatItem
              label="Pair"
              value={resolvedSettings?.pair?.[0] || backtest.symbol || 'N/A'}
            />
            <StatItem
              label="Strategy"
              value={resolvedSettings?.strategy || 'N/A'}
            />
            <StatItem
              label="Profit currency"
              value={resolvedSettings?.profitCurrency || 'N/A'}
            />
            <StatItem
              label="Deal start condition"
              value={resolvedSettings?.startCondition || 'N/A'}
            />
            <StatItem
              label="Max number of open deals"
              value={resolvedSettings?.maxNumberOfOpenDeals || 'N/A'}
            />
            <StatItem label="DCA/Grid settings" value={dcaDescription} />
            <StatItem label="Take Profit" value={tpDescription} />
            <StatItem label="Stop Loss" value={slDescription} />
          </div>
        </StatsSection>

        {/* General Section */}
        <StatsSection title="General" icon={Activity}>
          <div className="space-y-xs">
            <StatItemWithChip
              label="Net result"
              value={financial?.netProfitTotalPerc}
              additionalText={`${formatBase(financial?.netProfitTotal, profitSign)} (${formatUSD(financial?.netProfitTotalUsd)})`}
            />
            <StatItemWithChip
              label="Avg daily return"
              value={financial?.avgNetDailyPerc}
              additionalText={`${formatBase(financial?.avgNetDaily, profitSign)} (${formatUSD(financial?.avgNetDailyUsd)})`}
            />
            <StatItemWithChip
              label="Annualized return"
              value={financial?.annualizedReturn}
            />
            <StatItem
              label="Total deals (Profit:Losers:Open)"
              value={`${numerical?.all || 0} (${numerical?.profit || 0}:${numerical?.loss || 0}:${numerical?.open || 0})`}
            />
            <StatItem
              label="Max deal duration"
              value={formatDuration(duration?.maxDealDuration)}
            />
            <StatItem
              label="Deals/day"
              value={
                numerical?.dealsPerDay !== undefined &&
                numerical?.dealsPerDay !== null
                  ? numerical.dealsPerDay.toFixed(1)
                  : '0.0'
              }
            />
            <StatItemWithChip
              label="Open P&L"
              value={financial?.unrealizedPnLPerc}
              additionalText={`${formatBase(financial?.unrealizedPnL, profitSign)} (${formatUSD(financial?.unrealizedPnLUsd)})`}
            />
            <StatItem
              label="Testing period"
              value={`from ${testingPeriodFrom} to ${testingPeriodTo}`}
            />
            <StatItem
              label="Testing period name"
              value={duration?.periodName || 'auto'}
            />
            <StatItem
              label="Bot working time"
              value={formatDuration(duration?.botWorkingTime)}
            />
            <StatItem label="Time frame" value={backtest.interval || 'N/A'} />
            <StatItem label="Backtest timing" value={backtestTiming} />
            <StatItem
              label="Timestamp"
              value={new Date(backtest.time).toLocaleString()}
            />
          </div>
        </StatsSection>

        {/* Winners Section */}
        <StatsSection title="Winners" icon={TrendingUp}>
          <div className="space-y-xs">
            <StatItem label="№" value={numerical?.profit || 0} />
            <StatItemWithChip label="Win, %" value={winPercentage} />
            <StatItemWithChip
              label="Gross profit"
              value={financial?.grossProfitPerc}
              additionalText={`${formatBase(financial?.grossProfit, profitSign)} (${formatUSD(financial?.grossProfitUsd)})`}
            />
            <StatItemWithChip
              label="Avg net profit"
              value={financial?.avgNetProfitPerc}
              additionalText={`${formatBase(financial?.avgNetProfit, profitSign)} (${formatUSD(financial?.avgNetProfitUsd)})`}
            />
            <StatItemWithChip
              label="Max deal profit"
              value={financial?.maxDealProfitPerc}
              additionalText={`${formatBase(financial?.maxDealProfit, profitSign)} (${formatUSD(financial?.maxDealProfitUsd)})`}
            />
            <StatItemWithChip
              label="Avg deal profit"
              value={financial?.avgGrossProfitPerc}
              additionalText={`${formatBase(financial?.avgGrossProfit, profitSign)} (${formatUSD(financial?.avgGrossProfitUsd)})`}
            />
            <StatItemWithChip
              label="Max Run-Up"
              value={financial?.maxRunUpPerc}
              additionalText={`${formatBase(financial?.maxRunUp, profitSign)} (${formatUSD(financial?.maxRunUpUsd)})`}
            />
            <StatItem
              label="Max Consecutive Wins"
              value={numerical?.maxConsecutiveWins || 0}
            />
            <StatItem
              label="Average winning trade duration"
              value={formatDurationFromMs(duration?.avgWinningTrade)}
            />
            <StatItem
              label="Max winning trade duration"
              value={formatDurationFromMs(duration?.maxWinningTrade)}
            />
            <StatItem
              label="Standard deviation of positive returns"
              value={formatPercent(financial?.stDevWinningTrade)}
            />
          </div>
        </StatsSection>

        {/* Losers Section */}
        <StatsSection title="Losers" icon={TrendingDown}>
          <div className="space-y-xs">
            <StatItem label="№" value={numerical?.loss || 0} />
            <StatItemWithChip
              label="Gross loss"
              value={financial?.grossLossPerc}
              additionalText={`${formatBase(financial?.grossLoss, profitSign)} (${formatUSD(financial?.grossLossUsd)})`}
            />
            <StatItemWithChip
              label="Max deal loss"
              value={financial?.maxDealLossPerc}
              additionalText={`${formatBase(financial?.maxDealLoss, profitSign)} (${formatUSD(financial?.maxDealLossUsd)})`}
            />
            <StatItemWithChip
              label="Avg Equity DD"
              value={financial?.maxDrawDownEquityPerc}
              additionalText={formatUSD(financial?.maxDrawDownEquityUsd)}
            />
            <StatItem
              label="Max Consecutive losses"
              value={numerical?.maxConsecutiveLosses || 0}
            />
            <StatItemWithChip
              label="Max Drawdown"
              value={financial?.maxDrawDownPerc}
              additionalText={`${formatBase(financial?.maxDrawDown, profitSign)} (${formatUSD(financial?.maxDrawDownUsd)})`}
            />
            <StatItem
              label="Average losing trade duration"
              value={formatDurationFromMs(duration?.avgLosingTrade)}
            />
            <StatItem
              label="Max losing trade duration"
              value={formatDurationFromMs(duration?.maxLosingTrade)}
            />
            <StatItem
              label="Standard deviation of negative returns"
              value={formatPercent(financial?.stDevLosingTrade)}
            />
            <StatItem
              label="Standard deviation of the downside"
              value={formatPercent(financial?.stDownDevLosingTrade)}
            />
          </div>
        </StatsSection>

        {/* Performance Ratios Section */}
        <StatsSection title="Performance Ratios" icon={Target}>
          <div className="space-y-xs">
            <StatItem
              label="Profit Factor"
              value={
                ratios?.profitFactor === null
                  ? 'infinity'
                  : ratios?.profitFactor !== undefined &&
                      ratios?.profitFactor !== null
                    ? ratios.profitFactor.toFixed(3)
                    : 'N/A'
              }
            />
            <StatItem
              label="Sharpe Ratio"
              value={
                ratios?.sharpe !== undefined && ratios?.sharpe !== null
                  ? ratios.sharpe.toString()
                  : 'N/A'
              }
            />
            <StatItem
              label="Sortino Ratio"
              value={
                ratios?.sortino !== undefined && ratios?.sortino !== null
                  ? ratios.sortino.toString()
                  : 'N/A'
              }
            />
            <StatItem
              label="Consistency-Weighted Return"
              value={
                ratios?.cwr !== undefined && ratios?.cwr !== null
                  ? ratios.cwr.toFixed(4)
                  : 'N/A'
              }
            />
            <StatItemWithChip
              label="Buy-and-Hold Return"
              value={ratios?.buyAndHold?.perc}
              additionalText={`${formatBase(ratios?.buyAndHold?.value, profitSign)} (${formatUSD(ratios?.buyAndHold?.valueUsd)})`}
            />
          </div>
        </StatsSection>

        {/* DCA Usage Section */}
        <StatsSection title="DCA Usage" icon={Percent}>
          <div className="space-y-xs">
            <StatItem
              label="Av. Usage. Usage"
              value={formatPercent(aiUsagePerc)}
            />
            <StatItem
              label="Actual ratio"
              value={formatPercent(actualRatioPerc)}
            />
            <StatItem
              label="Max theoretical usage"
              value={formatBase(usage?.maxTheoreticalUsage, profitSign)}
            />
            <StatItem
              label="Actual max usage"
              value={formatBase(usage?.maxRealUsage, profitSign)}
            />
            <StatItem
              label="Avg deal usage"
              value={formatBase(usage?.avgRealUsage, profitSign)}
            />
            <StatItem
              label="Max DCA orders trigger"
              value={numerical?.maxDCATriggered || 0}
            />
            <StatItem
              label="Av. DCA orders trigger"
              value={numerical?.avgDCATriggered || 0}
            />
            <StatItem
              label="Covered Price deviation"
              value={formatPercent(numerical?.coveredPriceDeviation)}
            />
            <StatItem
              label="Used Price deviation"
              value={formatPercent(numerical?.actualPriceDeviation)}
            />
            <StatItem
              label="Actual Price deviation"
              value={formatPercent(numerical?.priceDeviation)}
            />
          </div>
        </StatsSection>
      </MasonryLayout>
    </div>
  );
};
