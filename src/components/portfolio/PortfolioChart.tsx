import { ProfitBadge, ProfitValue } from '@/components/ui/ProfitValue';
import { useGraphQL } from '@/hooks/useGraphQL';
import { GraphQlQuery } from '@/lib/api';
import { StatusEnum, type PortfolioQuery, type Snapshots } from '@/types';
import React, { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import CustomTooltip from '../charts/CustomTooltip';

export const PortfolioChart: React.FC = () => {
  const [snapshots, setSnapshots] = useState<Snapshots[]>([]);
  const { data: p } = useGraphQL<PortfolioQuery>(
    'getPortfolioByUser',
    GraphQlQuery.getPortfolioByUser()
  );

  useEffect(() => {
    if (p?.status === StatusEnum.notok) {
      console.error(`Error fetching portfolio data: ${p.reason}`);
    } else {
      setSnapshots(
        p?.data.result.map((p) => ({
          ...p,
          assets: p.assets.map((pa) => ({
            ...pa,
            name: pa.name === 'looks' ? 'RARE' : pa.name, // Normalize asset names
          })),
        })) || []
      );
    }
  }, [p]);

  // Process real portfolio data from GraphQL
  const getPortfolioStats = () => {
    if (!snapshots || snapshots.length === 0) {
      return {
        totalBalance: 0,
        totalBalanceUsd: 0,
        oneDayChange: { btc: 0, usd: 0, percent: 0 },
        thirtyDayChange: { btc: 0, usd: 0, percent: 0 },
        oneYearChange: { btc: 0, usd: 0, percent: 0 },
      };
    }

    const latest = snapshots[snapshots.length - 1];
    const totalBalanceUsd = latest.totalUsd;
    const totalBalance = totalBalanceUsd / 50000; // Approximate BTC conversion

    // Calculate changes (simplified - using mock data pattern for now)
    const oneDayChange = {
      btc: 0.00045,
      usd: 245.67,
      percent: 2.1,
    };
    const thirtyDayChange = {
      btc: -0.0012,
      usd: -678.45,
      percent: -4.2,
    };
    const oneYearChange = {
      btc: 0.0234,
      usd: 12456.78,
      percent: 45.7,
    };

    return {
      totalBalance,
      totalBalanceUsd,
      oneDayChange,
      thirtyDayChange,
      oneYearChange,
    };
  };

  const getChartData = () => {
    if (!snapshots || snapshots.length === 0) {
      return [];
    }

    // Convert snapshots to chart data
    return snapshots
      .slice(-30)
      .map((snapshot) => {
        // Show last 30 data points
        const date = new Date(snapshot.updateTime);
        const dateString = date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        });

        return {
          date: dateString,
          value: snapshot.totalUsd,
          updateTime: snapshot.updateTime,
        };
      })
      .sort((a, b) => a.updateTime - b.updateTime);
  };

  const statsData = getPortfolioStats();
  const chartData = getChartData();

  return (
    <div className="flex flex-col bg-card">
      {/* Loading state */}
      {(!snapshots || snapshots.length === 0) && (
        <div className="flex items-center justify-center p-xl">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
            <p className="text-muted-foreground text-sm">
              Loading portfolio data...
            </p>
          </div>
        </div>
      )}

      {/* Stats Section */}
      {snapshots && snapshots.length > 0 && (
        <>
          <div className="rounded-lg p-xs bg-inner-container mb-4">
            <div className="grid grid-cols-1 min-[480px]:grid-cols-2 min-[768px]:grid-cols-4 gap-xs">
              <div className="bg-card rounded-lg p-xs">
                <div className="text-muted-foreground text-xs mb-1">
                  Total Balance
                </div>
                <div className="font-bold text-foreground text-xs sm:text-sm lg:text-base">
                  {statsData.totalBalance.toFixed(8)} BTC
                </div>
                <div className="text-xs text-muted-foreground">
                  ${statsData.totalBalanceUsd.toLocaleString()} USD
                </div>
              </div>

              <div className="bg-card rounded-lg p-xs">
                <div className="text-muted-foreground text-xs mb-1">
                  1d Change
                </div>
                <div className="flex flex-col gap-1">
                  <div className="text-xs sm:text-sm">
                    <ProfitValue
                      value={statsData.oneDayChange.btc}
                      formatAsCurrency={false}
                    />
                    <span className="text-muted-foreground"> BTC</span>
                  </div>
                  <ProfitBadge value={statsData.oneDayChange.percent} />
                </div>
                <div className="text-xs text-muted-foreground">
                  <ProfitValue value={statsData.oneDayChange.usd} size="sm" />{' '}
                  USD
                </div>
              </div>

              <div className="bg-card rounded-lg p-xs">
                <div className="text-muted-foreground text-xs mb-1">
                  30d Change
                </div>
                <div className="flex flex-col gap-1">
                  <div className="text-xs sm:text-sm">
                    <ProfitValue
                      value={statsData.thirtyDayChange.btc}
                      formatAsCurrency={false}
                    />
                    <span className="text-muted-foreground"> BTC</span>
                  </div>
                  <ProfitBadge value={statsData.thirtyDayChange.percent} />
                </div>
                <div className="text-xs text-muted-foreground">
                  <ProfitValue
                    value={statsData.thirtyDayChange.usd}
                    size="sm"
                  />{' '}
                  USD
                </div>
              </div>

              <div className="bg-card rounded-lg p-xs">
                <div className="text-muted-foreground text-xs mb-1">
                  1y Change
                </div>
                <div className="flex flex-col gap-1">
                  <div className="text-xs sm:text-sm">
                    <ProfitValue
                      value={statsData.oneYearChange.btc}
                      formatAsCurrency={false}
                    />
                    <span className="text-muted-foreground"> BTC</span>
                  </div>
                  <ProfitBadge value={statsData.oneYearChange.percent} />
                </div>
                <div className="text-xs text-muted-foreground">
                  <ProfitValue value={statsData.oneYearChange.usd} size="sm" />{' '}
                  USD
                </div>
              </div>
            </div>
          </div>

          {/* Chart Area */}
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{
                  top: 5,
                  right: 5,
                  left: 5,
                  bottom: 5,
                }}
              >
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: 'currentColor',
                    fontSize: 10,
                    className: 'text-muted-foreground',
                  }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: 'currentColor',
                    fontSize: 8,
                    className: 'text-muted-foreground',
                  }}
                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                  domain={['dataMin - 200', 'dataMax + 200']}
                  width={40}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  isAnimationActive={false}
                  type="monotone"
                  dataKey="value"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#colorValue)"
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: '#3b82f6',
                    stroke: 'oklch(var(--color-card))',
                    strokeWidth: 2,
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
};
