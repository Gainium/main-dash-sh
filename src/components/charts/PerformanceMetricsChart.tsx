import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import CustomTooltip from './CustomTooltip';

interface PerformanceMetricsChartProps {
  data: Array<{
    name: string;
    sharpe?: number | undefined;
    sortino?: number | undefined;
    cwr?: number | undefined;
    profitFactor?: number | undefined;
  }>;
  height?: number;
}

const COLORS = {
  sharpe: '#3b82f6', // blue
  sortino: '#10b981', // green
  cwr: '#f59e0b', // amber
  profitFactor: '#8b5cf6', // purple
};

const PerformanceMetricsChart: React.FC<PerformanceMetricsChartProps> = ({
  data,
  height = 300,
}) => {
  // Transform data for the chart
  const chartData = data.map((item, index) => ({
    name: item.name || `Backtest ${index + 1}`,
    sharpe: item.sharpe || 0,
    sortino: item.sortino || 0,
    cwr: item.cwr || 0,
    profitFactor: item.profitFactor || 0,
  }));

  const metrics = [
    { key: 'sharpe', name: 'Sharpe Ratio', color: COLORS.sharpe },
    { key: 'sortino', name: 'Sortino Ratio', color: COLORS.sortino },
    { key: 'cwr', name: 'Calmar Ratio', color: COLORS.cwr },
    { key: 'profitFactor', name: 'Profit Factor', color: COLORS.profitFactor },
  ];

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
            dataKey="name"
            angle={-45}
            textAnchor="end"
            height={80}
            interval={0}
            fontSize={12}
            className="text-muted-foreground"
          />
          <YAxis fontSize={12} className="text-muted-foreground" />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: 'rgba(0, 0, 0, 0.1)' }}
          />

          {metrics.map((metric) => (
            <Bar
              isAnimationActive={false}
              key={metric.key}
              dataKey={metric.key}
              name={metric.name}
              fill={metric.color}
              radius={[2, 2, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PerformanceMetricsChart;
