import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import { useChartColors } from '@/hooks/useChartColors';
import type { PreparedDeal } from '@/types';

import { AnalysisTooltip, fmtPct } from './AnalysisTooltip';
import {
  ANALYSIS_CARD,
  ANALYSIS_HEADER,
  ANALYSIS_PAD_X,
  NARROW_PX,
} from './ControlSelect';
import {
  compareToRandom,
  type EdgePoint,
  type EdgeVerdict,
  type ReturnStats,
} from './edgeMath';
import { useRandomEdgeRun, type RandomTestSource } from './useRandomEdgeRun';

const VERDICT: Record<EdgeVerdict, { label: string; className: string }> = {
  beats: { label: 'Beats random', className: 'text-profit' },
  worse: { label: 'Worse than random', className: 'text-loss' },
  same: {
    label: 'Not distinguishable from random',
    className: 'text-muted-foreground',
  },
};

const INFO =
  'Re-runs this backtest with random entries: deals open at up to 300 random bars of the same period, with no DCA and no stop loss, sized at your average deal usage, and close after a fixed number of bars (half the period, at most 100). Your closed deals’ returns are then compared with the random deals’ returns. If your strategy has a real edge its average return sits clearly above random; if the two overlap, the result could be chance. Each run draws new random entries.';

const T_INFO =
  'Welch’s t-test on the two average returns. Positive means your strategy’s average is above random. Beyond ±1.96 the difference is significant at 95%; near 0 your returns are not different from random entries in this period.';

const CI_INFO =
  'Average return of the closed deals, ± the 95% confidence interval of that average.';

function StatBlock({
  label,
  stats,
  color,
}: {
  label: string;
  stats: ReturnStats;
  color: string;
}) {
  return (
    <div className="rounded-md border border-border/40 p-xs tabular-nums">
      <div className="flex items-center gap-xs text-xs text-muted-foreground">
        <span
          className="size-2 rounded-full"
          style={{ backgroundColor: color }}
        />
        {label} · {stats.n} deals
        <Tooltip tooltip={CI_INFO}>
          <InfoIcon />
        </Tooltip>
      </div>
      {Number.isFinite(stats.mean) ? (
        <div className="text-sm font-semibold">
          {fmtPct(stats.mean)}
          {Number.isFinite(stats.ci) ? (
            <span className="font-normal text-muted-foreground">
              {' '}
              ± {stats.ci.toFixed(2)}%
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

interface StrategyVsRandomCardProps {
  deals: PreparedDeal[];
  source: RandomTestSource;
}

export function StrategyVsRandomCard({
  deals,
  source,
}: StrategyVsRandomCardProps) {
  const colors = useChartColors();
  const [narrow, setNarrow] = useState(false);
  const { deals: randomDeals, progress, error, run } = useRandomEdgeRun(source);
  const running = progress !== null;

  const cmp = useMemo(
    () => (randomDeals ? compareToRandom(deals, randomDeals) : null),
    [deals, randomDeals]
  );
  const strategyColor = colors.chart3;
  const randomColor = 'var(--color-muted-foreground)';

  return (
    <Card className={ANALYSIS_CARD}>
      <CardHeader className={ANALYSIS_HEADER}>
        <div className="flex flex-wrap items-center gap-xs">
          <CardTitle>Strategy vs Random</CardTitle>
          <Tooltip tooltip={INFO}>
            <InfoIcon />
          </Tooltip>
          {cmp?.verdict && !running ? (
            <span
              className={`text-xs font-medium ${VERDICT[cmp.verdict].className}`}
            >
              {VERDICT[cmp.verdict].label}
            </span>
          ) : null}
        </div>
        <Button
          size="sm"
          variant={cmp ? 'outline' : 'default'}
          className="w-full sm:w-auto"
          disabled={running}
          onClick={() => void run()}
        >
          {running
            ? `Running… ${progress}%`
            : cmp
              ? 'Run again'
              : 'Run random test'}
        </Button>
      </CardHeader>
      {error && !running ? (
        <CardContent className={`${ANALYSIS_PAD_X} text-sm text-loss`}>
          Random test failed: {error}
        </CardContent>
      ) : null}
      {cmp ? (
        <CardContent
          className={`${ANALYSIS_PAD_X} grid gap-sm md:grid-cols-[13rem_minmax(0,1fr)] md:gap-md ${running ? 'opacity-50' : ''}`}
        >
          <div className="grid grid-cols-2 content-start gap-xs md:grid-cols-1">
            <StatBlock
              label="Strategy"
              stats={cmp.strategy}
              color={strategyColor}
            />
            <StatBlock label="Random" stats={cmp.random} color={randomColor} />
            {Number.isFinite(cmp.t) ? (
              <div className="col-span-2 flex items-center justify-between gap-xs rounded-md border border-border/40 p-xs text-sm tabular-nums md:col-span-1">
                <span className="flex items-center gap-xs text-xs text-muted-foreground">
                  T value
                  <Tooltip tooltip={T_INFO}>
                    <InfoIcon />
                  </Tooltip>
                </span>
                <span className="font-semibold">{cmp.t.toFixed(2)}</span>
              </div>
            ) : null}
          </div>
          <div className="h-[260px] sm:h-[300px]">
            <ResponsiveContainer
              width="100%"
              height="100%"
              onResize={(width) => setNarrow(width < NARROW_PX)}
            >
              <ComposedChart
                margin={{ top: 10, right: narrow ? 4 : 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis
                  type="number"
                  dataKey="x"
                  domain={[0, 'dataMax']}
                  allowDecimals={false}
                  fontSize={narrow ? 10 : 12}
                  minTickGap={narrow ? 8 : 12}
                />
                <YAxis
                  type="number"
                  dataKey="y"
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
                {Number.isFinite(cmp.strategy.mean) ? (
                  <ReferenceLine
                    y={cmp.strategy.mean}
                    stroke={strategyColor}
                    strokeWidth={2}
                  />
                ) : null}
                {Number.isFinite(cmp.random.mean) ? (
                  <ReferenceLine
                    y={cmp.random.mean}
                    stroke={randomColor}
                    strokeWidth={2}
                    strokeDasharray="4 3"
                  />
                ) : null}
                <ChartTooltip
                  cursor={false}
                  content={({ active, payload }) => {
                    const p = payload?.[0]?.payload as EdgePoint | undefined;
                    if (!active || !p) return null;
                    const isStrategy = p.x <= cmp.strategy.n;
                    return (
                      <AnalysisTooltip
                        title={
                          isStrategy
                            ? `Strategy deal ${p.x}`
                            : `Random deal ${p.x - cmp.strategy.n}`
                        }
                        rows={[
                          [
                            'Return',
                            fmtPct(p.y),
                            isStrategy ? strategyColor : randomColor,
                          ],
                        ]}
                      />
                    );
                  }}
                />
                <Legend
                  iconType="circle"
                  iconSize={narrow ? 8 : 10}
                  wrapperStyle={{ fontSize: narrow ? 11 : 12 }}
                />
                <Scatter
                  name="Strategy"
                  data={cmp.strategyPoints}
                  fill={strategyColor}
                  fillOpacity={0.8}
                  isAnimationActive={false}
                  shape={(props: { cx?: number; cy?: number }) => (
                    <circle
                      cx={props.cx}
                      cy={props.cy}
                      r={narrow ? 2 : 3}
                      fill={strategyColor}
                      fillOpacity={0.8}
                    />
                  )}
                />
                <Scatter
                  name="Random"
                  data={cmp.randomPoints}
                  fill={randomColor}
                  isAnimationActive={false}
                  shape={(props: { cx?: number; cy?: number }) => (
                    <circle
                      cx={props.cx}
                      cy={props.cy}
                      r={narrow ? 2 : 3}
                      fill={randomColor}
                      fillOpacity={0.6}
                    />
                  )}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
