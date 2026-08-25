import { axisIndexProps, withAxisIndex } from '@/lib/charts/axisIndex';
import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import CustomTooltip from './CustomTooltip';

interface BuyAndHoldChartProps {
  data: Array<{
    name: string;
    strategyReturn?: number | undefined;
    buyAndHoldReturn?: number | undefined;
    annualizedReturn?: number;
  }>;
  height?: number;
}

const BuyAndHoldChart: React.FC<BuyAndHoldChartProps> = ({
  data,
  height = 300,
}) => {
  // Two backtests can carry the same name, and recharts resolves an axis
  // tooltip by matching the axis value — so a duplicate name would show the
  // first one's bars for both. Key the axis on the row index instead
  // (`withAxisIndex`) and render the name through the tick/label formatters.
  const chartData = withAxisIndex(
    data.map((item, index) => ({
      name: item.name || `Backtest ${index + 1}`,
      strategy: item.annualizedReturn || 0,
      buyAndHold: item.buyAndHoldReturn || 0,
    }))
  );

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={chartData}
          margin={{
            top: 20,
            right: 30,
            left: 20,
            bottom: 60,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
          <XAxis
            {...axisIndexProps(chartData, (item) => item.name)}
            angle={-45}
            textAnchor="end"
            height={80}
            interval={0}
            fontSize={12}
            className="text-muted-foreground"
          />
          <YAxis
            fontSize={12}
            className="text-muted-foreground"
            label={{
              value: 'Annualized Return (%)',
              angle: -90,
              position: 'insideLeft',
            }}
          />
          <Tooltip
            content={<CustomTooltip />}
            labelFormatter={(value: number) => chartData[value]?.name ?? ''}
            cursor={{ fill: 'rgba(0, 0, 0, 0.1)' }}
          />
          <Legend />

          <Bar
            isAnimationActive={false}
            dataKey="strategy"
            name="Strategy Return"
            fill="#3b82f6"
            radius={[2, 2, 0, 0]}
          />
          <Bar
            isAnimationActive={false}
            dataKey="buyAndHold"
            name="Buy & Hold Return"
            fill="#6b7280"
            radius={[2, 2, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-2 text-xs text-muted-foreground text-center">
        Compare strategy performance against passive buy-and-hold investment
      </div>
    </div>
  );
};

export default BuyAndHoldChart;
