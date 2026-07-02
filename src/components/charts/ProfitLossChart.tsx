import React from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';
import CustomTooltip from './CustomTooltip';

interface ProfitLossChartProps {
  data: Array<{
    name: string;
    profit?: number | undefined;
    loss?: number | undefined;
    winRate?: number;
  }>;
  height?: number;
}

const COLORS = {
  profit: '#10b981', // green
  loss: '#ef4444', // red
};

const ProfitLossChart: React.FC<ProfitLossChartProps> = ({
  data,
  height = 300,
}) => {
  // Calculate aggregated data
  const totalProfit = data.reduce((sum, item) => sum + (item.profit || 0), 0);
  const totalLoss = Math.abs(
    data.reduce((sum, item) => sum + (item.loss || 0), 0)
  );
  const totalTrades = data.reduce(
    (sum, item) => sum + ((item.profit || 0) + (item.loss || 0)),
    0
  );

  const chartData = [
    {
      name: 'Profitable Trades',
      value: totalProfit,
      count: data.reduce((sum, item) => sum + (item.profit || 0), 0),
      color: COLORS.profit,
    },
    {
      name: 'Losing Trades',
      value: totalLoss,
      count: data.reduce((sum, item) => sum + Math.abs(item.loss || 0), 0),
      color: COLORS.loss,
    },
  ];

  const winRate = totalTrades > 0 ? (totalProfit / totalTrades) * 100 : 0;

  return (
    <div className="w-full">
      <div className="mb-4 text-center">
        <div className="text-2xl font-bold text-foreground">
          {winRate.toFixed(1)}%
        </div>
        <div className="text-sm text-muted-foreground">Win Rate</div>
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            isAnimationActive={false}
            data={chartData}
            cx="50%"
            cy="50%"
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ProfitLossChart;
