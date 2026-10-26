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

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import { useChartColors } from '@/hooks/useChartColors';
import {
  timeIntervalMap,
  type ExchangeIntervals,
  type PreparedDeal,
} from '@/types';

import {
  edgeRobustness,
  edgeSeries,
  episodeGroups,
  priceBehavior,
  topSymbols,
  type BehaviorPoint,
  type EdgePoint,
  type EdgeRobustness,
  type EdgeVerdict,
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

const HORIZONS = [10, 20, 50, 100] as const;
const HORIZON_OPTIONS = Object.fromEntries(
  HORIZONS.map((h) => [h, `${h} bars`])
) as Record<number, string>;
const MAX_PAIRS = 10;

type View = 'sample' | 'random' | 'edge';
const VIEWS: Record<View, string> = {
  sample: 'Sample',
  random: 'Random',
  edge: 'Edge',
};

const HELP: Record<View, string> = {
  sample:
    'Your deals: the average and median price move in the bars after entry, and the band holding the middle 80% of deals.',
  random:
    'Random entries: copies of your deals with every entry moved together by one random offset in the backtest period, so their spacing and clustering stay the same and only the timing is random. Hundreds of copies are drawn; the line is their average path and 90% of them fall inside the band.',
  edge: 'Edge: your deals’ average move minus the random entries’ average — what is left once chance is taken out. The grey zone is how far random copies stray from zero by luck. Green: above it, the entries likely carry an edge. Red: below it, worse than random. Grey: within chance. The badge reads the last bar of the chosen horizon, and marks an edge fragile when it is gone without its strongest episode or shows at the chosen horizon only. An episode is a run of deals on one pair whose windows overlap — a burst of re-entries in one move counts once. It measures entry timing only — take profit, DCA and stop loss are not part of it.',
};

const VERDICT: Record<
  EdgeVerdict,
  { label: string; variant: 'success' | 'error' | 'secondary' }
> = {
  edge: { label: 'Beat random', variant: 'success' },
  worse: { label: 'Worse than random', variant: 'error' },
  chance: { label: 'Same as random', variant: 'secondary' },
};

const FRAGILE = { label: 'Beat random, fragile', variant: 'warning' } as const;

/** "Aug 19–21", "Aug 30–Sep 2" or "Aug 19" — an episode's span, UTC. */
function spanDates(start: number, end: number) {
  const fmt = (t: number, opts: Intl.DateTimeFormatOptions) =>
    new Date(t).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
  const a = fmt(start, { month: 'short', day: 'numeric' });
  if (fmt(start, { dateStyle: 'short' }) === fmt(end, { dateStyle: 'short' }))
    return a;
  const sameMonth =
    fmt(start, { month: 'short' }) === fmt(end, { month: 'short' });
  return `${a}–${fmt(end, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}`;
}

/** Why an edge holds up or not, for the badge's tooltip. */
function robustnessNote(r: EdgeRobustness, horizon: number) {
  const lines: string[] = [];
  if (!r.strongest) {
    lines.push('All of it comes from one episode.');
  } else if (r.vanishesWithoutStrongest) {
    lines.push(
      `It is gone without its strongest episode (${r.strongest.deals} ${r.strongest.deals === 1 ? 'deal' : 'deals'}, ${spanDates(r.strongest.start, r.strongest.end)}).`
    );
  }
  if (r.onlyAtThisHorizon) {
    lines.push(
      `It shows at ${horizon} bars only — not at ${r.otherHorizons.map((o) => o.horizon).join(', ')} bars.`
    );
  }
  return lines.length
    ? `${lines.join(' ')} Treat it as luck until it repeats.`
    : `It holds without its strongest episode and at ${r.otherHorizons
        .filter((o) => o.state === 'edge')
        .map((o) => o.horizon)
        .join(', ')} bars too.`;
}

const SHARED_HELP =
  'A deal is left out when there are fewer bars of price data after its entry than the chosen horizon, or when its pair is not among the 10 with the most deals.';

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
  const [view, setView] = useState<View>('sample');
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
  const edge = useMemo(() => edgeSeries(points), [points]);
  // every point is computed over the same deals (spec §1.6)
  const modeled = points[0]?.entries ?? 0;
  // the verdict is read at the chosen horizon's last bar only (spec §1.3b)
  const last = edge[edge.length - 1];
  const episodes = useMemo(
    () => episodeGroups(bars, selected, horizon).length,
    [bars, selected, horizon]
  );
  // only an edge is put to the robustness checks (spec §1.3c)
  const robustness = useMemo(
    () =>
      last?.state === 'edge'
        ? edgeRobustness(bars, selected, horizon, short ? -1 : 1, HORIZONS)
        : null,
    [last?.state, bars, selected, horizon, short]
  );
  const verdict = robustness?.fragile ? FRAGILE : last && VERDICT[last.state];

  if (!loading && !points.length && filter === 'all') return null;

  // grid, axes, zero line and legend — the same in every view
  const frame = [
    <CartesianGrid key="grid" strokeDasharray="3 3" opacity={0.3} />,
    <XAxis
      key="x"
      dataKey="step"
      tickFormatter={(v: number) => `+${v}`}
      fontSize={narrow ? 10 : 12}
      minTickGap={narrow ? 8 : 12}
    />,
    <YAxis
      key="y"
      tickFormatter={(v: number) => `${+v.toFixed(2)}%`}
      fontSize={narrow ? 10 : 12}
      width={narrow ? 40 : 56}
      tickCount={7}
    />,
    <ReferenceLine
      key="zero"
      y={0}
      stroke="var(--color-muted-foreground)"
      strokeOpacity={0.4}
    />,
    <Legend
      key="legend"
      iconType="plainline"
      iconSize={narrow ? 10 : 14}
      wrapperStyle={{ fontSize: narrow ? 11 : 12 }}
    />,
  ];

  return (
    <Card className={ANALYSIS_CARD}>
      <CardHeader className={ANALYSIS_HEADER}>
        <div className="flex flex-wrap items-center gap-x-xs gap-y-1">
          <CardTitle className="whitespace-nowrap">Price behaviour</CardTitle>
          {modeled ? (
            <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
              {modeled === selected.length
                ? `${modeled} deals`
                : `${modeled} of ${selected.length} deals`}
              {` · ${episodes} ${episodes === 1 ? 'episode' : 'episodes'}`}
            </span>
          ) : null}
          {last && verdict ? (
            <Tooltip
              tooltip={robustness ? robustnessNote(robustness, horizon) : ''}
            >
              <Badge variant={verdict.variant} className="tabular-nums">
                {verdict.label} {fmtPct(last.edge)}
              </Badge>
            </Tooltip>
          ) : null}
          <Tooltip
            tooltip={`${HELP[view]}${short ? ' Moves are flipped for a short bot, so positive means in the deal’s favour.' : ''} ${SHARED_HELP}`}
          >
            <InfoIcon />
          </Tooltip>
        </div>
        <div className={ANALYSIS_CONTROLS}>
          <ControlSelect
            value={filter}
            options={FILTERS}
            onChange={setFilter}
          />
          <ControlSelect
            value={horizon}
            options={HORIZON_OPTIONS}
            onChange={setHorizon}
          />
        </div>
      </CardHeader>
      <CardContent className={ANALYSIS_PAD_X}>
        <Tabs
          value={view}
          onValueChange={(v: string) => setView(v as View)}
          className="mb-sm"
        >
          <TabsList className="grid w-full grid-cols-3 sm:inline-grid sm:w-auto">
            {(Object.keys(VIEWS) as View[]).map((v) => (
              <TabsTrigger key={v} value={v}>
                {VIEWS[v]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
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
              {view === 'sample' ? (
                <ComposedChart
                  data={points}
                  margin={{
                    top: 10,
                    right: narrow ? 4 : 10,
                    left: 0,
                    bottom: 0,
                  }}
                >
                  {frame}
                  <ChartTooltip
                    content={({ active, payload }) => {
                      const p = payload?.[0]?.payload as
                        BehaviorPoint | undefined;
                      if (!active || !p) return null;
                      return (
                        <AnalysisTooltip
                          title={spanLabel(p.step, barMs)}
                          rows={[
                            ['Mean', fmtPct(p.mean), colors.chart3],
                            ['Median', fmtPct(p.median), colors.chart1],
                            [
                              'P10 / P90',
                              `${fmtPct(p.p10)} / ${fmtPct(p.p90)}`,
                            ],
                            ['In profit', `${p.positive.toFixed(0)}%`],
                            ['Deals', String(p.entries)],
                          ]}
                        />
                      );
                    }}
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
              ) : view === 'random' ? (
                <ComposedChart
                  data={points}
                  margin={{
                    top: 10,
                    right: narrow ? 4 : 10,
                    left: 0,
                    bottom: 0,
                  }}
                >
                  {frame}
                  <ChartTooltip
                    content={({ active, payload }) => {
                      const p = payload?.[0]?.payload as
                        BehaviorPoint | undefined;
                      if (!active || !p) return null;
                      return (
                        <AnalysisTooltip
                          title={spanLabel(p.step, barMs)}
                          rows={[
                            ['Random average', fmtPct(p.control)],
                            [
                              'Random 90%',
                              `${fmtPct(p.randomLo)} / ${fmtPct(p.randomHi)}`,
                            ],
                            ['Your mean', fmtPct(p.mean), colors.chart3],
                            [
                              'Beats random',
                              Number.isFinite(p.beats)
                                ? `${p.beats.toFixed(0)}%`
                                : '',
                            ],
                          ]}
                        />
                      );
                    }}
                  />
                  <Area
                    dataKey="randomBand"
                    name="Random copies (90%)"
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
                    dataKey="control"
                    name="Random average"
                    isAnimationActive={false}
                    stroke="var(--color-foreground)"
                    strokeOpacity={0.7}
                    strokeDasharray="4 4"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              ) : (
                <ComposedChart
                  data={edge}
                  margin={{
                    top: 10,
                    right: narrow ? 4 : 10,
                    left: 0,
                    bottom: 0,
                  }}
                >
                  {frame}
                  <ChartTooltip
                    content={({ active, payload }) => {
                      const p = payload?.[0]?.payload as EdgePoint | undefined;
                      if (!active || !p) return null;
                      return (
                        <AnalysisTooltip
                          title={spanLabel(p.step, barMs)}
                          rows={[
                            ['Edge', fmtPct(p.edge)],
                            [
                              'Chance zone',
                              `${fmtPct(p.chance[0])} / ${fmtPct(p.chance[1])}`,
                            ],
                            [
                              'Beats random',
                              Number.isFinite(p.beats)
                                ? `${p.beats.toFixed(0)}%`
                                : '',
                            ],
                            ['Deals', String(p.entries)],
                          ]}
                        />
                      );
                    }}
                  />

                  <Area
                    dataKey="chance"
                    name="Chance zone"
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
                    dataKey="edge"
                    name="Edge"
                    isAnimationActive={false}
                    stroke="var(--color-foreground)"
                    strokeOpacity={0.6}
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    dataKey="above"
                    name="Beat random"
                    isAnimationActive={false}
                    stroke={colors.profit}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={false}
                  />
                  <Line
                    dataKey="below"
                    name="Worse than random"
                    isAnimationActive={false}
                    stroke={colors.loss}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={false}
                  />
                </ComposedChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
