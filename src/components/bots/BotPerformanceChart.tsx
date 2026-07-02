import React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useChartColors } from '../../hooks/useChartColors';
import CustomTooltip from '../charts/CustomTooltip';

interface BotPerformanceChartProps {
  botId: string;
}

export const BotPerformanceChart: React.FC<BotPerformanceChartProps> = ({
  botId: _botId,
}) => {
  // Get chart colors as resolved hex values
  const colors = useChartColors();

  // Mock performance data
  const performanceData = [
    { date: '2025-06-20', value: 8000 },
    { date: '2025-06-21', value: 8050 },
    { date: '2025-06-22', value: 8120 },
    { date: '2025-06-23', value: 8080 },
    { date: '2025-06-24', value: 8150 },
    { date: '2025-06-25', value: 8140 },
    { date: '2025-06-26', value: 8180 },
    { date: '2025-06-27', value: 8172 },
    { date: '2025-06-28', value: 8172 },
  ];

  return (
    <div className="w-full h-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={performanceData}
          margin={{
            top: 20,
            right: 30,
            left: 20,
            bottom: 20,
          }}
        >
          <defs>
            <linearGradient id="colorPerformance" x1="0" y1="0" x2="0" y2="1">
              <stop offset="1%" stopColor={colors.chart1} stopOpacity={0.4} />
              <stop offset="50%" stopColor={colors.chart4} stopOpacity={0.2} />
              <stop offset="99%" stopColor={colors.chart4} stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            className="fill-muted-foreground text-xs"
            tickFormatter={(value) => new Date(value).toLocaleDateString()}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            className="fill-muted-foreground text-xs"
            tickFormatter={(value) => `$${value}`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            isAnimationActive={false}
            type="monotone"
            dataKey="value"
            stroke={colors.chart1}
            strokeWidth={2.5}
            fill="url(#colorPerformance)"
            dot={{ fill: colors.chart2, strokeWidth: 2, r: 4 }}
            activeDot={{
              r: 6,
              fill: colors.chart2,
              stroke: 'oklch(var(--background))',
              strokeWidth: 2,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
