import { Card } from '@/components/ui/card';
import { formatFiat, holdingToReporting } from '@/utils/reportingCurrency';
import { ProfitLossPercChip } from '@/components/ui/chip';
import { MasonryLayout } from '@/components/ui/MasonryLayout';
import { math } from '@/lib/utils/math';
import { removePaperPrefix } from '@/utils/exchangeUtils';
import type { GRIDBacktestingResultHistory, SplitTime } from '@/types';
import { Activity, BarChart3, TrendingUp, Wallet } from 'lucide-react';
import React, { useMemo } from 'react';

interface GridBacktestStatsTabProps {
  backtest: GRIDBacktestingResultHistory;
}

interface StatItemProps {
  label: string;
  value: string | number | React.ReactNode;
  valueClassName?: string;
}

const StatItem: React.FC<StatItemProps> = ({
  label,
  value,
  valueClassName,
}) => (
  <div className="flex items-start justify-between gap-sm">
    <span className="text-sm text-muted-foreground">{label}</span>
    <span
      className={`text-sm font-medium text-right ${valueClassName || 'text-foreground'}`}
    >
      {value}
    </span>
  </div>
);

interface StatItemWithChipProps {
  label: string;
  value: number | null | undefined;
  additionalText?: string;
}

const StatItemWithChip: React.FC<StatItemWithChipProps> = ({
  label,
  value,
  additionalText,
}) => (
  <div className="flex items-start justify-between gap-sm">
    <span className="text-sm text-muted-foreground">{label}</span>
    <div className="flex items-center gap-xs">
      {additionalText && (
        <span className="text-sm font-medium text-foreground">
          {additionalText}
        </span>
      )}
      {value !== null && value !== undefined && Number.isFinite(value) && (
        <ProfitLossPercChip value={value} size="xs" showSign={false} />
      )}
    </div>
  </div>
);

interface StatsSectionProps {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}

const StatsSection: React.FC<StatsSectionProps> = ({
  title,
  icon: Icon,
  children,
}) => (
  <Card position={2} className="p-md">
    <div className="flex items-center gap-xs mb-4">
      {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    </div>
    {children}
  </Card>
);

/**
 * A USD twin in the reporting currency. With its asset figure: when that
 * asset already is the reporting currency, the figure itself is shown.
 */
const formatUsd = (
  value: number | string | undefined | null,
  asset?: string,
  amount?: number | string | null
) => {
  if (value === undefined || value === null) return formatFiat(0);
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(num)) return formatFiat(0);
  const face = amount === undefined || amount === null ? NaN : +amount;
  return formatFiat(
    holdingToReporting(asset, Number.isFinite(face) ? face : num, num)
  );
};

const formatDuration = (duration: SplitTime | undefined) => {
  if (!duration) return '-';
  const parts: string[] = [];
  const d = parseInt(String(duration.d || '0'));
  const h = parseInt(String(duration.h || '0'));
  const min = parseInt(String(duration.min || '0'));
  const s = parseInt(String(duration.s || '0'));
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (min) parts.push(`${min}m`);
  if (!parts.length && s) parts.push(`${s}s`);
  return parts.join(' ') || '0s';
};

const intervalMap: Record<string, string> = {
  '1m': '1 minute',
  '3m': '3 minutes',
  '5m': '5 minutes',
  '15m': '15 minutes',
  '30m': '30 minutes',
  '1h': '1 hour',
  '2h': '2 hours',
  '4h': '4 hours',
  '8h': '8 hours',
  '1d': '1 day',
  '1w': '1 week',
};

export const GridBacktestStatsTab: React.FC<GridBacktestStatsTabProps> = ({
  backtest,
}) => {
  const { financial, duration, numerical, ratios, settings, position } =
    backtest;
  const baseAsset = backtest.baseAsset ?? '';
  const quoteAsset = backtest.quoteAsset ?? '';

  const profitSign = useMemo(() => {
    if (settings?.futures) return settings.coinm ? baseAsset : quoteAsset;
    return settings?.profitCurrency === 'base' ? baseAsset : quoteAsset;
  }, [settings, baseAsset, quoteAsset]);

  const budgetUsd = financial?.budgetUsd ?? 0;

  const netPerc =
    budgetUsd !== 0
      ? math.round(((financial?.profitTotalUsd ?? 0) / budgetUsd) * 100)
      : 0;

  const avgDailyPerc =
    budgetUsd !== 0
      ? math.round((+(financial?.avgNetDailyUsd ?? 0) / budgetUsd) * 100)
      : 0;

  const valueChangePerc =
    (financial?.initialBalancesUsd ?? 0) !== 0
      ? math.round(
          ((financial?.valueChangeUsd ?? 0) /
            (financial?.initialBalancesUsd ?? 1)) *
            100
        )
      : 0;

  const testingPeriodFrom = duration?.firstDataTime
    ? new Date(duration.firstDataTime).toLocaleString()
    : 'N/A';
  const testingPeriodTo = duration?.lastDataTime
    ? new Date(duration.lastDataTime).toLocaleString()
    : 'N/A';

  const backtestTiming = `load data - ${duration?.loadingDataTime || 0} s, process data - ${duration?.processingDataTime || 0} s`;

  return (
    <div className="w-full h-full overflow-auto p-md">
      <MasonryLayout
        gap={16}
        containerBreakpoints={{ default: 1, 640: 2, 1024: 3 }}
      >
        {/* Full Settings */}
        <StatsSection title="Full Settings">
          <div className="space-y-xs">
            <StatItem
              label="Exchange"
              value={
                backtest.exchange
                  ? removePaperPrefix(backtest.exchange).toUpperCase()
                  : 'N/A'
              }
            />
            <StatItem
              label="Symbol"
              value={(settings?.pair ?? backtest.symbol) || 'N/A'}
            />
            {settings?.futures && (
              <>
                <StatItem
                  label="Leverage"
                  value={
                    settings.marginType !==
                    ('inherit' as typeof settings.marginType)
                      ? (settings.leverage ?? 1)
                      : 1
                  }
                />
                <StatItem
                  label="Margin type"
                  value={String(settings.marginType ?? 'inherit')}
                />
              </>
            )}
            <StatItem
              label="Strategy"
              value={
                settings?.futures
                  ? (settings.futuresStrategy ?? 'NEUTRAL')
                      .toString()
                      .toUpperCase()
                  : (settings?.strategy ?? 'LONG').toString().toLowerCase()
              }
            />
            {!settings?.futures && (
              <>
                <StatItem
                  label="Profit currency"
                  value={String(settings?.profitCurrency ?? '-').toLowerCase()}
                />
                <StatItem
                  label="Order fixed in"
                  value={String(settings?.orderFixedIn ?? '-').toLowerCase()}
                />
              </>
            )}
            <StatItem label="Grid type" value={settings?.gridType ?? '-'} />
            <StatItem
              label="Levels"
              value={`${settings?.levels ?? '-'} (top: ${settings?.topPrice ?? '-'} / low: ${settings?.lowPrice ?? '-'})`}
            />
            {settings?.gridType === 'geometric' && (
              <StatItem
                label="Grid step"
                value={`${math.round(+(settings?.gridStep ?? 0), 5)}%`}
              />
            )}
            <StatItem
              label="Sell displacement"
              value={`${math.round(+(settings?.sellDisplacement ?? 0), 5)}%`}
            />
            <StatItem
              label="Budget"
              value={`${settings?.budget ?? '-'} ${settings?.coinm ? baseAsset : quoteAsset}`}
            />
            {settings?.useOrderInAdvance && (
              <StatItem
                label="Smart Orders"
                value={settings.ordersInAdvance ?? '-'}
              />
            )}
            <StatItem
              label="Take Profit"
              value={
                settings?.tpSl
                  ? `${
                      settings.tpSlCondition === 'priceReached'
                        ? `price ${settings.tpTopPrice} ${quoteAsset}`
                        : `${+(settings.tpPerc ?? '0')}%`
                    }`
                  : 'Not used'
              }
            />
            <StatItem
              label="Stop Loss"
              value={
                settings?.sl
                  ? `${
                      settings.slCondition === 'priceReached'
                        ? `price ${settings.slLowPrice} ${quoteAsset}`
                        : `${+(settings.slPerc ?? '0')}%`
                    }`
                  : 'Not used'
              }
            />
          </div>
        </StatsSection>

        {/* General */}
        <StatsSection title="General" icon={Activity}>
          <div className="space-y-xs">
            <StatItem label="Budget" value={formatUsd(budgetUsd)} />
            <StatItemWithChip
              label="Net result"
              value={netPerc}
              additionalText={`${financial?.profitTotal ?? 0} ${profitSign} (${formatUsd(financial?.profitTotalUsd, profitSign, financial?.profitTotal)})`}
            />
            <StatItemWithChip
              label="Avg daily return"
              value={avgDailyPerc}
              additionalText={`${financial?.avgNetDaily ?? 0} ${profitSign} (${formatUsd(financial?.avgNetDailyUsd, profitSign, financial?.avgNetDaily)})`}
            />
            {financial?.annualizedReturn != null && (
              <StatItemWithChip
                label="Annualized return"
                value={financial.annualizedReturn}
              />
            )}
            <StatItem
              label="Total transactions"
              value={`${numerical?.all ?? 0} (▼${numerical?.sell ?? 0} / ▲${numerical?.buy ?? 0})`}
            />
            <StatItem
              label="Transactions/day"
              value={numerical?.transactionsPerDay ?? 0}
            />
            <StatItem
              label="Testing period"
              value={`from ${testingPeriodFrom} to ${testingPeriodTo}`}
            />
            <StatItem
              label="Period name"
              value={
                backtest.shared &&
                !['auto', 'custom'].includes(duration?.periodName ?? '')
                  ? 'custom'
                  : (duration?.periodName ?? 'auto')
              }
            />
            <StatItem
              label="Bot working time"
              value={formatDuration(duration?.botWorkingTime)}
            />
            <StatItem
              label="Interval"
              value={
                backtest.interval
                  ? (intervalMap[backtest.interval as string] ??
                    (backtest.interval as string))
                  : 'N/A'
              }
            />
            <StatItem label="Backtest timing" value={backtestTiming} />
            {backtest.time && (
              <StatItem
                label="Timestamp"
                value={new Date(backtest.time).toLocaleString()}
              />
            )}
          </div>
        </StatsSection>

        {/* Financial */}
        <StatsSection title="Financial" icon={Wallet}>
          <div className="space-y-xs">
            <StatItem
              label="Initial balances"
              value={`${financial?.initialBalances ?? 0} ${profitSign} (${formatUsd(financial?.initialBalancesUsd, profitSign, financial?.initialBalances)})`}
            />
            {!settings?.futures && financial?.initialBalancesByAsset && (
              <>
                <StatItem
                  label="  base"
                  value={`${financial.initialBalancesByAsset.base} ${baseAsset}`}
                />
                <StatItem
                  label="  quote"
                  value={`${financial.initialBalancesByAsset.quote} ${quoteAsset}`}
                />
              </>
            )}
            <StatItem
              label="Initial price"
              value={`${financial?.startPrice ?? '-'} ${quoteAsset}`}
            />
            <StatItem
              label="Current balances"
              value={`${financial?.currentBalances ?? 0} ${profitSign} (${formatUsd(financial?.currentBalancesUsd, profitSign, financial?.currentBalances)})`}
            />
            {!settings?.futures && financial?.currentBalancesByAsset && (
              <>
                <StatItem
                  label="  base"
                  value={`${financial.currentBalancesByAsset.base} ${baseAsset}`}
                />
                <StatItem
                  label="  quote"
                  value={`${financial.currentBalancesByAsset.quote} ${quoteAsset}`}
                />
              </>
            )}
            <StatItem
              label="Last price"
              value={`${financial?.lastPrice ?? '-'} ${quoteAsset}`}
            />
            <StatItemWithChip
              label="Value change"
              value={valueChangePerc}
              additionalText={`${financial?.valueChange ?? 0} ${profitSign} (${formatUsd(financial?.valueChangeUsd, profitSign, financial?.valueChange)})`}
            />
            {!settings?.futures && (
              <StatItem
                label="Breakeven price"
                value={`${financial?.breakevenPrice ?? '-'} ${quoteAsset}`}
              />
            )}
          </div>
        </StatsSection>

        {/* Performance Ratios */}
        <StatsSection title="Performance Ratios" icon={BarChart3}>
          <div className="space-y-xs">
            <StatItem
              label="Sharpe Ratio"
              value={
                typeof ratios?.sharpe === 'number'
                  ? ratios.sharpe.toFixed(3)
                  : '-'
              }
            />
            <StatItem
              label="Sortino Ratio"
              value={
                typeof ratios?.sortino === 'number'
                  ? ratios.sortino.toFixed(3)
                  : '-'
              }
            />
            {!settings?.futures && ratios?.buyAndHold && (
              <StatItemWithChip
                label="Buy-and-hold Return"
                value={ratios.buyAndHold.perc}
                additionalText={`${ratios.buyAndHold.value} ${quoteAsset} (${formatUsd(ratios.buyAndHold.valueUsd, quoteAsset, ratios.buyAndHold.value)})`}
              />
            )}
          </div>
        </StatsSection>

        {/* Position (futures) */}
        {settings?.futures && (
          <StatsSection title="Position" icon={TrendingUp}>
            <div className="space-y-xs">
              <StatItem label="Closed positions" value={position?.count ?? 0} />
              <StatItem
                label="Open qty"
                value={
                  typeof position?.qty === 'number'
                    ? `${position.qty.toFixed(6)} ${baseAsset}`
                    : '0'
                }
              />
              <StatItem
                label="Avg price"
                value={
                  typeof position?.price === 'number'
                    ? `${math.round(position.price, 8)} ${quoteAsset}`
                    : '0'
                }
              />
              <StatItem label="Side" value={position?.side ?? '-'} />
              <StatItemWithChip
                label="PnL"
                value={position?.pnl?.perc ?? 0}
                additionalText={formatUsd(position?.pnl?.value)}
              />
            </div>
          </StatsSection>
        )}
      </MasonryLayout>
    </div>
  );
};
