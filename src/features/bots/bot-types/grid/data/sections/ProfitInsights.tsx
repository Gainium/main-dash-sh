import { Target, TrendingDown, TrendingUp, Trophy } from 'lucide-react';
import React, { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { BotProfitDataPoint } from '@/hooks/useBotProfitChartData';
import type { GridCurrency, GridProfitMetrics } from '@/types/bots/grid';

interface ProfitInsightsProps {
  metrics?: GridProfitMetrics;
  data: BotProfitDataPoint[];
  hasData: boolean;
  currency: GridCurrency;
  formatAmount: (
    value: number,
    options?: { currency?: GridCurrency; maximumFractionDigits?: number }
  ) => string;
  formatDateTime: (value: number | string | Date) => string;
}

interface MetricCardProps {
  label: string;
  value: string;
  subLabel?: string;
  icon?: React.ReactNode;
  tone?: 'positive' | 'negative' | 'neutral';
}

const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  subLabel,
  icon,
  tone = 'neutral',
}) => {
  const toneClass =
    tone === 'positive'
      ? 'text-success'
      : tone === 'negative'
        ? 'text-destructive'
        : 'text-muted-foreground';

  return (
    <div className="rounded-lg border border-border/60 bg-card/60 p-md">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <div className={`mt-2 text-lg font-semibold ${toneClass}`}>{value}</div>
      {subLabel && (
        <div className="text-xs text-muted-foreground">{subLabel}</div>
      )}
    </div>
  );
};

export const ProfitInsights: React.FC<ProfitInsightsProps> = ({
  metrics,
  data,
  hasData,
  currency,
  formatAmount,
  formatDateTime,
}) => {
  const chartData = useMemo(
    () =>
      data.map((point) => ({
        ...point,
        label: formatDateTime(point.time),
      })),
    [data, formatDateTime]
  );

  const totalProfitRaw = metrics?.totalProfit ?? 0;
  const totalProfit = formatAmount(totalProfitRaw, {
    currency,
    maximumFractionDigits: currency === 'usd' ? 2 : 4,
  });
  const dailyAverageRaw = metrics?.averageDaily ?? 0;
  const weeklyAverageRaw = metrics?.averageWeekly ?? 0;
  const monthlyAverageRaw = metrics?.averageMonthly ?? 0;
  const bestDayRaw = metrics?.bestDay ?? 0;
  const worstDayRaw = metrics?.worstDay ?? 0;

  const dailyAverage = formatAmount(dailyAverageRaw, {
    currency,
    maximumFractionDigits: currency === 'usd' ? 2 : 4,
  });
  const weeklyAverage = formatAmount(weeklyAverageRaw, {
    currency,
    maximumFractionDigits: currency === 'usd' ? 2 : 4,
  });
  const monthlyAverage = formatAmount(monthlyAverageRaw, {
    currency,
    maximumFractionDigits: currency === 'usd' ? 2 : 4,
  });
  const bestDay = formatAmount(bestDayRaw, {
    currency,
    maximumFractionDigits: currency === 'usd' ? 2 : 4,
  });
  const worstDay = formatAmount(worstDayRaw, {
    currency,
    maximumFractionDigits: currency === 'usd' ? 2 : 4,
  });

  return (
    <Card className="space-y-lg border-border/60 bg-card/80 p-lg">
      <div className="flex flex-col gap-xs">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Profit & Performance
        </h3>
        <p className="text-xs text-muted-foreground">
          Historic profit trend and key performance metrics
        </p>
      </div>

      <div className="grid gap-sm sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total Profit"
          value={totalProfit}
          icon={<Target className="h-4 w-4 text-info" />}
          tone={totalProfitRaw >= 0 ? 'positive' : 'negative'}
        />
        <MetricCard
          label="Daily Avg"
          value={dailyAverage}
          icon={<TrendingUp className="h-4 w-4 text-success" />}
          tone={dailyAverageRaw >= 0 ? 'positive' : 'negative'}
        />
        <MetricCard
          label="Weekly Avg"
          value={weeklyAverage}
          icon={<TrendingUp className="h-4 w-4 text-warning" />}
          tone={weeklyAverageRaw >= 0 ? 'positive' : 'negative'}
        />
        <MetricCard
          label="Monthly Avg"
          value={monthlyAverage}
          icon={<TrendingUp className="h-4 w-4 text-primary" />}
          tone={monthlyAverageRaw >= 0 ? 'positive' : 'negative'}
        />
      </div>

      <div className="grid gap-sm sm:grid-cols-2">
        <MetricCard
          label="Best Day"
          value={bestDay}
          subLabel={`${metrics?.profitableDays ?? 0} profitable / ${metrics?.totalDays ?? 0} trading days`}
          icon={<Trophy className="h-4 w-4 text-warning" />}
          tone={bestDayRaw > 0 ? 'positive' : 'neutral'}
        />
        <MetricCard
          label="Worst Day"
          value={worstDay}
          icon={<TrendingDown className="h-4 w-4 text-destructive" />}
          tone={worstDayRaw <= 0 ? 'negative' : 'positive'}
        />
      </div>

      <div className="space-y-sm">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Profit Timeline
        </h4>
        <div className="h-72 rounded-lg border border-border/60 bg-background/60 p-sm">
          {hasData ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 10, right: 10, left: 0, bottom: 10 }}
              >
                <defs>
                  <linearGradient
                    id="profitGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="rgba(34, 197, 94, 0.5)" />
                    <stop offset="95%" stopColor="rgba(34, 197, 94, 0.05)" />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="currentColor"
                  strokeOpacity={0.05}
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{
                    fill: 'oklch(var(--muted-foreground))',
                    fontSize: 10,
                  }}
                  minTickGap={24}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{
                    fill: 'oklch(var(--muted-foreground))',
                    fontSize: 10,
                  }}
                  width={70}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) =>
                    formatAmount(value, {
                      currency,
                      maximumFractionDigits: currency === 'usd' ? 2 : 4,
                    })
                  }
                />
                <Tooltip
                  cursor={{ stroke: 'rgba(59,130,246,0.2)', strokeWidth: 1 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const point = payload[0];
                    const item = point.payload as (typeof chartData)[number];
                    return (
                      <Card className="border-border/80 bg-card/90 p-sm text-xs shadow-lg">
                        <div className="font-semibold text-muted-foreground">
                          {item.label}
                        </div>
                        <div className="mt-1 text-sm font-semibold text-card-foreground">
                          {formatAmount(item.value, {
                            currency,
                            maximumFractionDigits: currency === 'usd' ? 2 : 4,
                          })}
                        </div>
                      </Card>
                    );
                  }}
                />
                <Area
                  isAnimationActive={false}
                  type="monotone"
                  dataKey="value"
                  strokeWidth={2}
                  stroke="oklch(var(--primary))"
                  fill="url(#profitGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <ScrollArea className="h-full">
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
                Profit history isn't available yet. Once the bot starts closing
                deals, you'll see its progress over time here.
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </Card>
  );
};

export default ProfitInsights;
