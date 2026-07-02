import { Card } from '@/components/ui/card';
import { Donut, type DonutDataItem } from '@/components/ui/charts/Donut';
import type { DCABacktestingResultHistory } from '@/types';
import { useMemo /* , useState, useEffect */ } from 'react';
import {
  BacktestGreyMetricCard,
  BacktestMetricCard,
} from './BacktestMetricCard';
/* import { getCssVarAsHslString } from '@/lib/colorUtils'; */
import CustomTooltip from '@/components/charts/CustomTooltip';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface BacktestOverviewTabProps {
  backtest: DCABacktestingResultHistory;
}

const formatUsd = (value: number | undefined | null) => {
  if (value === undefined || value === null) return '-';
  return `$${value.toFixed(2)}`;
};

const formatPercent = (value: number | undefined | null) => {
  if (value === undefined || value === null) return '-';
  return `${value.toFixed(2)}%`;
};

const toDate = (value: number | string): Date | null => {
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

const formatDateRange = (from?: number | string, to?: number | string) => {
  if (from === undefined || to === undefined) return '-';
  const fromDate = toDate(from);
  const toDateValue = toDate(to);
  if (!fromDate || !toDateValue) return '-';
  return `${fromDate.toLocaleString()} → ${toDateValue.toLocaleString()}`;
};

const formatDuration = (time?: {
  d: string;
  h: string;
  min: string;
  s: string;
}) => {
  if (!time) return '-';
  if (time.s !== '') return `${time.s}S`;
  return `${time.d !== '' ? `${time.d}D ` : ''}${time.h !== '' ? `${time.h}H ` : ''}${time.min || 0}MIN`;
};

export function BacktestOverviewTab({ backtest }: BacktestOverviewTabProps) {
  const netUsd = backtest.financial?.netProfitTotalUsd;
  const netPerc = backtest.financial?.netProfitTotalPerc;

  const dealsAll = backtest.numerical?.all;
  const dealsProfit = backtest.numerical?.profit;
  const dealsLoss = backtest.numerical?.loss;
  const dealsOpen = backtest.numerical?.open ?? 0;

  const profitFactor = backtest.ratios?.profitFactor;
  const winRate =
    dealsAll && dealsProfit
      ? ((dealsProfit / dealsAll) * 100).toFixed(2)
      : '0.00';

  // Compute real HSL strings from OKLCH theme vars at runtime
  /* const [chartColors, setChartColors] = useState({
    profit: 'hsl(0 0% 50%)',
    loss: 'hsl(0 0% 50%)',
    muted: 'hsl(0 0% 50%)',
    warning: 'hsl(0 0% 50%)',
    buyHold: 'hsl(0 0% 50%)',
  }); */

  /* useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      setChartColors({
        profit: getCssVarAsHslString('--color-profit'),
        loss: getCssVarAsHslString('--color-loss'),
        muted: getCssVarAsHslString('--color-muted-foreground'),
        warning: getCssVarAsHslString('--color-warning'),
        buyHold: getCssVarAsHslString('--color-chart-2'),
      });
    } catch {
      // Keep defaults on failure
    }
  }, []); */

  // Prefer direct CSS vars (works like other charts). Keep HSL fallbacks in `chartColors`.
  const profitCss = 'var(--color-profit)';
  const lossCss = 'var(--color-loss)';
  // Use chart-3 (blue) for buy & hold to match legacy
  const buyHoldCss = 'var(--color-chart-3)';

  // Determine final outcome (use USD if available) and choose stroke color
  const finalProfitValue =
    backtest.financial?.netProfitTotalUsd ??
    backtest.financial?.netProfitTotal ??
    0;
  const equityStroke = finalProfitValue >= 0 ? profitCss : lossCss;

  // Prepare donut data with actual color values
  const winRateDonutData: DonutDataItem[] = useMemo(
    () => [
      { name: 'Profit', value: dealsProfit ?? 0, color: profitCss },
      { name: 'Loss', value: dealsLoss ?? 0, color: lossCss },
      ...(dealsOpen > 0
        ? [
            {
              name: 'Open',
              value: dealsOpen,
              color: 'var(--color-muted-foreground)',
            },
          ]
        : []),
    ],
    [
      dealsProfit,
      dealsLoss,
      dealsOpen /* , chartColors.profit, chartColors.loss, chartColors.muted */,
    ]
  );

  const profitFactorDonutData: DonutDataItem[] = useMemo(
    () => [
      {
        name: 'Profit',
        value: backtest.financial?.grossProfitPerc ?? 0,
        color: profitCss,
      },
      {
        name: 'Loss',
        value: Math.abs(backtest.financial?.grossLossPerc ?? 0),
        color: lossCss,
      },
    ],
    [
      backtest.financial?.grossProfitPerc,
      backtest.financial
        ?.grossLossPerc /* , chartColors.profit, chartColors.loss */,
    ]
  );

  // Prepare equity curve data by merging portfolio (equity) and buy & hold series
  const equityData = useMemo(() => {
    // Build unified timeline of times from portfolio and buy&hold series
    const times = new Set<number>();
    (backtest.portfolio ?? []).forEach((p) => times.add(p.x));
    (backtest.buyAndHoldEquity ?? []).forEach((p) => times.add(p.time));

    const timesArr = Array.from(times).sort((a, b) => a - b);

    const portfolioMap = new Map<number, number>(
      (backtest.portfolio ?? []).map((p) => [p.x, p.y])
    );
    const bnhMap = new Map<number, number>(
      (backtest.buyAndHoldEquity ?? []).map((p) => [p.time, p.value])
    );

    // Start fill values from initial balance if available, else first known point or 0
    let lastEquity =
      backtest.financial?.initialBalanceUsd ??
      (backtest.portfolio && backtest.portfolio.length
        ? backtest.portfolio[0].y
        : 0);
    let lastBnH =
      backtest.buyAndHoldEquity && backtest.buyAndHoldEquity.length
        ? backtest.buyAndHoldEquity[0].value
        : undefined;

    const result: { time: number; equity: number; buyAndHold?: number }[] = [];
    for (const t of timesArr) {
      if (portfolioMap.has(t)) {
        lastEquity = portfolioMap.get(t) as number;
      }
      if (bnhMap.has(t)) {
        lastBnH = bnhMap.get(t) as number;
      }

      // Ensure continuous equity line by forward-filling last known value
      result.push({ time: t, equity: lastEquity, buyAndHold: lastBnH });
    }

    return result;
  }, [
    backtest.portfolio,
    backtest.buyAndHoldEquity,
    backtest.financial?.initialBalanceUsd,
  ]);

  // Prepare scatter data for P&L by deal
  const scatterData = useMemo(() => {
    if (!backtest.deals) return [];
    return backtest.deals
      .filter((deal) => typeof deal.profit?.perc === 'number')
      .map((deal) => ({
        x: deal.closedTime ?? deal.startTime,
        y: deal.profit?.perc ?? 0,
      }))
      .filter((d) => typeof d.x === 'number');
  }, [backtest.deals]);

  return (
    <div className="h-full w-full overflow-auto p-md">
      <div className="grid grid-cols-12 gap-xs">
        {/* Left side: metrics and donuts */}
        <div className="col-span-12 lg:col-span-7 space-y-xs">
          {/* Metric cards - use wrapping flex so cards size to content */}
          <div className="flex flex-wrap gap-xs items-start">
            {/* Net Result */}
            <BacktestMetricCard
              title="Net Result"
              value={
                typeof netPerc === 'number' ? `${netPerc.toFixed(2)}%` : '-'
              }
              isProfit={typeof netPerc === 'number' && netPerc > 0}
              isLoss={typeof netPerc === 'number' && netPerc < 0}
              subtitle={formatUsd(netUsd)}
            />

            {/* Avg Daily Return */}
            <BacktestMetricCard
              title="Avg Daily Return"
              value={
                typeof backtest.financial?.avgNetDailyPerc === 'number'
                  ? `${backtest.financial.avgNetDailyPerc.toFixed(2)}%`
                  : '-'
              }
              isProfit={
                typeof backtest.financial?.avgNetDailyPerc === 'number' &&
                backtest.financial.avgNetDailyPerc > 0
              }
              isLoss={
                typeof backtest.financial?.avgNetDailyPerc === 'number' &&
                backtest.financial.avgNetDailyPerc < 0
              }
              subtitle={formatUsd(backtest.financial?.avgNetDailyUsd)}
            />

            {/* Open P&L (if there are open deals) */}
            {dealsOpen > 0 && (
              <BacktestMetricCard
                title="Open P&L"
                value={
                  typeof backtest.financial?.unrealizedPnLPerc === 'number'
                    ? `${backtest.financial.unrealizedPnLPerc.toFixed(2)}%`
                    : '-'
                }
                isProfit={
                  typeof backtest.financial?.unrealizedPnLPerc === 'number' &&
                  backtest.financial.unrealizedPnLPerc > 0
                }
                isLoss={
                  typeof backtest.financial?.unrealizedPnLPerc === 'number' &&
                  backtest.financial.unrealizedPnLPerc < 0
                }
                subtitle={formatUsd(backtest.financial?.unrealizedPnL)}
              />
            )}

            {/* Max Drawdown */}
            <BacktestMetricCard
              title={
                backtest.financial?.maxDrawDownEquityUsd
                  ? 'Max Equity DD'
                  : 'Max Realized DD'
              }
              value={
                typeof (
                  backtest.financial?.maxDrawDownEquityPerc ??
                  backtest.financial?.maxDrawDownPerc
                ) === 'number'
                  ? `${Math.abs(backtest.financial?.maxDrawDownEquityPerc ?? backtest.financial?.maxDrawDownPerc ?? 0).toFixed(2)}%`
                  : '-'
              }
              isLoss={true}
              subtitle={formatUsd(
                backtest.financial?.maxDrawDownEquityUsd ??
                  backtest.financial?.maxDrawDown
              )}
            />

            {/* Max Deal Duration */}
            <BacktestGreyMetricCard
              title="Max Deal Duration"
              value={formatDuration(backtest.duration?.maxDealDuration)}
              className="min-w-[140px] max-w-[260px]"
            />

            {/* Avg Deal Duration */}
            <BacktestGreyMetricCard
              title="Avg Deal Duration"
              value={formatDuration(backtest.duration?.avgSplitDealDuration)}
              className="min-w-[140px] max-w-[260px]"
            />
          </div>

          {/* Donut charts */}
          <div className="grid grid-cols-2 gap-xs">
            {/* Win Rate Donut */}
            <Card className="p-xs">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Win Rate
              </h3>
              <Donut
                data={winRateDonutData}
                // total value should be number of deals for win rate
                totalValue={(dealsProfit ?? 0) + (dealsLoss ?? 0) + dealsOpen}
                centerLabel={`${winRate}%`}
                centerSubLabel="Win Rate"
                height={200}
              />
            </Card>

            {/* Profit Factor Donut */}
            <Card className="p-xs">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Profit Factor
              </h3>
              <Donut
                data={profitFactorDonutData}
                totalValue={
                  (backtest.financial?.grossProfitPerc ?? 0) +
                  Math.abs(backtest.financial?.grossLossPerc ?? 0)
                }
                centerLabel={
                  profitFactor === null
                    ? '∞'
                    : typeof profitFactor === 'number'
                      ? profitFactor.toFixed(2)
                      : '-'
                }
                centerSubLabel="Profit Factor"
                height={200}
              />
            </Card>
          </div>
        </div>

        {/* Right side: charts */}
        <div className="col-span-12 lg:col-span-5 space-y-xs">
          {/* Equity Curve Chart */}
          <Card className="p-sm">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Equity Curve
            </h3>
            <div className="h-[220px]">
              {equityData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={equityData}
                    margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
                  >
                    {/* Determine final outcome and adjust colors */}
                    {/* Use netProfitTotalUsd if available, else netProfitTotal */}
                    <defs>
                      {/* Gradient will be colored based on final outcome (profit or loss) */}
                      <linearGradient
                        id="equityGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor={equityStroke}
                          stopOpacity={0.28}
                        />
                        <stop
                          offset="95%"
                          stopColor={equityStroke}
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="currentColor"
                      opacity={0.08}
                    />
                    <XAxis
                      dataKey="time"
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      tickFormatter={(value) =>
                        new Date(value).toLocaleDateString()
                      }
                      tick={{ fill: 'currentColor', fontSize: 10 }}
                      className="text-muted-foreground"
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: 'currentColor', fontSize: 10 }}
                      className="text-muted-foreground"
                      axisLine={false}
                      tickLine={false}
                      width={50}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="equity"
                      stroke={equityStroke}
                      strokeWidth={2}
                      fill="url(#equityGradient)"
                      name="Equity"
                      connectNulls={true}
                      dot={false}
                      isAnimationActive={false}
                      activeDot={{
                        r: 4,
                        fill: equityStroke,
                        stroke: 'oklch(var(--color-card))',
                        strokeWidth: 2,
                      }}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {equityData.some(
                      (d: { buyAndHold?: number }) =>
                        typeof d.buyAndHold === 'number'
                    ) && (
                      <Area
                        type="monotone"
                        dataKey="buyAndHold"
                        stroke={buyHoldCss}
                        strokeWidth={1.5}
                        fill="none"
                        name="Buy and Hold"
                        connectNulls={true}
                        dot={false}
                        isAnimationActive={false}
                        activeDot={{
                          r: 3,
                          fill: buyHoldCss,
                          stroke: 'oklch(var(--color-card))',
                          strokeWidth: 2,
                        }}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                  No equity data available
                </div>
              )}
            </div>
          </Card>

          {/* PnL Scatter Chart */}
          <Card className="p-sm">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Deal P&L Distribution
            </h3>
            <div className="h-[200px]">
              {scatterData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart
                    margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="currentColor"
                      opacity={0.08}
                    />
                    <XAxis
                      type="number"
                      dataKey="x"
                      domain={['dataMin', 'dataMax']}
                      tickFormatter={(value) =>
                        new Date(value).toLocaleDateString()
                      }
                      tick={{ fill: 'currentColor', fontSize: 10 }}
                      className="text-muted-foreground"
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="number"
                      dataKey="y"
                      tick={{ fill: 'currentColor', fontSize: 10 }}
                      className="text-muted-foreground"
                      axisLine={false}
                      tickLine={false}
                      width={50}
                      tickFormatter={(value) => `${value.toFixed(1)}%`}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const data = payload[0].payload;
                        return (
                          <div className="bg-popover border border-border rounded-md p-xs shadow-lg">
                            <div className="text-xs text-muted-foreground">
                              {new Date(data.x).toLocaleString()}
                            </div>
                            <div
                              className="text-sm font-semibold"
                              style={{
                                color: data.y >= 0 ? profitCss : lossCss,
                              }}
                            >
                              {data.y >= 0 ? '+' : ''}
                              {data.y.toFixed(2)}%
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Scatter
                      isAnimationActive={false}
                      data={scatterData}
                      shape="circle"
                      legendType="circle"
                      name="Deals"
                    >
                      {scatterData.map(
                        (entry: { y: number }, index: number) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.y >= 0 ? profitCss : lossCss}
                            opacity={0.8}
                            r={4}
                          />
                        )
                      )}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                  No deal data available
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Bottom section - Additional stats */}
      <div className="mt-2 grid gap-xs md:grid-cols-2">
        {/* Performance Metrics Card */}
        <Card className="p-sm">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Performance Metrics
          </h3>
          <div className="space-y-xs">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Deals:</span>
              <span className="text-xs font-semibold tabular-nums">
                {dealsAll ?? 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Winners:</span>
              <span className="text-xs font-semibold tabular-nums text-profit">
                {dealsProfit ?? 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Losers:</span>
              <span className="text-xs font-semibold tabular-nums text-loss">
                {dealsLoss ?? 0}
              </span>
            </div>
            {dealsOpen > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Open:</span>
                <span className="text-xs font-semibold tabular-nums">
                  {dealsOpen}
                </span>
              </div>
            )}
            <div className="pt-2 border-t border-border">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">
                  Sharpe Ratio:
                </span>
                <span className="text-xs font-semibold tabular-nums">
                  {typeof backtest.ratios?.sharpe === 'number'
                    ? backtest.ratios.sharpe.toFixed(3)
                    : '-'}
                </span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">
                Sortino Ratio:
              </span>
              <span className="text-xs font-semibold tabular-nums">
                {typeof backtest.ratios?.sortino === 'number'
                  ? backtest.ratios.sortino.toFixed(3)
                  : '-'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">
                Annualized Return:
              </span>
              <span className="text-xs font-semibold tabular-nums">
                {formatPercent(backtest.financial?.annualizedReturn)}
              </span>
            </div>
          </div>
        </Card>

        {/* Testing Period Card */}
        <Card className="p-sm">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Testing Period
          </h3>
          <div className="space-y-xs">
            <div>
              <div className="text-xs text-muted-foreground">Time Frame</div>
              <div className="text-xs font-medium mt-0.5">
                {backtest.interval ?? '-'}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Period Name</div>
              <div className="text-xs font-medium mt-0.5">
                {backtest.duration?.periodName ?? 'auto'}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Date Range</div>
              <div className="text-xs font-medium mt-0.5">
                {formatDateRange(
                  backtest.duration?.firstDataTime,
                  backtest.duration?.lastDataTime
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
