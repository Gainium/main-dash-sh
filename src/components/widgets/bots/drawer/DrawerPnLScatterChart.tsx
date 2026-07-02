/**
 * DrawerPnLScatterChart - PnL Scatter Plot for Bot Drawer
 *
 * Replicates the legacy (main-dash) scatter chart that appears below the equity curve
 * in the bot stats overview. Displays individual deal profits/losses as scatter points
 * over time, split into green (profit) and red (loss) series.
 *
 * Data source: getBotProfitChartData GraphQL query via useBotProfitChartData hook.
 */

import type { BotTypesEnum } from '@/types';
import type { DrawerBot } from '@/types/bots/drawer';
import { ScatterChart as ScatterChartIcon } from 'lucide-react';
import React, { useMemo } from 'react';
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
import {
  useBotProfitChartData,
  type BotProfitDataPoint,
} from '../../../../hooks/useBotProfitChartData';
import { DrawerSection } from './DrawerSection';

export interface DrawerPnLScatterChartProps {
  widgetId: string;
  botId?: string;
  bot?: DrawerBot;
}

/** Apply local timezone offset to epoch ms (mirrors legacy getTimezoneOffset). */
const getTimezoneOffset = (): number => {
  try {
    const date = new Date();
    const tz = date
      .toLocaleString('en', { timeStyle: 'long' })
      .split(' ')
      .slice(-1)[0];
    const dateString = date.toString();
    const offset =
      Date.parse(`${dateString} UTC`) - Date.parse(`${dateString} ${tz}`);
    if (Number.isNaN(offset)) {
      const tzOffset = new Date().getTimezoneOffset() * 60 * 1000 * -1;
      return Number.isNaN(tzOffset) ? 0 : tzOffset;
    }
    return offset;
  } catch {
    return 0;
  }
};

interface ScatterPoint {
  x: number;
  y: number;
  formattedTime: string;
}

const buildAllPoints = (
  profitData: BotProfitDataPoint[]
): ScatterPoint[] => {
  const offset = getTimezoneOffset();
  return profitData.map((d) => ({
    x: d.time + offset,
    y: +(d.value * 100).toFixed(3), // decimal fraction → percentage, rounded
    formattedTime: new Date(d.time + offset).toLocaleDateString(),
  }));
};

export const DrawerPnLScatterChart: React.FC<DrawerPnLScatterChartProps> = ({
  widgetId,
  botId,
  bot,
}) => {
  const colors = useChartColors();

  // Determine bot type for the query
  const botType: BotTypesEnum = (bot?.type as BotTypesEnum) ?? 'dca';

  const { profitData, isLoading } = useBotProfitChartData(
    botId ?? '',
    botType
  );

  const allPoints = useMemo(
    () => buildAllPoints(profitData),
    [profitData]
  );

  const hasData = profitData.length > 0;

  const sectionProps = {
    widgetId,
    widgetType: 'drawer-pnl-scatter-chart' as const,
    title: 'Deal Returns',
    icon: ScatterChartIcon,
    minSize: { w: 6, h: 6 },
    maxSize: { w: 12, h: 12 },
    hasOptions: false,
  };

  if (!botId) {
    return (
      <DrawerSection {...sectionProps}>
        <div className="flex items-center justify-center h-48">
          <div className="text-sm text-muted-foreground">Bot not found</div>
        </div>
      </DrawerSection>
    );
  }

  return (
    <DrawerSection {...sectionProps}>
      <div className="p-md">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="text-sm text-muted-foreground">
              Loading deal returns...
            </div>
          </div>
        ) : !hasData ? (
          <div className="flex items-center justify-center h-48">
            <div className="text-center text-muted-foreground">
              <ScatterChartIcon className="w-6 h-6 mx-auto mb-1 opacity-50" />
              <p className="text-xs">No deal return data available</p>
            </div>
          </div>
        ) : (
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart
                margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
              >
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
                  domain={['dataMin', 'dataMax']}
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
                  width={40}
                />
                {/* ZAxis controls dot size (fixed) */}
                <ZAxis range={[20, 20]} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as ScatterPoint;
                      const isProfit = data.y >= 0;
                      return (
                        <div className="bg-popover border border-border rounded p-2 text-xs shadow-md">
                          <div className="text-muted-foreground mb-0.5">
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
                  data={allPoints}
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
        )}
      </div>
    </DrawerSection>
  );
};

export default DrawerPnLScatterChart;
