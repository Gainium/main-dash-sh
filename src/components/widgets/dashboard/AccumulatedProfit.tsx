import { useGraphQL } from '@/hooks/useGraphQL';
import { GraphQlQuery } from '@/lib/api';
import { CHART_COLORS } from '@/lib/colors';
import { parseProfitBucketDate } from '@/utils/timeUtils';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  useWidgetSettings,
  type PortfolioWidgetSettings,
} from '../../../hooks/useWidgetSettings';
import { useUIStore } from '../../../stores/uiStore';
import CustomTooltip from '../../charts/CustomTooltip';
import WidgetStats from '../shared/WidgetStats';
import WidgetWrapper from '../WidgetWrapper';
import { getWidgetMetadata } from './index';

export interface AccumulatedProfitProps {
  widgetId?: string;
  isEditable?: boolean;
  isCollapsible?: boolean;
  onRemove?: () => void;
  onSettings?: () => void;
  onCollapse?: (widgetId: string, collapsed: boolean) => void;
  onTabMove?: (
    fromTabId: string,
    toWidgetId: string,
    toTabIndex: number
  ) => void;
  menuActions?: import('../WidgetWrapper').WidgetMenuActions;
}

// Interface for GraphQL response data structure
interface ProfitData_API {
  result: Array<{
    base: number | null;
    quote: number;
    date: string | number;
  }>;
}

/**
 * Which backend bucket size to request per filter. Each timeframe covers a
 * bounded window server-side — 0 = last 30 days (daily), 1 = last 24 weeks
 * (weekly), 2 = last 12 months (monthly) — so a filter has to pick a bucket
 * whose window actually reaches back far enough.
 */
const TIMEFRAME_BY_FILTER: Record<string, number> = {
  '7D': 0,
  '30D': 0,
  '90D': 1,
  All: 2,
};

/** How far back the selected filter looks; `null` = every bucket returned. */
const WINDOW_DAYS_BY_FILTER: Record<string, number | null> = {
  '7D': 7,
  '30D': 30,
  '90D': 90,
  All: null,
};

/** Timeframe 3 is the all-time aggregate: a single row summing every deal. */
const TOTAL_TIMEFRAME = 3;

export const AccumulatedProfit: React.FC<AccumulatedProfitProps> = ({
  widgetId = 'accumulated-profit',
  isEditable = false,
  isCollapsible = true,
  onRemove,
  onSettings,
  onCollapse,
  onTabMove,
  menuActions,
}) => {
  // Use the generic widget settings hook with type safety
  const { usePersistedState } =
    useWidgetSettings<PortfolioWidgetSettings>(widgetId);

  // Get privacy mode state
  const privacyMode = useUIStore((s) => s.privacyMode);

  // Persisted settings for this widget instance
  const [timeFilter, setTimeFilter] = usePersistedState('timeFilter', '30D');
  const [customName, setCustomName] = usePersistedState('customName', '');

  // Local UI state (not persisted)
  const [showOptionsDialog, setShowOptionsDialog] = useState(false);

  const timeframe = TIMEFRAME_BY_FILTER[timeFilter] ?? 0;

  // The series the chart draws. This MUST follow the selected filter: it used
  // to be pinned to `timeframe: 0`, which the backend caps at 30 daily buckets,
  // so 90D/All were padded with 60+ empty days and every stat was really a
  // 30-day figure no matter which button was active.
  const accumulatedProfitQuery = useMemo(
    () =>
      GraphQlQuery.getProfitByUser({
        timezone: 'UTC',
        timeframe,
      }),
    [timeframe]
  );

  // Use the same GraphQL approach as the Profit widget
  const {
    data: profitResponse,
    isLoading,
    error,
  } = useGraphQL<ProfitData_API>('getProfitByUser', accumulatedProfitQuery);

  // "Accumulated" profit means cumulative-to-date, so the headline total is the
  // user's all-time realised profit, not the sum of whatever window is on
  // screen. No windowed timeframe can supply that (even monthly stops at 12
  // months), so read it from the dedicated all-time aggregate.
  const totalProfitQuery = useMemo(
    () =>
      GraphQlQuery.getProfitByUser({
        timezone: 'UTC',
        timeframe: TOTAL_TIMEFRAME,
      }),
    []
  );

  const { data: totalProfitResponse, isLoading: isTotalLoading } =
    useGraphQL<ProfitData_API>('getProfitByUser', totalProfitQuery);

  // Extract profit data from the response
  const profitData = profitResponse?.data?.result || [];
  const allTimeTotal = totalProfitResponse?.data?.result?.[0]?.quote ?? 0;

  // Both reads feed every stat, so hold the whole widget until they land —
  // otherwise the total renders against a half-built series.
  const isAnyLoading = isLoading || isTotalLoading;

  // Listen for external options open events (e.g., from widget manager)
  useEffect(() => {
    const handleOpenOptions = (event: CustomEvent) => {
      if (event.detail.widgetId === widgetId) {
        setShowOptionsDialog(true);
      }
    };

    window.addEventListener(
      'openWidgetOptions',
      handleOpenOptions as EventListener
    );
    return () => {
      window.removeEventListener(
        'openWidgetOptions',
        handleOpenOptions as EventListener
      );
    };
  }, [widgetId]);

  // Process real profit data for chart display
  const getAccumulatedProfitData = () => {
    // If loading, return empty state
    if (isAnyLoading) {
      return {
        currentTotal: 0,
        change: 0,
        changePercent: 0,
        periodStart: 0,
        chartData: [],
      };
    }

    // Keep only the buckets inside the selected window. 'All' keeps everything
    // the backend returned. Rows arrive unordered and weekly/monthly keys
    // ("2026-13", "2026-4") are not Date-parseable, so decode before sorting.
    const windowDays = WINDOW_DAYS_BY_FILTER[timeFilter] ?? null;
    let windowStart: Date | null = null;
    if (windowDays !== null) {
      windowStart = new Date();
      windowStart.setDate(windowStart.getDate() - windowDays);
    }

    const buckets = profitData
      .filter((point) => point.date !== undefined && point.date !== null)
      .map((point) => ({
        date: parseProfitBucketDate(point.date, timeframe),
        profit: point.quote || 0,
      }))
      .filter((bucket) => !Number.isNaN(bucket.date.getTime()))
      .filter((bucket) => windowStart === null || bucket.date >= windowStart)
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    // Profit earned inside the window, and the accumulated total it built on.
    // Anchoring to the all-time total makes the curve end at the user's real
    // cumulative profit instead of restarting from zero each period.
    const change = buckets.reduce((sum, bucket) => sum + bucket.profit, 0);
    const currentTotal = allTimeTotal;
    const periodStart = currentTotal - change;
    const changePercent = periodStart !== 0 ? (change / periodStart) * 100 : 0;

    let accumulated = periodStart;
    const chartData = buckets.map((bucket) => {
      accumulated += bucket.profit;
      return {
        date: bucket.date.toISOString(),
        value: accumulated,
        label: bucket.date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        dailyProfit: bucket.profit,
        fullDate: bucket.date.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }),
      };
    });

    return { currentTotal, change, changePercent, periodStart, chartData };
  };

  const accumulatedProfitData = getAccumulatedProfitData();

  // Create stats data array for the WidgetStats component
  const createAccumulatedStatsData = () => {
    const stats = [];

    // First stat - Current Total
    stats.push({
      label: 'Current Total',
      value: privacyMode ? 0 : accumulatedProfitData.currentTotal,
      ...(privacyMode && { textValue: '***' }),
      showSign: false,
    });

    // Second stat - Period Start
    stats.push({
      label: 'Period Start',
      value: privacyMode ? 0 : accumulatedProfitData.periodStart,
      ...(privacyMode && { textValue: '***' }),
      showSign: false,
    });

    // Third stat - Change
    stats.push({
      label: 'Change',
      value: privacyMode ? 0 : accumulatedProfitData.change,
      ...(privacyMode && { textValue: '***' }),
      ...(!privacyMode && {
        badge: {
          value: accumulatedProfitData.changePercent,
        },
      }),
    });

    // Fourth stat - Performance
    stats.push({
      label: 'Performance',
      subLabel: `${timeFilter} period`,
      value: 0, // Not used since we have textValue
      textValue:
        accumulatedProfitData.changePercent >= 0 ? 'Rising' : 'Falling',
      icon: accumulatedProfitData.changePercent >= 0 ? '📈' : '📉',
    });

    return stats;
  };

  const content = (
    <div className="flex flex-col h-full p-md bg-card @container">
      {/* Loading State */}
      {isAnyLoading && (
        <div className="flex items-center justify-center h-full">
          <div className="text-muted-foreground">Loading profit data...</div>
        </div>
      )}

      {/* Error State */}
      {error && !isAnyLoading && (
        <div className="flex items-center justify-center h-full">
          <div className="text-destructive">Error: {error.message}</div>
        </div>
      )}

      {/* Data Content */}
      {!isAnyLoading && !error && (
        <>
          {/* Stats Section */}
          <WidgetStats stats={createAccumulatedStatsData()} className="mb-6" />

          {/* Chart Area */}
          <div className="flex-1 mb-6" style={{ minHeight: '300px' }}>
            <div className="w-full h-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={accumulatedProfitData.chartData}
                  margin={{
                    top: 5,
                    right: 5,
                    left: 5,
                    bottom: 5,
                  }}
                >
                  <defs>
                    <linearGradient
                      id="profitGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="var(--color-chart-4)"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--color-chart-4)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={CHART_COLORS.stroke}
                    opacity={0.3}
                  />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{
                      fill: 'currentColor',
                      fontSize: 10,
                      className: 'text-muted-foreground',
                    }}
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      return `${date.getMonth() + 1}/${date.getDate()}`;
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
                    tickFormatter={(value) =>
                      privacyMode ? '***' : `$${(value / 1000).toFixed(1)}k`
                    }
                    width={50}
                  />
                  <Tooltip
                    content={
                      <CustomTooltip
                        {...(privacyMode && {
                          valueFormatter: () => ['***', ''],
                        })}
                      />
                    }
                  />
                  <Area
                    isAnimationActive={false}
                    type="monotone"
                    dataKey="value"
                    stroke="var(--color-chart-4)"
                    strokeWidth={2}
                    fill="url(#profitGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Time Filter Buttons */}
          <div className="flex items-center justify-center gap-1">
            {['7D', '30D', '90D', 'All'].map((filter) => (
              <button
                key={filter}
                onClick={() => setTimeFilter(filter)}
                className={`px-3 py-1 text-xs rounded ${
                  filter === timeFilter
                    ? 'bg-muted text-foreground border border-border'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );

  // Calculate accumulated profit value for header
  const accumulatedProfitValue = {
    primary: privacyMode ? '***' : accumulatedProfitData.currentTotal,
    secondary: 'USD',
    change: {
      value: privacyMode ? '***' : accumulatedProfitData.change,
      percentage: privacyMode ? '***' : accumulatedProfitData.changePercent,
      isPositive: accumulatedProfitData.change >= 0,
    },
  };

  const wrapperProps = {
    metadata: {
      ...getWidgetMetadata('accumulated-profit'),
      id: widgetId,
      title: customName || 'Accumulated Profit',
      displayName: customName || 'Accumulated Profit',
      value: accumulatedProfitValue,
      hasOptions: true,
    },
    isEditable,
    isCollapsible,
    customName,
    onCustomNameChange: setCustomName,
    showOptionsDialog,
    onCloseOptionsDialog: () => setShowOptionsDialog(false),
    ...(onRemove && { onRemove }),
    ...(onSettings && { onSettings }),
    ...(onCollapse && { onCollapse }),
    ...(onTabMove && { onTabMove }),
    ...(menuActions && {
      menuActions: {
        ...menuActions,
      },
    }),
    cacheQueries: [
      {
        queryKey: 'getProfitByUser',
        variables: accumulatedProfitQuery.variables as Record<string, unknown>,
      },
      {
        queryKey: 'getProfitByUser',
        variables: totalProfitQuery.variables as Record<string, unknown>,
      },
    ],
  };

  return <WidgetWrapper {...wrapperProps}>{content}</WidgetWrapper>;
};

export default AccumulatedProfit;
