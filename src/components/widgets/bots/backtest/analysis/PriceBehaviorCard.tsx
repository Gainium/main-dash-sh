import { useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
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
import {
  timeIntervalMap,
  type ExchangeIntervals,
  type PreparedDeal,
} from '@/types';

import { priceBehavior, topSymbols, type BehaviorPoint } from './analysisMath';
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

const HORIZONS = [10, 20, 50, 100] as const;
const HORIZON_OPTIONS = Object.fromEntries(
  HORIZONS.map((h) => [h, `${h} bars`])
) as Record<number, string>;
const MAX_PAIRS = 10;

type DealFilter = 'all' | 'winners' | 'losers';

const FILTERS: Record<DealFilter, string> = {
  all: 'All deals',
  winners: 'Winning deals',
  losers: 'Losing deals',
};

const keep = (d: PreparedDeal, f: DealFilter) =>
  f === 'all' ||
  (d.status === 'closed' &&
    (f === 'winners' ? d.profit.perc > 0 : d.profit.perc <= 0));

/** "+12 bars · 3h" — the bar count plus the time it spans. */
function spanLabel(step: number, barMs: number) {
  const minutes = (step * barMs) / 60_000;
  const span =
    minutes < 60
      ? `${minutes}m`
      : minutes < 1_440
        ? `${+(minutes / 60).toFixed(1)}h`
        : `${+(minutes / 1_440).toFixed(1)}d`;
  return `+${step} ${step === 1 ? 'bar' : 'bars'} · ${span}`;
}

interface PriceBehaviorCardProps {
  deals: PreparedDeal[];
  interval: ExchangeIntervals;
  from: number;
  to: number;
  short: boolean;
}

export function PriceBehaviorCard({
  deals,
  interval,
  from,
  to,
  short,
}: PriceBehaviorCardProps) {
  const colors = useChartColors();
  const [horizon, setHorizon] = useState<number>(20);
  const [filter, setFilter] = useState<DealFilter>('all');
  const [narrow, setNarrow] = useState(false);

  const barMs = timeIntervalMap[interval] ?? 3_600_000;
  const symbols = useMemo(() => topSymbols(deals, MAX_PAIRS), [deals]);
  // One load covers every horizon: the window plus the longest horizon. The
  // "now" cap is taken once per window — read per render it would change the
  // hook's input every render and reload forever on a run that ends today.
  const loadTo = useMemo(
    () => Math.min(Date.now(), to + HORIZONS[HORIZONS.length - 1] * barMs),
    [to, barMs]
  );
  const { bars, loading } = useAnalysisCandles(symbols, interval, from, loadTo);

  const selected = useMemo(
    () => deals.filter((d) => keep(d, filter)),
    [deals, filter]
  );
  const points = useMemo(
    () => priceBehavior(bars, selected, horizon, short ? -1 : 1),
    [bars, selected, horizon, short]
  );
  // every point is computed over the same deals (spec §1.6)
  const modeled = points[0]?.entries ?? 0;
  // the comparison at the chosen horizon's last bar
  const verdict = points[points.length - 1]?.beats ?? NaN;

  if (!loading && !points.length && filter === 'all') return null;

  return (
    <Card className={ANALYSIS_CARD}>
      <CardHeader className={ANALYSIS_HEADER}>
        <div className="flex items-center gap-xs">
          <CardTitle>Price behaviour</CardTitle>
          {modeled ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {modeled === selected.length
                ? `${modeled} deals`
                : `${modeled} of ${selected.length} deals`}
              {Number.isFinite(verdict)
                ? ` · beats random ${verdict.toFixed(0)}%`
                : ''}
            </span>
          ) : null}
          <Tooltip
            tooltip={`Price move in the bars after each deal entry, measured from the entry price${short ? ' and flipped for a short bot, so positive means in the deal’s favour' : ''}. The coloured band holds the middle 80% of deals. The grey band is random entries: the same number of entries at random bars of the backtest period, drawn hundreds of times; 90% of their average paths fall inside it. "Beats random" is the share of those draws your deals' average beats — near 50% means the entries do no better than chance. A deal is left out when there are fewer bars of price data after its entry than the chosen horizon, or when its pair is not among the 10 with the most deals.`}
          >
            <InfoIcon />
          </Tooltip>
        </div>
        <div className={ANALYSIS_CONTROLS}>
          <ControlSelect value={filter} options={FILTERS} onChange={setFilter} />
          <ControlSelect
            value={horizon}
            options={HORIZON_OPTIONS}
            onChange={setHorizon}
          />
        </div>
      </CardHeader>
      <CardContent className={ANALYSIS_PAD_X}>
        <div className="h-[260px] sm:h-[300px]">
          {loading ? (
            <Skeleton className="h-full w-full" />
          ) : !points.length ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No deals
            </div>
          ) : (
            <ResponsiveContainer
              width="100%"
              height="100%"
              onResize={(width) => setNarrow(width < NARROW_PX)}
            >
              <ComposedChart
                data={points}
                margin={{ top: 10, right: narrow ? 4 : 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis
                  dataKey="step"
                  tickFormatter={(v: number) => `+${v}`}
                  fontSize={narrow ? 10 : 12}
                  minTickGap={narrow ? 8 : 12}
                />
                <YAxis
                  tickFormatter={(v: number) => `${+v.toFixed(2)}%`}
                  fontSize={narrow ? 10 : 12}
                  width={narrow ? 40 : 56}
                  tickCount={7}
                />
                <ReferenceLine
                  y={0}
                  stroke="var(--color-muted-foreground)"
                  strokeOpacity={0.4}
                />
                <ChartTooltip
                  content={({ active, payload }) => {
                    const p = payload?.[0]?.payload as BehaviorPoint | undefined;
                    if (!active || !p) return null;
                    return (
                      <AnalysisTooltip
                        title={spanLabel(p.step, barMs)}
                        rows={[
                          ['Mean', fmtPct(p.mean), colors.chart3],
                          ['Median', fmtPct(p.median), colors.chart1],
                          [
                            'Random 90%',
                            `${fmtPct(p.randomLo)} / ${fmtPct(p.randomHi)}`,
                          ],
                          [
                            'Beats random',
                            Number.isFinite(p.beats)
                              ? `${p.beats.toFixed(0)}%`
                              : '',
                          ],
                          ['P10 / P90', `${fmtPct(p.p10)} / ${fmtPct(p.p90)}`],
                          ['In profit', `${p.positive.toFixed(0)}%`],
                          ['Deals', String(p.entries)],
                        ]}
                      />
                    );
                  }}
                />
                <Legend
                  iconType="plainline"
                  iconSize={narrow ? 10 : 14}
                  wrapperStyle={{ fontSize: narrow ? 11 : 12 }}
                />
                <Area
                  dataKey="upBand"
                  name="80% of deals"
                  isAnimationActive={false}
                  stroke="none"
                  fill={colors.profit}
                  fillOpacity={0.15}
                  legendType="square"
                  activeDot={false}
                />
                <Area
                  dataKey="downBand"
                  isAnimationActive={false}
                  stroke="none"
                  fill={colors.loss}
                  fillOpacity={0.15}
                  legendType="none"
                  activeDot={false}
                />
                <Area
                  dataKey="randomBand"
                  name="Random entries (90%)"
                  isAnimationActive={false}
                  stroke="var(--color-muted-foreground)"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                  fill="var(--color-muted-foreground)"
                  fillOpacity={0.2}
                  legendType="square"
                  activeDot={false}
                />
                <Line
                  dataKey="mean"
                  name="Mean"
                  isAnimationActive={false}
                  stroke={colors.chart3}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  dataKey="median"
                  name="Median"
                  isAnimationActive={false}
                  stroke={colors.chart1}
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
