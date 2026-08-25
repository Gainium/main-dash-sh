import { axisIndexProps, withAxisIndex } from '@/lib/charts/axisIndex';
import { useMemo } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useChartColors } from '@/hooks/useChartColors';
import { math } from '@/lib/utils/math';
import {
  MAX_DEALS_IN_BACKTEST,
  type DCABacktestingResultHistory,
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

const statCells = [
  '',
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
  'Year',
];

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
            <div className="w-full overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40">
                    {statCells.map((s) => (
                      <th
                        key={`${s || 'empty'}-header`}
                        className="p-xs text-left font-medium text-muted-foreground whitespace-nowrap"
                      >
                        {s}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {yearStats.map((year) => (
                    <tr
                      key={`${year.startTime}-row`}
                      className="border-b border-border/20 align-top"
                    >
                      {statCells.map((sc, i) => {
                        const yearStart = year.startTime;
                        const yearEnd =
                          year.startTime + 365 * 24 * 60 * 60 * 1000 - 1;

                        if (sc === '') {
                          return (
                            <td
                              key="year-label"
                              className="p-xs whitespace-nowrap"
                            >
                              {new Date(year.startTime).getFullYear()}
                            </td>
                          );
                        }

                        if (sc === 'Year') {
                          return (
                            <td key="year-summary" className="p-xs min-w-40">
                              <div className="space-y-1">
                                <div>Net: {year.netResult}%</div>
                                <div>DD: {year.drawdown}%</div>
                                <div>RU: {year.runup}%</div>
                                <div>
                                  Deals: {year.deals.loss + year.deals.profit}{' '}
                                  (p - {year.deals.profit}, l -{' '}
                                  {year.deals.loss})
                                </div>
                              </div>
                            </td>
                          );
                        }

                        const monthStats = periodicStats.filter(
                          (p) =>
                            p.period === 'month' &&
                            new Date(p.startTime).getMonth() + 1 === i &&
                            p.startTime >= yearStart &&
                            p.startTime <= yearEnd
                        );

                        if (!monthStats.length) {
                          return <td key={`${sc}-empty`} className="p-xs" />;
                        }

                        return (
                          <td key={`${sc}-month`} className="p-xs min-w-40">
                            {monthStats.map((m) => (
                              <div
                                key={`${m.startTime}-month`}
                                className="space-y-1"
                              >
                                <div>Net: {m.netResult}%</div>
                                <div>DD: {m.drawdown}%</div>
                                <div>RU: {m.runup}%</div>
                                <div>
                                  Deals: {m.deals.loss + m.deals.profit} (p -{' '}
                                  {m.deals.profit}, l - {m.deals.loss})
                                </div>
                              </div>
                            ))}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
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
