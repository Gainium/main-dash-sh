import { axisIndexProps, withAxisIndex } from '@/lib/charts/axisIndex';
import { useMemo } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useChartColors } from '@/hooks/useChartColors';
import { math } from '@/lib/utils/math';
import {
  MAX_DEALS_IN_BACKTEST,
  type DCABacktestingResultHistory,
  type PeriodicStats,
} from '@/types';
import CustomTooltip from '@/components/charts/CustomTooltip';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface BacktestAnalysisTabProps {
  backtest: DCABacktestingResultHistory;
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const netClass = (net: number) =>
  net > 0 ? 'text-profit' : net < 0 ? 'text-loss' : 'text-muted-foreground';

const formatNet = (net: number) => `${net > 0 ? '+' : ''}${net}%`;

/** DD / RU / deal counts — the secondary figures, kept on one muted line. */
function PeriodDetails({ stats }: { stats: PeriodicStats }) {
  const { profit, loss } = stats.deals;
  return (
    <span className="text-xs text-muted-foreground tabular-nums">
      DD {stats.drawdown}% · RU {stats.runup}% · {profit + loss} deals (
      <span className="text-profit">{profit}W</span>/
      <span className="text-loss">{loss}L</span>)
    </span>
  );
}

function MonthCell({ stats }: { stats: PeriodicStats }) {
  const net = stats.netResult;
  const tint =
    net > 0
      ? 'bg-profit/10 border-profit/20'
      : net < 0
        ? 'bg-loss/10 border-loss/20'
        : 'border-border/40';
  const { profit, loss } = stats.deals;
  return (
    <div className={`rounded-md border p-xs tabular-nums ${tint}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-xs">
        <span className="text-xs font-medium text-muted-foreground">
          {MONTHS[new Date(stats.startTime).getMonth()]}
        </span>
        <span className={`text-sm font-semibold ${netClass(net)}`}>
          {formatNet(net)}
        </span>
      </div>
      <div className="mt-0.5 flex flex-wrap gap-x-sm text-xs leading-tight text-muted-foreground">
        <span className="whitespace-nowrap">DD {stats.drawdown}%</span>
        <span className="whitespace-nowrap">RU {stats.runup}%</span>
        <span className="whitespace-nowrap">
          {profit + loss} deals
          {profit + loss > 0 ? (
            <>
              {' '}
              (<span className="text-profit">{profit}</span>/
              <span className="text-loss">{loss}</span>)
            </>
          ) : null}
        </span>
      </div>
    </div>
  );
}

export function BacktestAnalysisTab({ backtest }: BacktestAnalysisTabProps) {
  const chartColors = useChartColors();

  const returnDistribution = useMemo(() => {
    const deals = backtest.deals ?? [];
    if (!deals.length) return [] as Array<{ name: string; value: number }>;

    const map: Map<number, number> = new Map();
    deals.forEach((deal) => {
      const key = math.round(deal.profit.perc, 3);
      map.set(key, (map.get(key) ?? 0) + 1);
    });

    if (map.size > MAX_DEALS_IN_BACKTEST) return [];

    const array = Array.from(map, ([perc, count]) => ({ perc, count }));
    const percValues = array.map((a) => a.perc);
    const min = Math.min(...percValues);
    const max = Math.max(...percValues);

    const categoriesCount = 30;
    const step = Math.abs((max - min) / categoriesCount);
    const categories: { name: string; value: number }[] = [];

    if (step === 0) {
      categories.push({ name: `= ${math.round(min)}%`, value: 100 });
      return withAxisIndex(categories);
    }

    for (let i = min; i <= max + step / 2; i += step) {
      let first = i;
      let next = i + step;
      if (i < 0 && next > 0) {
        next = 0;
      }
      if (i > 0 && i - step < 0) {
        first = 0;
      }

      const count = array
        .filter((d) => d.perc >= first && d.perc < next)
        .reduce((acc, v) => acc + v.count, 0);

      categories.push({
        name: `> ${math.round(first)}%`,
        value: math.round((count / deals.length) * 100),
      });
    }

    // Bucket edges are rounded for display, so two adjacent buckets can carry
    // the same label on a narrow return range — key the axis on the row index
    // (`withAxisIndex`) or the tooltip resolves to the first of them.
    return withAxisIndex(categories);
  }, [backtest.deals]);

  const periodicStats = useMemo(
    () => backtest.periodicStats ?? [],
    [backtest.periodicStats]
  );
  const yearStats = useMemo(
    () =>
      periodicStats
        .filter((p) => p.period === 'year')
        .sort((a, b) => a.startTime - b.startTime),
    [periodicStats]
  );

  const hasReturnDistribution = returnDistribution.length > 0;
  const hasPeriodicStats = periodicStats.length > 0;

  return (
    <div className="h-full p-md space-y-md">
      {hasReturnDistribution ? (
        <Card>
          <CardHeader>
            <CardTitle>Return distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={returnDistribution}
                  margin={{ top: 20, right: 20, left: 0, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    {...axisIndexProps(
                      returnDistribution,
                      (bucket) => bucket.name
                    )}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    fontSize={12}
                    interval={0}
                  />
                  <YAxis
                    tickFormatter={(v) => `${v}%`}
                    fontSize={12}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    content={
                      <CustomTooltip
                        valueFormatter={(value, name) => [`${value}%`, name]}
                      />
                    }
                    labelFormatter={(value: number) =>
                      returnDistribution[value]?.name ?? ''
                    }
                  />
                  <Bar
                    isAnimationActive={false}
                    dataKey="value"
                    fill={chartColors.profit}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {hasPeriodicStats ? (
        <Card>
          <CardHeader>
            <CardTitle>Periodic stats</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-lg">
              {yearStats.map((year) => {
                const yearStart = year.startTime;
                const yearEnd = year.startTime + 365 * 24 * 60 * 60 * 1000 - 1;
                const months = periodicStats
                  .filter(
                    (p) =>
                      p.period === 'month' &&
                      p.startTime >= yearStart &&
                      p.startTime <= yearEnd
                  )
                  .sort((a, b) => a.startTime - b.startTime);

                return (
                  <div key={`${year.startTime}-year`} className="space-y-sm">
                    <div className="flex flex-wrap items-baseline gap-x-md gap-y-xs">
                      <span className="text-base font-semibold">
                        {new Date(year.startTime).getFullYear()}
                      </span>
                      <span
                        className={`text-base font-semibold tabular-nums ${netClass(year.netResult)}`}
                      >
                        {formatNet(year.netResult)}
                      </span>
                      <PeriodDetails stats={year} />
                    </div>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-xs">
                      {months.map((m) => (
                        <MonthCell key={`${m.startTime}-month`} stats={m} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!hasReturnDistribution && !hasPeriodicStats ? (
        <div className="text-sm text-muted-foreground">
          No analysis data available
        </div>
      ) : null}
    </div>
  );
}
