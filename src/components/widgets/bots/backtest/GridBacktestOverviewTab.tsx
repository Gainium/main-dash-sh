import { useMemo } from 'react';
import { formatFiat, holdingToReporting } from '@/utils/reportingCurrency';

import { Card } from '@/components/ui/card';
import { ProfitLossPercChip } from '@/components/ui/chip';
import { MasonryLayout } from '@/components/ui/MasonryLayout';
import { math } from '@/lib/utils/math';
import type {
  BotMarginTypeEnum,
  FuturesStrategyEnum,
  GRIDBacktestingResultHistory,
  SplitTime,
  StrategyEnum,
} from '@/types';
import { removePaperPrefix } from '@/utils/exchangeUtils';

/* ────────────────────── helpers ────────────────────── */

interface GridBacktestOverviewTabProps {
  backtest: GRIDBacktestingResultHistory;
}

/**
 * A USD twin in the reporting currency. With its asset figure: when that
 * asset already is the reporting currency, the figure itself is shown.
 */
const formatUsd = (
  value: number | string | undefined | null,
  asset?: string,
  amount?: number | string | null
) => {
  if (value === undefined || value === null) return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(num)) return '-';
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

/* ────────────────────── Stat row components ────────────────────── */

interface StatItemProps {
  label: string;
  value: React.ReactNode;
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

/* ────────────────────── Main component ────────────────────── */

export function GridBacktestOverviewTab({
  backtest,
}: GridBacktestOverviewTabProps) {
  const { financial, numerical, duration, settings, position } = backtest;
  const baseAsset = backtest.baseAsset ?? '';
  const quoteAsset = backtest.quoteAsset ?? '';

  /** Determine the profit/display currency */
  const profitSign = useMemo(() => {
    if (settings?.futures) {
      return settings.coinm ? baseAsset : quoteAsset;
    }
    return settings?.profitCurrency === 'base' ? baseAsset : quoteAsset;
  }, [settings, baseAsset, quoteAsset]);

  const budgetUsd = financial?.budgetUsd ?? 0;

  /** Percent helpers derived from USD values */
  const netPerc =
    budgetUsd !== 0
      ? math.round(((financial?.profitTotalUsd ?? 0) / budgetUsd) * 100)
      : 0;

  const avgDailyPerc =
    budgetUsd !== 0
      ? math.round((+(financial?.avgNetDailyUsd ?? 0) / budgetUsd) * 100)
      : 0;

  const avgTxnProfitPerc =
    budgetUsd !== 0
      ? math.round(
          (+(financial?.avgTransactionProfitUsd ?? 0) / budgetUsd) * 100,
          2,
          false,
          true
        )
      : 0;

  const valueChangePerc =
    (financial?.initialBalancesUsd ?? 0) !== 0
      ? math.round(
          ((financial?.valueChangeUsd ?? 0) /
            (financial?.initialBalancesUsd ?? 1)) *
            100
        )
      : 0;

  return (
    <div className="h-full w-full overflow-auto p-md">
      <MasonryLayout
        gap={16}
        containerBreakpoints={{ default: 1, 640: 2, 1024: 3, 1280: 4 }}
      >
        {/* ── Full Settings ── */}
        <Card position={2} className="p-md">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Full Settings
          </h3>
          <div className="space-y-xs">
            {backtest.exchange && (
              <StatItem
                label="Exchange"
                value={removePaperPrefix(backtest.exchange).toUpperCase()}
              />
            )}
            <StatItem
              label="Pair"
              value={settings?.pair ?? backtest.symbol ?? '-'}
            />
            {settings?.futures && (
              <>
                <StatItem
                  label="Leverage"
                  value={
                    settings.marginType !== ('inherit' as BotMarginTypeEnum)
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
                  ? (
                      (settings.futuresStrategy as FuturesStrategyEnum) ??
                      'NEUTRAL'
                    ).toUpperCase()
                  : (
                      (settings?.strategy as StrategyEnum) ?? 'LONG'
                    ).toLowerCase()
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
            {settings?.useStartPrice && (
              <StatItem
                label="Start price"
                value={`${settings.startPrice} ${quoteAsset}`}
              />
            )}
            <StatItem
              label="Config"
              value={`${settings?.levels ?? '-'} levels, top ${settings?.topPrice ?? '-'} / low ${settings?.lowPrice ?? '-'} ${quoteAsset}${
                settings?.gridType === 'geometric'
                  ? `, step ${math.round(+String(settings?.gridStep ?? 0), 5)}%`
                  : ''
              }`}
            />
            <StatItem label="Grid type" value={settings?.gridType ?? '-'} />
            <StatItem
              label="Sell displacement"
              value={`${math.round(+String(settings?.sellDisplacement ?? 0), 5)}%`}
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
                    } (${settings.tpSlAction ?? 'stop'})`
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
                    } (${settings.slAction ?? 'stop'})`
                  : 'Not used'
              }
            />
          </div>
        </Card>

        {/* ── General ── */}
        <Card position={2} className="p-md">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            General
          </h3>
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
            <StatItemWithChip
              label="Avg transaction profit"
              value={avgTxnProfitPerc}
              additionalText={`${financial?.avgTransactionProfit ?? 0} ${profitSign} (${formatUsd(financial?.avgTransactionProfitUsd, profitSign, financial?.avgTransactionProfit)})`}
            />
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
              value={
                duration?.firstDataTime && duration?.lastDataTime
                  ? `${new Date(duration.firstDataTime).toLocaleString()} → ${new Date(duration.lastDataTime).toLocaleString()}`
                  : '-'
              }
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
            {backtest.interval && (
              <StatItem
                label="Time Frame"
                value={
                  intervalMap[backtest.interval as string] ??
                  (backtest.interval as string)
                }
              />
            )}
            <StatItem
              label="Backtest timing"
              value={`load ${duration?.loadingDataTime ?? 0}s, process ${duration?.processingDataTime ?? 0}s`}
            />
            {backtest.time && (
              <StatItem
                label="Timestamp"
                value={new Date(backtest.time).toLocaleString()}
              />
            )}
          </div>
        </Card>

        {/* ── Financial ── */}
        <Card position={2} className="p-md">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Financial
          </h3>
          <div className="space-y-xs">
            <StatItem
              label="Initial balances"
              value={`${financial?.initialBalances ?? 0} ${profitSign} (${formatUsd(financial?.initialBalancesUsd, profitSign, financial?.initialBalances)})`}
            />
            {!settings?.futures && financial?.initialBalancesByAsset && (
              <StatItem
                label=""
                value={`base: ${financial.initialBalancesByAsset.base} ${baseAsset} / quote: ${financial.initialBalancesByAsset.quote} ${quoteAsset}`}
              />
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
              <StatItem
                label=""
                value={`base: ${financial.currentBalancesByAsset.base} ${baseAsset} / quote: ${financial.currentBalancesByAsset.quote} ${quoteAsset}`}
              />
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
            {settings?.futures && (
              <>
                <StatItem
                  label="Closed positions"
                  value={position?.count ?? 0}
                />
                {(position?.qty ?? 0) > 0 && (
                  <>
                    <StatItem
                      label="Open position side"
                      value={position?.side ?? '-'}
                    />
                    <StatItem
                      label="Open position entry"
                      value={`${math.round(position?.price ?? 0, 8)} ${quoteAsset}`}
                    />
                    <StatItem
                      label="Open position qty"
                      value={`${position?.qty ?? 0} ${baseAsset}`}
                    />
                    <StatItemWithChip
                      label="Open position PnL"
                      value={position?.pnl?.perc ?? 0}
                      additionalText={`${position?.pnl?.value ?? 0} ${settings.coinm ? baseAsset : quoteAsset}`}
                    />
                  </>
                )}
              </>
            )}
          </div>
        </Card>

        {/* ── Performance Ratios ── */}
        <Card position={2} className="p-md">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Performance Ratios
          </h3>
          <div className="space-y-xs">
            <StatItem
              label="Sharpe Ratio"
              value={
                typeof backtest.ratios?.sharpe === 'number'
                  ? backtest.ratios.sharpe.toFixed(3)
                  : '-'
              }
            />
            <StatItem
              label="Sortino Ratio"
              value={
                typeof backtest.ratios?.sortino === 'number'
                  ? backtest.ratios.sortino.toFixed(3)
                  : '-'
              }
            />
            {!settings?.futures && backtest.ratios?.buyAndHold && (
              <StatItemWithChip
                label="Buy-and-hold Return"
                value={backtest.ratios.buyAndHold.perc}
                additionalText={`${backtest.ratios.buyAndHold.value ?? 0} ${quoteAsset} (${formatUsd(backtest.ratios.buyAndHold.valueUsd, quoteAsset, backtest.ratios.buyAndHold.value)})`}
              />
            )}
          </div>
        </Card>
      </MasonryLayout>
    </div>
  );
}
