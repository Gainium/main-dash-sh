import { axisIndexProps, withAxisIndex } from '@/lib/charts/axisIndex';
import type { DrawerBot } from '@/types/bots/drawer';
import type { GridBot } from '@/types/gridBot';
import type { GridCurrency } from '@/types/bots/grid/data';
import { BarChart3 } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  useGridBotProfit,
  type GridProfitEntry,
} from '@/hooks/useGridBotProfit';
import { CHART_COLORS } from '@/lib/colors';
import { round } from '@/utils/bots/grid/math';
import CustomTooltip from '@/components/charts/CustomTooltip';
import WidgetStats from '../../shared/WidgetStats';
import { DrawerSection } from './DrawerSection';

// ---------- types ----------

type Timeframe = 'Daily' | 'Weekly' | 'Monthly' | 'Total';

/** Timeframe index sent to the backend (matches legacy) */
const TIMEFRAME_MAP: Record<Timeframe, number> = {
  Daily: 0,
  Weekly: 1,
  Monthly: 2,
  Total: 3,
};

interface ChartPoint {
  date: string;
  value: number;
  fullDate: string;
  label: string;
}

// ---------- helpers ----------

/**
 * Map the raw getProfitByBot entries into the value to display,
 * respecting the selected currency.
 *
 * This mirrors the legacy logic in main-dash/components/gridbot/botContent.tsx
 * where profit entries are mapped before being passed to TotalProfit.
 */
const mapProfitValue = (
  entry: GridProfitEntry,
  showCurrency: GridCurrency,
  profitCurrency: string,
  latestPrice: number
): number => {
  if (showCurrency === 'usd') return entry.profitUsd;
  if (showCurrency === 'base' && profitCurrency === 'base') return entry.base;
  if (showCurrency === 'quote' && profitCurrency === 'quote')
    return entry.quote;
  if (showCurrency === 'quote' && profitCurrency === 'base')
    return entry.base * (latestPrice || 1);
  if (showCurrency === 'base' && profitCurrency === 'quote')
    return latestPrice > 0 ? entry.quote / latestPrice : 0;
  return 0;
};

/**
 * Build chart data with a fixed-size window, filling empty periods with 0.
 * Mirrors the legacy TotalProfit.tsx fill logic exactly.
 */
const buildChartData = (
  entries: GridProfitEntry[],
  showCurrency: GridCurrency,
  profitCurrency: string,
  latestPrice: number,
  timeframe: number // 0=Daily, 1=Weekly, 2=Monthly, 3=Total
): ChartPoint[] => {
  const precision = showCurrency === 'usd' ? 2 : 6;

  const getValue = (e: GridProfitEntry) =>
    round(
      mapProfitValue(e, showCurrency, profitCurrency, latestPrice),
      precision
    );

  // Total: return raw entries as-is
  if (timeframe === 3) {
    return entries.map((e) => {
      const d = new Date(e.date);
      return {
        date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: getValue(e),
        fullDate: e.date,
        label: d.toLocaleDateString(),
      };
    });
  }

  if (timeframe === 2) {
    // Monthly: fixed 12-month window ending this month
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1; // 1-based
    const list: ChartPoint[] = [];
    for (let i = -11; i <= 0; i++) {
      let m = month + i;
      let y = year;
      if (m < 1) {
        m += 12;
        y -= 1;
      }
      const key = `${y}-${m}`; // backend key e.g. "2025-3"
      const keyPadded = `${y}-${`0${m}`.slice(-2)}`; // "2025-03"
      const match = entries.find(
        ({ date }) => date === key || date === keyPadded
      );
      list.push({
        date: new Date(y, m - 1, 1).toLocaleDateString('en-US', {
          month: 'short',
          year: '2-digit',
        }),
        value: match ? getValue(match) : 0,
        fullDate: keyPadded,
        label: keyPadded,
      });
    }
    return list;
  }

  if (timeframe === 1) {
    // Weekly: fill gaps between first and today + 7d
    const step = 7 * 24 * 60 * 60 * 1000;
    const list: ChartPoint[] = [];
    if (entries.length === 0) return list;

    const getWeek = (d: Date): number => {
      const oneJan = new Date(d.getFullYear(), 0, 1);
      return Math.ceil(
        ((d.getTime() - oneJan.getTime()) / 86400000 + oneJan.getDay() + 1) / 7
      );
    };

    const getMonday = (isoDate: string): Date => {
      const d = new Date(isoDate);
      const day = d.getUTCDay(); // 0=Sun
      const diff = day === 0 ? -6 : 1 - day;
      return new Date(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate() + diff
      );
    };

    const sorted = [...entries].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    let startTime = getMonday(sorted[0].date).getTime();
    const endTime = Date.now() + step;

    for (const val of sorted) {
      const profitTime = getMonday(val.date).getTime();
      for (let i = startTime; i < profitTime; i += step) {
        const d = new Date(i);
        list.push({
          date: `${d.getFullYear()}-W${getWeek(d)}`,
          value: 0,
          fullDate: d.toISOString(),
          label: d.toLocaleDateString(),
        });
      }
      const d = new Date(profitTime);
      list.push({
        date: `${d.getFullYear()}-W${getWeek(d)}`,
        value: getValue(val),
        fullDate: val.date,
        label: d.toLocaleDateString(),
      });
      startTime = profitTime + step;
    }
    for (let i = startTime; i <= endTime; i += step) {
      const d = new Date(i);
      const key = `${d.getFullYear()}-W${getWeek(d)}`;
      if (!list.find((p) => p.date === key)) {
        list.push({
          date: key,
          value: 0,
          fullDate: d.toISOString(),
          label: d.toLocaleDateString(),
        });
      }
    }
    return list;
  }

  // Daily (timeframe === 0): fixed 30-day window ending today, fill missing days with 0
  const list: ChartPoint[] = [];
  const now = new Date();
  // Start of today in local midnight
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();

  for (let i = -29; i <= 0; i++) {
    const dayStart = todayStart + i * 24 * 60 * 60 * 1000;
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const match = entries.find(({ date }) => {
      const t = new Date(date).getTime();
      return t >= dayStart && t < dayEnd;
    });
    const d = new Date(dayStart);
    list.push({
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: match ? getValue(match) : 0,
      fullDate: d.toISOString(),
      label: d.toLocaleDateString(),
    });
  }
  return list;
};

// ---------- widget ----------

export interface DrawerGridProfitChartProps {
  widgetId: string;
  botId?: string;
  bot?: DrawerBot;
}

const DrawerGridProfitChart: React.FC<DrawerGridProfitChartProps> = ({
  widgetId,
  botId,
  bot: botProp,
}) => {
  const gridBot = botProp as unknown as GridBot | undefined;
  const actualBotId = botId || gridBot?._id || '';

  // State
  const [timeframe, setTimeframe] = useState<Timeframe>('Daily');
  const [currency, setCurrency] = useState<GridCurrency>('usd');

  const baseAsset = gridBot?.symbol?.baseAsset ?? 'BASE';
  const quoteAsset = gridBot?.symbol?.quoteAsset ?? 'QUOTE';
  const profitCurrency = gridBot?.settings?.profitCurrency ?? 'quote';
  const latestPrice = gridBot?.lastPrice ?? 0;

  // Fetch profit data from backend — mirrors legacy getProfitByBot call
  const { profitEntries, isLoading } = useGridBotProfit({
    botId: actualBotId,
    timeframe: TIMEFRAME_MAP[timeframe],
    enabled: !!actualBotId,
  });

  // Build chart data mapped to the selected currency, with empty-day fill.
  // `date` is a display label ("Aug 24", "Aug", "2026-W34") that can repeat
  // across the range, and recharts resolves an axis tooltip by matching the
  // axis value — so the axis is keyed on the row index (`withAxisIndex`).
  const chartData = useMemo(
    () =>
      withAxisIndex(
        buildChartData(
          profitEntries,
          currency,
          profitCurrency,
          latestPrice,
          TIMEFRAME_MAP[timeframe]
        )
      ),
    [profitEntries, currency, profitCurrency, latestPrice, timeframe]
  );

  // Compute summary stats (same logic as legacy TotalProfit)
  const stats = useMemo(() => {
    if (chartData.length === 0) {
      return {
        today: 0,
        yesterday: 0,
        difference: 0,
        differencePercent: 0,
        avg: 0,
      };
    }
    const today = chartData[chartData.length - 1]?.value ?? 0;
    const yesterday =
      chartData.length > 1 ? (chartData[chartData.length - 2]?.value ?? 0) : 0;
    const difference = round(today - yesterday, currency === 'usd' ? 2 : 6);
    const differencePercent =
      yesterday !== 0 ? round((difference / Math.abs(yesterday)) * 100, 2) : 0;
    const sum = chartData.reduce((s, p) => s + p.value, 0);
    const avg = round(sum / chartData.length, currency === 'usd' ? 2 : 6);
    return { today, yesterday, difference, differencePercent, avg };
  }, [chartData, currency]);

  // Currency symbol for display
  const symbolProfit = useMemo(() => {
    if (currency === 'base') return baseAsset;
    if (currency === 'usd') return 'USD';
    return quoteAsset;
  }, [currency, baseAsset, quoteAsset]);

  // Stat items for WidgetStats component
  const statItems = useMemo(() => {
    const items = [
      {
        label:
          timeframe === 'Total'
            ? 'Total'
            : timeframe === 'Monthly'
              ? 'This Month'
              : timeframe === 'Weekly'
                ? 'This Week'
                : 'Today',
        value: stats.today,
      },
    ];

    if (timeframe !== 'Total') {
      items.push(
        {
          label:
            timeframe === 'Monthly'
              ? 'Last Month'
              : timeframe === 'Weekly'
                ? 'Last Week'
                : 'Yesterday',
          value: stats.yesterday,
        },
        {
          label: 'Difference',
          value: stats.difference,
          badge: { value: stats.differencePercent },
        } as (typeof items)[number] & { badge: { value: number } },
        {
          label:
            timeframe === 'Monthly'
              ? 'Avg monthly'
              : timeframe === 'Weekly'
                ? 'Avg weekly'
                : `Avg daily`,
          value: stats.avg,
        }
      );
    }

    return items;
  }, [timeframe, stats]);

  // Currency tabs
  const currencyTabs: { value: GridCurrency; label: string }[] = [
    { value: 'base', label: baseAsset },
    { value: 'quote', label: quoteAsset },
    { value: 'usd', label: 'USD' },
  ];

  return (
    <DrawerSection
      widgetId={widgetId}
      widgetType="drawer-grid-profit-chart"
      title="Profit"
      icon={BarChart3}
      minSize={{ w: 6, h: 8 }}
      maxSize={{ w: 12, h: 16 }}
      hasOptions
      headerActions={
        <div className="flex items-center rounded-lg border border-border/40 bg-background/40 p-0.5">
          {currencyTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setCurrency(tab.value)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                currency === tab.value
                  ? 'bg-muted text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="space-y-md">
        {/* Summary stats */}
        <WidgetStats stats={statItems} />

        {/* Chart */}
        <div className="min-h-60 w-full">
          {isLoading ? (
            <div className="flex items-center justify-center h-60 text-xs text-muted-foreground">
              Loading profit data...
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex items-center justify-center h-60 text-xs text-muted-foreground">
              No profit data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={chartData}
                margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
              >
                <defs>
                  <linearGradient
                    id="gridProfitGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="var(--color-profit)"
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--color-profit)"
                      stopOpacity={0.3}
                    />
                  </linearGradient>
                  <linearGradient
                    id="gridLossGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="var(--color-loss)"
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--color-loss)"
                      stopOpacity={0.3}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={CHART_COLORS.stroke}
                  opacity={0.3}
                />
                <XAxis
                  {...axisIndexProps(chartData, (point) => point.date)}
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
                  tickFormatter={(v) => (currency === 'usd' ? `$${v}` : `${v}`)}
                  width={50}
                />
                <Tooltip content={<CustomTooltip />} cursor={false} />
                <Bar
                  isAnimationActive={false}
                  dataKey="value"
                  radius={[4, 4, 0, 0]}
                  name={`Profit (${symbolProfit})`}
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        entry.value >= 0
                          ? 'url(#gridProfitGradient)'
                          : 'url(#gridLossGradient)'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Timeframe buttons */}
        <div className="flex items-center justify-center gap-1">
          {(['Daily', 'Weekly', 'Monthly', 'Total'] as Timeframe[]).map(
            (tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  tf === timeframe
                    ? 'bg-muted text-foreground border border-border shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tf}
              </button>
            )
          )}
        </div>
      </div>
    </DrawerSection>
  );
};

export default DrawerGridProfitChart;
