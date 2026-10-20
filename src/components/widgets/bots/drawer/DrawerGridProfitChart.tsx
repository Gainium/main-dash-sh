import { axisIndexProps, withAxisIndex } from '@/lib/charts/axisIndex';
import type { DrawerBot, DrawerBotType } from '@/types/bots/drawer';
import { BotTypesEnum } from '@/types';
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
import { useGridBotProfit } from '@/hooks/useGridBotProfit';
import { CHART_COLORS } from '@/lib/colors';
import { round } from '@/utils/bots/grid/math';
import { useAccountTimeZone } from '@/hooks/useAccountTimeZone';
import { useAuthStore } from '@/stores/authStore';
import CustomTooltip from '@/components/charts/CustomTooltip';
import WidgetStats from '../../shared/WidgetStats';
import { DrawerSection } from './DrawerSection';
import { buildChartData } from './botProfitChartData';

// ---------- types ----------

type Timeframe = 'Daily' | 'Weekly' | 'Monthly' | 'Total';

/** Timeframe index sent to the backend (matches legacy) */
const TIMEFRAME_MAP: Record<Timeframe, number> = {
  Daily: 0,
  Weekly: 1,
  Monthly: 2,
  Total: 3,
};

/**
 * getProfitByBot source per drawer bot type. Terminal deals live in the DCA
 * deals collection, like the legacy dashboard queried them.
 */
const PROFIT_BOT_TYPE: Partial<Record<DrawerBotType, BotTypesEnum>> = {
  grid: BotTypesEnum.grid,
  dca: BotTypesEnum.dca,
  terminal: BotTypesEnum.dca,
  combo: BotTypesEnum.combo,
  hedgeDca: BotTypesEnum.hedgeDca,
  hedgeCombo: BotTypesEnum.hedgeCombo,
};

// ---------- widget ----------

export interface DrawerGridProfitChartProps {
  widgetId: string;
  botId?: string;
  bot?: DrawerBot;
  /** Drawer bot type; non-grid bots chart closed-deal profit in USD only. */
  botType?: DrawerBotType;
}

const DrawerGridProfitChart: React.FC<DrawerGridProfitChartProps> = ({
  widgetId,
  botId,
  bot: botProp,
  botType = 'grid',
}) => {
  const isGrid = botType === 'grid';
  const gridBot = botProp as unknown as GridBot | undefined;
  const actualBotId = botId || gridBot?._id || '';

  // State
  const [timeframe, setTimeframe] = useState<Timeframe>('Daily');
  const [selectedCurrency, setCurrency] = useState<GridCurrency>('usd');
  // For DCA/Combo/Hedge the backend's base/quote are both the deal's raw
  // profit.total (in whatever currency the deal booked it), so only USD is
  // meaningful there — the legacy deal-bot chart was USD-only too.
  const currency: GridCurrency = isGrid ? selectedCurrency : 'usd';

  const baseAsset = gridBot?.symbol?.baseAsset ?? 'BASE';
  const quoteAsset = gridBot?.symbol?.quoteAsset ?? 'QUOTE';
  const profitCurrency = gridBot?.settings?.profitCurrency ?? 'quote';
  const latestPrice = gridBot?.lastPrice ?? 0;
  const timeZone = useAccountTimeZone();
  const weekStart = useAuthStore((s) => s.user?.weekStart);

  // Fetch profit data from backend — mirrors legacy getProfitByBot call
  const { profitEntries, isLoading } = useGridBotProfit({
    botId: actualBotId,
    // Bucket in the zone the chart is drawn in, even when the account has no
    // usable zone of its own and the browser's stands in for it.
    timezone: timeZone,
    timeframe: TIMEFRAME_MAP[timeframe],
    botType: PROFIT_BOT_TYPE[botType] ?? BotTypesEnum.grid,
    enabled: !!actualBotId,
  });

  // Build chart data mapped to the selected currency, with empty-day fill.
  // `date` is a display label ("Aug 24", "Aug", "2026-W34") that can repeat
  // across the range, and recharts resolves an axis tooltip by matching the
  // axis value — so the axis is keyed on the row index (`withAxisIndex`).
  const chartData = useMemo(
    () =>
      withAxisIndex(
        buildChartData(profitEntries, {
          showCurrency: currency,
          profitCurrency,
          latestPrice,
          timeframe: TIMEFRAME_MAP[timeframe],
          timeZone,
          weekStart,
          now: Date.now(),
        })
      ),
    [
      profitEntries,
      currency,
      profitCurrency,
      latestPrice,
      timeframe,
      timeZone,
      weekStart,
    ]
  );

  // The tooltip's default date line formats `fullDate` in the BROWSER's zone,
  // which names the wrong day whenever it differs from the account's. Daily
  // rows are account-zone midnights; weekly rows are UTC calendar days.
  const tooltipLabel = useMemo(() => {
    if (timeframe !== 'Daily' && timeframe !== 'Weekly') return undefined;
    const zone = timeframe === 'Daily' ? timeZone : 'UTC';
    return (axisValue: unknown): React.ReactNode => {
      const row = chartData[Number(axisValue)];
      const date = row ? new Date(row.fullDate) : new Date(NaN);
      if (Number.isNaN(date.getTime())) return row?.label ?? '';
      return date.toLocaleDateString('en-US', {
        timeZone: zone,
        weekday: 'short',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    };
  }, [timeframe, timeZone, chartData]);

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
        isGrid && (
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
        )
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
                <Tooltip
                  content={<CustomTooltip labelFormatter={tooltipLabel} />}
                  cursor={false}
                />
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
