/**
 * DealReturnsPanel — per-deal ROI scatter, the lower panel of the merged
 * Performance widget (DrawerPerformanceChart).
 *
 * This used to be its own drawer widget ('drawer-pnl-scatter-chart') sitting
 * directly below the performance chart with an independent, self-scaled time
 * axis. The two were impossible to read together: this series comes from
 * `botProfitChart` (one row per closed deal, last 500, pruned at 12 months)
 * while the performance chart comes from `bot.stats.chart` (90 daily points),
 * so a loss could sit visibly in this panel and be entirely off the left edge
 * of the one above it — which is exactly how a bot recovering from a drawdown
 * came to look purely profitable. It is now a presentational panel: the parent
 * owns the data, the range selection and the shared X domain, and both panels
 * plot against the same time axis.
 *
 * Data source: getBotProfitChartData GraphQL query via useBotProfitChartData.
 */

import React from 'react';
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { useChartColors } from '../../../../hooks/useChartColors';
import type { BotProfitDataPoint } from '../../../../hooks/useBotProfitChartData';

export interface ScatterPoint {
  x: number;
  y: number;
  formattedTime: string;
}

/**
 * `value` is a decimal ROI fraction (main-app `dcaHelper.ts`:
 * `perc = deal.profit.total / (usage * multiplier)`), NOT an amount — hence
 * the ×100. Timestamps are used raw: the legacy chart pre-shifted them by the
 * local timezone offset and then formatted in local time as well, which
 * double-counted the offset. The panel above plots raw epoch ms, and the two
 * axes must agree or the panels sit shifted relative to each other.
 */
export const buildDealReturnPoints = (
  profitData: BotProfitDataPoint[]
): ScatterPoint[] =>
  profitData.map((d) => ({
    x: d.time,
    y: +(d.value * 100).toFixed(3),
    formattedTime: new Date(d.time).toLocaleDateString(),
  }));

export interface DealReturnsPanelProps {
  points: ScatterPoint[];
  /** Shared with the performance panel above — do not derive locally. */
  domain: [number, number];
  isLoading?: boolean;
}

export const DealReturnsPanel: React.FC<DealReturnsPanelProps> = ({
  points,
  domain,
  isLoading = false,
}) => {
  const colors = useChartColors();

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="text-sm text-muted-foreground">
          Loading deal returns...
        </div>
      </div>
    );
  }

  if (!points.length) {
    return (
      <div className="flex h-32 items-center justify-center">
        <p className="text-xs text-muted-foreground">
          No closed deals in this range
        </p>
      </div>
    );
  }

  return (
    <div className="h-32 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 1, right: 1, left: 1, bottom: 1 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#374151"
            opacity={0.03}
            vertical={false}
            horizontal
          />
          <XAxis
            type="number"
            dataKey="x"
            name="Time"
            domain={domain}
            // The domain is the union of both panels' ranges, so it can extend
            // past this series' own extent; without this recharts clamps back
            // to the data and the panels de-align.
            allowDataOverflow={false}
            scale="time"
            tickFormatter={(value: number) =>
              new Date(value).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })
            }
            tick={{ fontSize: 8, fill: '#6b7280' }}
            tickLine={{ stroke: '#6b7280' }}
            axisLine={{ stroke: '#6b7280' }}
            height={15}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="Return"
            tickFormatter={(value: number) => `${value}%`}
            tick={{ fontSize: 8, fill: '#6b7280' }}
            tickLine={{ stroke: '#6b7280' }}
            axisLine={{ stroke: '#6b7280' }}
            // Matches the performance panel's Y width so both plot areas start
            // at the same x offset — the whole point of the merge.
            width={44}
          />
          {/* ZAxis controls dot size (fixed) */}
          <ZAxis range={[20, 20]} />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload as ScatterPoint;
                const isProfit = data.y >= 0;
                return (
                  <div className="rounded border border-border bg-popover p-2 text-xs shadow-md">
                    <div className="mb-0.5 text-muted-foreground">
                      {data.formattedTime}
                    </div>
                    <div
                      className={
                        isProfit ? 'text-success' : 'text-destructive'
                      }
                    >
                      {isProfit ? '+' : ''}
                      {data.y.toFixed(3)}%
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />
          <Scatter
            isAnimationActive={false}
            name="Deals"
            data={points}
            fill={colors.success}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            shape={(props: any) => {
              const { cx, cy, payload } = props;
              const dotColor =
                payload.y >= 0 ? colors.success : colors.destructive;
              return (
                <circle
                  cx={cx}
                  cy={cy}
                  r={3}
                  fill={dotColor}
                  fillOpacity={0.8}
                  stroke="none"
                />
              );
            }}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
};

export default DealReturnsPanel;
