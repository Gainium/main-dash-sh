import { useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import { useChartColors } from '@/hooks/useChartColors';
import { ExchangeIntervals, type PreparedDeal, type Symbols } from '@/types';

import {
  dealSeasonality,
  priceSeasonality,
  type SeasonBucket,
  type SeasonalityGranularity,
} from './analysisMath';
import { AnalysisTooltip, fmtPct } from './AnalysisTooltip';
import {
  ANALYSIS_CARD,
  ANALYSIS_CONTROLS,
  ANALYSIS_HEADER,
  ANALYSIS_PAD_X,
  ControlSelect,
  NARROW_PX,
} from './ControlSelect';
import { useAnalysisCandles } from './useAnalysisCandles';

type Source = 'price' | 'deals';
/** 0 = the backtest's own period, else years ending at the backtest's end. */
type RangeYears = 0 | 1 | 3 | 5;

const YEAR_MS = 365.25 * 86_400_000;

const SOURCES: Record<Source, string> = { price: 'Price', deals: 'Deals' };
const GRANULARITIES: Record<SeasonalityGranularity, string> = {
  weekday: 'Day of week',
  month: 'Month',
};
const RANGES: Record<RangeYears, string> = {
  0: 'Backtest period',
  1: '1 year',
  3: '3 years',
  5: '5 years',
};

interface SeasonalityCardProps {
  deals: PreparedDeal[];
  /** Pair(s) for the price source, most-traded first. */
  symbols: Symbols[];
  from: number;
  to: number;
}

export function SeasonalityCard({
  deals,
  symbols,
  from,
  to,
}: SeasonalityCardProps) {
  const colors = useChartColors();
  // saved backtests keep no per-deal data, so Deals is offered only after a run
  const hasDeals = deals.some((d) => d.status === 'closed');
  const [selectedSource, setSource] = useState<Source>('price');
  const source: Source = hasDeals ? selectedSource : 'price';
  const [granularity, setGranularity] =
    useState<SeasonalityGranularity>('weekday');
  const [range, setRange] = useState<RangeYears>(0);
  const [narrow, setNarrow] = useState(false);

  const [pair, setPair] = useState('');
  const symbol = symbols.find((s) => s.pair === pair) ?? symbols[0];
  const pairOptions = useMemo(
    () =>
      Object.fromEntries(symbols.map((s) => [s.pair, s.pair])) as Record<
        string,
        string
      >,
    [symbols]
  );

  const priceFrom = range ? to - range * YEAR_MS : from;
  const priceSymbols = useMemo(
    () => (source === 'price' && symbol ? [symbol] : []),
    [source, symbol]
  );
  const { bars, loading } = useAnalysisCandles(
    priceSymbols,
    ExchangeIntervals.oneD,
    priceFrom,
    to
  );

  const buckets = useMemo<SeasonBucket[]>(() => {
    if (source === 'deals') return dealSeasonality(deals, granularity);
    const daily = symbol ? bars.get(symbol.pair) : undefined;
    return daily?.length ? priceSeasonality(daily, granularity) : [];
  }, [source, deals, granularity, symbol, bars]);

  const hasData = buckets.some((b) => b.count > 0);
  // empty buckets plot as gaps, not as NaN
  const chartData = useMemo(
    () =>
      buckets.map((b) =>
        b.count ? b : { ...b, positive: null, mean: null }
      ),
    [buckets]
  );
  const isLoading = source === 'price' && loading;

  return (
    <Card className={ANALYSIS_CARD}>
      <CardHeader className={ANALYSIS_HEADER}>
        <div className="flex items-center gap-xs">
          <CardTitle>Seasonality</CardTitle>
          <Tooltip
            tooltip={
              source === 'price'
                ? 'Bars: share of periods that closed higher than they opened. Line: mean change. Days and months are UTC; a month cut off by the range is left out.'
                : 'Bars: share of closed deals in profit, by the day or month the deal opened (UTC). Line: mean deal profit.'
            }
          >
            <InfoIcon />
          </Tooltip>
        </div>
        <div className={ANALYSIS_CONTROLS}>
          {hasDeals ? (
            <ControlSelect
              value={source}
              options={SOURCES}
              onChange={setSource}
            />
          ) : null}
          {source === 'price' && symbols.length > 1 && symbol ? (
            <ControlSelect
              value={symbol.pair}
              options={pairOptions}
              onChange={setPair}
            />
          ) : null}
          <ControlSelect
            value={granularity}
            options={GRANULARITIES}
            onChange={setGranularity}
          />
          {source === 'price' ? (
            <ControlSelect value={range} options={RANGES} onChange={setRange} />
          ) : null}
        </div>
      </CardHeader>
      <CardContent className={ANALYSIS_PAD_X}>
        <div className="h-[260px] sm:h-[300px]">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : !hasData ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Not enough data
            </div>
          ) : (
            <ResponsiveContainer
              width="100%"
              height="100%"
              onResize={(width) => setNarrow(width < NARROW_PX)}
            >
              <ComposedChart
                data={chartData}
                margin={{ top: 24, right: narrow ? 4 : 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  opacity={0.3}
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  fontSize={narrow ? 10 : 12}
                  interval={0}
                  tickFormatter={(v: string) => (narrow ? v.charAt(0) : v)}
                />
                <YAxis
                  yAxisId="share"
                  domain={[0, 100]}
                  tickFormatter={(v: number) => `${v}%`}
                  fontSize={narrow ? 10 : 12}
                  width={narrow ? 36 : 44}
                />
                <YAxis
                  yAxisId="mean"
                  orientation="right"
                  hide={narrow}
                  tickFormatter={(v: number) => `${+v.toFixed(2)}%`}
                  fontSize={12}
                  width={56}
                />
                <ReferenceLine
                  yAxisId="share"
                  y={50}
                  stroke="var(--color-muted-foreground)"
                  strokeDasharray="4 4"
                />
                <ChartTooltip
                  cursor={{ fillOpacity: 0.05 }}
                  content={({ active, payload }) => {
                    const b = payload?.[0]?.payload as SeasonBucket | undefined;
                    if (!active || !b?.count) return null;
                    return (
                      <AnalysisTooltip
                        title={b.label}
                        rows={[
                          [
                            source === 'price' ? 'Positive' : 'Win rate',
                            `${b.positive.toFixed(0)}%`,
                          ],
                          ['Mean', fmtPct(b.mean), colors.chart3],
                          ['Median', fmtPct(b.median)],
                          ['P25 / P75', `${fmtPct(b.p25)} / ${fmtPct(b.p75)}`],
                          [
                            source === 'price'
                              ? granularity === 'weekday'
                                ? 'Days'
                                : 'Months'
                              : 'Deals',
                            String(b.count),
                          ],
                        ]}
                      />
                    );
                  }}
                />
                <Bar
                  yAxisId="share"
                  dataKey="positive"
                  isAnimationActive={false}
                  radius={[4, 4, 0, 0]}
                >
                  {buckets.map((b) => (
                    <Cell
                      key={b.label}
                      fill={b.positive >= 50 ? colors.profit : colors.loss}
                      fillOpacity={0.7}
                    />
                  ))}
                  {narrow ? null : (
                    <LabelList
                      dataKey="positive"
                      position="top"
                      fontSize={11}
                      fill="var(--color-foreground)"
                      formatter={(v: unknown) =>
                        Number.isFinite(v) ? `${(v as number).toFixed(0)}%` : ''
                      }
                    />
                  )}
                </Bar>
                <Line
                  yAxisId="mean"
                  dataKey="mean"
                  name="Mean change"
                  isAnimationActive={false}
                  stroke={colors.chart3}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
