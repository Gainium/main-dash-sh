import React from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ZAxis,
} from 'recharts';
import CustomTooltip from './CustomTooltip';

interface ReturnsRiskChartProps {
  data: Array<{
    name: string;
    annualizedReturn?: number | undefined;
    maxDrawDown?: number | undefined;
    sharpe?: number | undefined;
  }>;
  height?: number;
}

const ReturnsRiskChart: React.FC<ReturnsRiskChartProps> = ({
  data,
  height = 300,
}) => {
  // Transform data for the scatter plot
  const chartData = data.map((item, index) => ({
    name: item.name || `Backtest ${index + 1}`,
    x: Math.abs(item.maxDrawDown || 0), // Risk (drawdown) on X-axis
    y: item.annualizedReturn || 0, // Return on Y-axis
    z: item.sharpe || 0, // Sharpe ratio for bubble size/color
  }));

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart
          data={chartData}
          margin={{
            top: 20,
            right: 20,
            bottom: 20,
            left: 20,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
          <XAxis
            type="number"
            dataKey="x"
            name="Max Drawdown (%)"
            label={{
              value: 'Risk (Max Drawdown %)',
              position: 'insideBottom',
              offset: -10,
            }}
            fontSize={12}
            className="text-muted-foreground"
          />
          <YAxis
            type="number"
            dataKey="y"
            name="Annualized Return (%)"
            label={{ value: 'Return (%)', angle: -90, position: 'insideLeft' }}
            fontSize={12}
            className="text-muted-foreground"
          />
          <ZAxis
            type="number"
            dataKey="z"
            range={[50, 400]}
            name="Sharpe Ratio"
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ strokeDasharray: '3 3' }}
          />
          <Scatter
            isAnimationActive={false}
            name="Backtests"
            data={chartData}
            fill="#3b82f6"
            fillOpacity={0.6}
          />
        </ScatterChart>
      </ResponsiveContainer>

      <div className="mt-2 text-xs text-muted-foreground text-center">
        Bubble size represents Sharpe ratio • Higher returns with lower risk =
        better performance
      </div>
    </div>
  );
};

export default ReturnsRiskChart;
