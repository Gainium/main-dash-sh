import { useGraphQL } from '@/hooks/useGraphQL';
import { useNowTick } from '@/hooks/useNowTick';
import {
  getTimezoneAwareMidnightISO,
  getValidTimezone,
} from '@/utils/timeUtils';
import { GraphQlQuery, type ReturnResult } from '@/lib/api';
import { CHART_COLORS } from '@/lib/colors';
import logger from '@/lib/loggerInstance';
import EmptyState from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import type { ProfitQuery, Profit as ProfitResultItem } from '@/types';
import { BarChart3 } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  useWidgetSettings,
  type ProfitWidgetSettings,
} from '../../../hooks/useWidgetSettings';
import { useAuthStore } from '../../../stores/authStore';
import { useUIStore } from '../../../stores/uiStore';
import CustomTooltip from '../../charts/CustomTooltip';
import WidgetWrapper from '../WidgetWrapper';
import { TimeframeButtons } from '../shared/TimeframeButtons';
import WidgetStats from '../shared/WidgetStats';
import { getWidgetMetadata } from './index';

type ProfitData_API = ProfitQuery;

// Interface for processed profit data
interface ProfitData {
  today: number;
  yesterday: number;
  difference: number;
  differencePercent: number;
  avgDaily: number;
  chartData: Array<{
    date: string;
    value: number;
    fullDate: string;
    label: string;
  }>;
}

export interface ProfitProps {
  widgetId?: string;
  isEditable?: boolean;
  isCollapsible?: boolean;
  allowResize?: boolean; // Controls whether height styles are applied (for grid layouts)
  height?: string | number;
  hideHeaderValue?: boolean; // Hide the primary/secondary/change value block in the widget header
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

export const Profit: React.FC<ProfitProps> = ({
  widgetId = 'profit',
  isEditable = false,
  isCollapsible = true,
  allowResize = true,
  height = '200px',
  hideHeaderValue = false,
  onRemove,
  onSettings,
  onCollapse,
  onTabMove,
  menuActions,
}) => {
  // Use the generic widget settings hook with type safety
  const { usePersistedState } =
    useWidgetSettings<ProfitWidgetSettings>(widgetId);

  // Get privacy mode state
  const privacyMode = useUIStore((s) => s.privacyMode);

  // Get user timezone
  const user = useAuthStore((s) => s.user);
  // Stored timezone is free-text and may be an invalid IANA id (e.g. the
  // localized "Europa/Roma"), which makes getProfitByUser return NOTOK and
  // Intl throw — blanking this widget. Sanitize to a valid zone.
  const userTimezone = getValidTimezone(user?.timezone);

  // Persisted settings for this widget instance
  const [timeFilter, setTimeFilter] = usePersistedState('timeFilter', 'Daily');
  const [customName, setCustomName] = usePersistedState('customName', '');

  // Local UI state (not persisted)
  const [showOptionsDialog, setShowOptionsDialog] = useState(false);

  //0 - daily, 1 - weekly, 2 - monthly, 3 - total
  const [timeframe, setTimeframe] = useState(0);

  const profitQuery = useMemo(
    () =>
      GraphQlQuery.getProfitByUser(
        {
          timezone: userTimezone,
          timeframe,
        },
        'quote\ndate'
      ),
    [timeframe, userTimezone]
  );

  const { data: profitResponse, isLoading: profitLoading } =
    useGraphQL<ProfitData_API>('getProfitByUser', profitQuery);

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

  // Coarse minute-bucketed clock so the "today" boundary below rolls over at
  // midnight even when `profitResponse` stays referentially stable (react-query
  // structural sharing) — otherwise the captured `new Date()` would freeze and
  // the Daily chart's 30-day window would never advance to the new day.
  const nowTick = useNowTick();

  // Helper function to convert GraphQL response to our ProfitData format.
  // Memoized so the (heavy) transform below can run only when its inputs
  // change, not on every render.
  const processGraphQLData = useCallback(
    (response: ReturnResult<ProfitData_API> | undefined): ProfitData => {
    // TIMEZONE FIX: Backend returns ISO dates at midnight in user's timezone
    // e.g., for Europe/Kyiv (UTC+2), midnight is returned as "2024-01-15T22:00:00.000Z"
    // (which is 22:00 on Jan 14 in UTC, representing midnight Jan 15 in Kyiv)
    // We need to generate keys that match this format.

    // Calendar date (YYYY-MM-DD) in the user's timezone. The backend keys daily
    // rows by the timezone's STANDARD-offset midnight and does NOT apply DST, so
    // in summer its instants (e.g. Europe/Rome "…T23:00:00Z") never match a
    // DST-aware midnight (`…T22:00:00Z`). Matching on the calendar day instead of
    // an exact ISO instant stays correct across DST in both directions.
    const toTzDateKey = (date: Date): string =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: userTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date);

    // If no data or error, return fallback data
    if (!response || response.status !== 'OK' || !response.data?.result) {
      logger.warn('[ProfitWidget] No valid data from GraphQL', {
        hasResponse: !!response,
        status: response?.status,
        hasData: !!response?.data,
        hasResult: !!response?.data?.result,
      });
      return {
        today: 0,
        yesterday: 0,
        difference: 0,
        differencePercent: 0,
        avgDaily: 0,
        chartData: [],
      };
    }

    const results = response.data.result;
    logger.debug('[ProfitWidget-WeeklyTooltipFix] Processing profit data', {
      resultCount: results.length,
      timeframe,
      sampleData: results.slice(0, 3),
    });

    // Helper function to parse dates based on timeframe
    const parseDate = (dateValue: string | number, timeframe: number): Date => {
      if (timeframe === 0) {
        // Daily: full ISO date string
        return new Date(dateValue as string);
      } else if (timeframe === 1) {
        // Weekly: format like "2025-27" (year-week)
        const [year, week] = String(dateValue).split('-').map(Number);
        // Calculate the first day of the given week
        // January 1st of the year
        const jan1 = new Date(year, 0, 1);
        // Find the first Monday of the year (ISO week standard)
        const jan1Day = jan1.getDay();
        const daysToFirstMonday =
          jan1Day === 1 ? 0 : jan1Day === 0 ? 1 : 8 - jan1Day;
        // Calculate the start of the target week
        const firstMondayOfYear = new Date(year, 0, 1 + daysToFirstMonday);
        const targetWeekStart = new Date(firstMondayOfYear);
        targetWeekStart.setDate(firstMondayOfYear.getDate() + (week - 1) * 7);
        return targetWeekStart;
      } else if (timeframe === 2) {
        // Monthly: format like "2024-8" (year-month)
        const [year, month] = String(dateValue).split('-').map(Number);
        return new Date(year, month - 1, 1);
      } else {
        // Total: timestamp
        return new Date(dateValue as number);
      }
    };

    // parseDate can yield an Invalid Date when a result row carries a missing
    // or malformed `date` (e.g. undefined timestamp, unparseable string). Calling
    // toISOString() on an invalid Date throws "Invalid time value" and crashes
    // the whole widget, so fall back to an empty tooltip date instead.
    const safeISO = (d: Date): string =>
      Number.isNaN(d.getTime()) ? '' : d.toISOString();

    // Create a map of existing data points
    const dataMap = new Map<string, number>();
    results.forEach((item: ProfitResultItem) => {
      if (item.date === undefined || item.date === null) {
        logger.warn(
          '[ProfitWidget] Skipping result row with missing date',
          item
        );
        return;
      }
      // Daily rows are matched by tz calendar day (DST-safe); other timeframes
      // use the backend's own key format ("2026-13" week, "2026-5" month, etc.).
      // A malformed daily `date` yields an Invalid Date, and toTzDateKey's
      // Intl.DateTimeFormat.format() THROWS "Invalid time value" on it (unlike
      // toLocaleDateString, which returns "Invalid Date"), crashing the whole
      // widget. Skip such rows the same way we skip missing dates.
      let key: string;
      if (timeframe === 0) {
        const parsed = new Date(item.date as string);
        if (Number.isNaN(parsed.getTime())) {
          logger.warn(
            '[ProfitWidget] Skipping daily result row with unparseable date',
            item
          );
          return;
        }
        key = toTzDateKey(parsed);
      } else {
        key = item.date.toString();
      }
      dataMap.set(key, item.quote || 0);
    });

    // Use quote values (not base) as they contain the actual profit data
    const getValue = (item: ProfitResultItem) => item.quote || 0;

    // Generate complete time series based on timeframe
    const generateTimeSeries = (): Array<{
      date: string | number;
      value: number;
    }> => {
      // `nowTick` (minute-bucketed) makes this recompute across midnight so the
      // day window rolls over even when the response reference is unchanged.
      const today = new Date(nowTick);
      const timeSeries: Array<{ date: string | number; value: number }> = [];

      if (timeframe === 0) {
        // Daily: Generate last 30 days
        for (let i = 29; i >= 0; i--) {
          const date = new Date(today);
          date.setDate(today.getDate() - i);
          // Display key stays the tz-aware midnight ISO; the data lookup uses the
          // tz calendar day so it matches the backend's non-DST daily instants.
          const dateString = getTimezoneAwareMidnightISO(date, userTimezone);
          const value = dataMap.get(toTzDateKey(date)) || 0;
          timeSeries.push({ date: dateString, value });
        }
      } else if (timeframe === 1) {
        // Weekly: legacy behavior, from first available week up to next week
        const sorted = [...results].sort(
          (a, b) =>
            parseDate(a.date, timeframe).getTime() -
            parseDate(b.date, timeframe).getTime()
        );

        if (sorted.length > 0) {
          const oneWeek = 7 * 24 * 60 * 60 * 1000;
          const endTime = today.getTime() + oneWeek;
          let startTime = parseDate(sorted[0].date, timeframe).getTime();

          sorted.forEach((item) => {
            const profitWeekTime = parseDate(item.date, timeframe).getTime();

            if (profitWeekTime === startTime) {
              timeSeries.push({ date: item.date, value: getValue(item) });
              startTime += oneWeek;
              return;
            }

            const nextTime = profitWeekTime - oneWeek;
            for (let i = startTime; i <= nextTime; i += oneWeek) {
              const d = new Date(i);
              const year = d.getFullYear();
              const jan1 = new Date(year, 0, 1);
              const jan1Day = jan1.getDay();
              const daysToFirstMonday =
                jan1Day === 1 ? 0 : jan1Day === 0 ? 1 : 8 - jan1Day;
              const firstMondayOfYear = new Date(
                year,
                0,
                1 + daysToFirstMonday
              );
              const daysDiff = Math.floor(
                (d.getTime() - firstMondayOfYear.getTime()) /
                  (24 * 60 * 60 * 1000)
              );
              const weekNum = Math.max(1, Math.floor(daysDiff / 7) + 1);
              // Same guard as the trailing fill below: our week arithmetic and
              // the backend's week key can name the same week, and a repeated
              // `date` makes the chart's tooltip resolve to the first row
              // carrying it rather than the hovered one.
              const weekDate = `${year}-${weekNum}`;
              if (!timeSeries.find((entry) => entry.date === weekDate)) {
                timeSeries.push({ date: weekDate, value: 0 });
              }
            }

            timeSeries.push({ date: item.date, value: getValue(item) });
            startTime = profitWeekTime + oneWeek;
          });

          if (timeSeries.length && startTime <= endTime) {
            for (let i = startTime; i <= endTime; i += oneWeek) {
              const d = new Date(i);
              const year = d.getFullYear();
              const jan1 = new Date(year, 0, 1);
              const jan1Day = jan1.getDay();
              const daysToFirstMonday =
                jan1Day === 1 ? 0 : jan1Day === 0 ? 1 : 8 - jan1Day;
              const firstMondayOfYear = new Date(
                year,
                0,
                1 + daysToFirstMonday
              );
              const daysDiff = Math.floor(
                (d.getTime() - firstMondayOfYear.getTime()) /
                  (24 * 60 * 60 * 1000)
              );
              const weekNum = Math.max(1, Math.floor(daysDiff / 7) + 1);
              const weekDate = `${year}-${weekNum}`;
              if (!timeSeries.find((entry) => entry.date === weekDate)) {
                timeSeries.push({ date: weekDate, value: 0 });
              }
            }
          }
        }
      } else if (timeframe === 2) {
        // Monthly: Generate last 12 months
        for (let i = 11; i >= 0; i--) {
          const date = new Date(today);
          date.setMonth(today.getMonth() - i);
          const year = date.getFullYear();
          const month = date.getMonth() + 1;
          const monthString = `${year}-${month}`;
          const value = dataMap.get(monthString) || 0;
          timeSeries.push({ date: monthString, value });
        }
      } else {
        // Total: Use existing data as-is
        results.forEach((item: ProfitResultItem) => {
          if (item.date === undefined || item.date === null) {
            return;
          }
          timeSeries.push({ date: item.date, value: getValue(item) });
        });
      }

      return timeSeries;
    };

    const timeSeries = generateTimeSeries();

    logger.debug('[ProfitWidget] Generated time series with timezone', {
      timeframe,
      userTimezone,
      seriesCount: timeSeries.length,
      sampleKeys: timeSeries.slice(-3).map((t) => t.date),
      sampleDataKeys: Array.from(dataMap.keys()).slice(-3),
    });

    logger.debug('[ProfitWidget-WeeklyTooltipFix] Generated time series', {
      timeframe,
      seriesCount: timeSeries.length,
      sampleSeries: timeSeries.slice(-3),
    });

    // Sort by date to ensure correct order
    const sortedResults = timeSeries.sort((a, b) => {
      const dateA = parseDate(a.date, timeframe);
      const dateB = parseDate(b.date, timeframe);
      return dateA.getTime() - dateB.getTime();
    });

    // Calculate profit values based on timeframe
    let today: number;
    let yesterday: number;
    let difference: number;
    let differencePercent: number;
    let avgDaily: number;

    if (timeframe === 3) {
      // Total timeframe - only one data point with cumulative profit
      today = sortedResults.length > 0 ? sortedResults[0].value : 0;
      yesterday = 0; // No previous period for total
      difference = today;
      differencePercent = 0;
      avgDaily = 0; // Not meaningful for total
    } else {
      // For daily, weekly, monthly - use last two periods
      today =
        sortedResults.length > 0
          ? sortedResults[sortedResults.length - 1].value
          : 0;
      yesterday =
        sortedResults.length > 1
          ? sortedResults[sortedResults.length - 2].value
          : 0;
      difference = today - yesterday;
      differencePercent =
        yesterday !== 0 ? (difference / Math.abs(yesterday)) * 100 : 0;

      // Legacy behavior: average over full displayed range (including zero periods)
      const totalProfit = results.reduce(
        (sum: number, item) => sum + getValue(item),
        0
      );
      avgDaily =
        sortedResults.length > 0 ? totalProfit / sortedResults.length : 0;
    }

    // Convert to chart data format
    const chartData = sortedResults.map((item) => {
      const date = parseDate(item.date, timeframe);

      let shortDate: string;
      let label: string;
      let fullDateForTooltip: string;

      if (timeframe === 0) {
        // Daily format
        shortDate = date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        });
        label = date.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
        fullDateForTooltip = safeISO(date);
      } else if (timeframe === 1) {
        // Weekly format
        const weekNum = String(item.date).split('-')[1];
        shortDate = `W${weekNum}`;
        label = `Week ${weekNum}, ${date.getFullYear()}`;
        // Use the Monday of the week for the tooltip
        fullDateForTooltip = safeISO(date);
      } else if (timeframe === 2) {
        // Monthly format
        shortDate = date.toLocaleDateString('en-US', {
          month: 'short',
        });
        label = date.toLocaleDateString('en-US', {
          month: 'long',
          year: 'numeric',
        });
        fullDateForTooltip = safeISO(date);
      } else {
        // Total format
        shortDate = 'Total';
        label = 'Total Profit';
        fullDateForTooltip = new Date().toISOString();
      }

      return {
        date: shortDate,
        value: item.value,
        fullDate: fullDateForTooltip,
        label,
      };
    });

    return {
      today,
      yesterday,
      difference,
      differencePercent,
      avgDaily,
      chartData,
    };
    },
    [userTimezone, timeframe, nowTick]
  );

  // Helper: legacy Total tab averages are derived from cumulative total profit.
  // `nowTick` (minute-bucketed) is the only reactive dep — it keeps the
  // day/week/month denominators sliding while the widget stays mounted.
  const computeTotalAverages = useCallback(
    (
      response: ReturnResult<ProfitData_API> | undefined,
      precision = 2
    ): { daily: number; weekly: number; monthly: number } => {
    if (!response || response.status !== 'OK' || !response.data?.result)
      return { daily: 0, weekly: 0, monthly: 0 };

    const first = response.data.result[0];
    if (!first) return { daily: 0, weekly: 0, monthly: 0 };

    const value = first.quote || 0;
    const dateValue = first.date;
    const startTime =
      typeof dateValue === 'number' ? dateValue : new Date(dateValue).getTime();

    if (!Number.isFinite(startTime) || startTime <= 0) {
      return { daily: 0, weekly: 0, monthly: 0 };
    }

    const now = new Date(nowTick);
    const days = Math.max(
      1,
      Math.ceil((now.getTime() - startTime) / (1000 * 3600 * 24))
    );
    const weeks = Math.max(1, Math.ceil(days / 7));

    let months = (now.getFullYear() - new Date(startTime).getFullYear()) * 12;
    months -= new Date(startTime).getMonth();
    months += now.getMonth() + 1;
    if (months < 0) months = 0;

    const round = (n: number) => Number(n.toFixed(precision));
    return {
      daily: round(value / days),
      weekly: round(value / weeks),
      monthly: round((months ? value / months : value) || 0),
    };
    },
    [nowTick]
  );

  // Process the GraphQL data (memoized: only recompute when the response or
  // the transform's inputs change).
  const realProfitData = useMemo(
    () => processGraphQLData(profitResponse),
    [processGraphQLData, profitResponse]
  );

  // Update timeframe when time filter changes
  useEffect(() => {
    const timeframeMap: { [key: string]: number } = {
      Daily: 0,
      Weekly: 1,
      Monthly: 2,
      Total: 3,
    };

    const newTimeframe = timeframeMap[timeFilter];
    if (newTimeframe !== undefined && newTimeframe !== timeframe) {
      setTimeframe(newTimeframe);
    }
  }, [timeFilter, timeframe]);

  // Create stats data array for the WidgetStats component
  const createStatsData = useMemo(() => {
    const stats = [];

    // First stat - Today/This Period
    stats.push({
      label:
        timeFilter === 'Total'
          ? 'Total Profit'
          : timeFilter === 'Monthly'
            ? 'This Month'
            : timeFilter === 'Weekly'
              ? 'This Week'
              : 'Today',
      value: privacyMode ? 0 : realProfitData.today,
      ...(privacyMode && { textValue: '***' }),
    });

    if (timeFilter === 'Total') {
      // Legacy behavior: derive averages from total cumulative value and start date
      const averages = computeTotalAverages(profitResponse);

      stats.push({
        label: 'Daily',
        value: privacyMode ? 0 : averages.daily,
        ...(privacyMode && { textValue: '***' }),
      });
      stats.push({
        label: 'Weekly',
        value: privacyMode ? 0 : averages.weekly,
        ...(privacyMode && { textValue: '***' }),
      });
      stats.push({
        label: 'Monthly',
        value: privacyMode ? 0 : averages.monthly,
        ...(privacyMode && { textValue: '***' }),
      });
    } else {
      // Conditional stats for non-Total timeframes
      // Second stat - Yesterday/Last Period
      stats.push({
        label:
          timeFilter === 'Monthly'
            ? 'Last Month'
            : timeFilter === 'Weekly'
              ? 'Last Week'
              : 'Yesterday',
        value: privacyMode ? 0 : realProfitData.yesterday,
        ...(privacyMode && { textValue: '***' }),
      });

      // Third stat - Change
      stats.push({
        label: 'Change',
        value: privacyMode ? 0 : realProfitData.difference,
        ...(privacyMode && { textValue: '***' }),
        badge: {
          value: privacyMode ? 0 : realProfitData.differencePercent,
          ...(privacyMode && { textValue: '***' }),
        },
      });

      // Fourth stat - Average
      stats.push({
        label:
          timeFilter === 'Monthly'
            ? 'Avg monthly'
            : timeFilter === 'Weekly'
              ? 'Avg weekly'
              : 'Avg daily',
        value: privacyMode ? 0 : realProfitData.avgDaily,
        ...(privacyMode && { textValue: '***' }),
      });
    }

    return stats;
  }, [
    realProfitData,
    timeFilter,
    privacyMode,
    profitResponse,
    computeTotalAverages,
  ]);

  // Distinguish initial load from "loaded but no profit history yet."
  const isInitialLoad = profitLoading && !profitResponse;
  const hasNoProfitData =
    !!profitResponse &&
    (realProfitData.chartData.length === 0 ||
      realProfitData.chartData.every((d) => d.value === 0));

  // Initial-load skeleton. Fully static, so memoize once. Rendered by the
  // conditional return at the very bottom (after all hooks) to keep
  // rules-of-hooks intact.
  const skeletonContent = useMemo(
    () => (
      <div
        className="flex flex-col h-full p-md bg-card @container"
        aria-busy="true"
      >
        <div className="grid grid-cols-2 @[420px]:grid-cols-4 gap-sm mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-6 w-20" />
            </div>
          ))}
        </div>
        <div
          className="flex-1 mb-6 flex items-end gap-1"
          style={{ minHeight: '300px' }}
        >
          {Array.from({ length: 14 }).map((_, i) => (
            <Skeleton
              key={i}
              className="flex-1 rounded-sm"
              style={{ height: `${30 + ((i * 13) % 60)}%` }}
            />
          ))}
        </div>
        <div className="flex gap-xs justify-center">
          {['Daily', 'Weekly', 'Monthly', 'Total'].map((label) => (
            <Skeleton key={label} className="h-7 w-16" />
          ))}
        </div>
      </div>
    ),
    []
  );

  const content = useMemo(
    () => (
    <div className="flex flex-col h-full p-md bg-card @container">
      {/* Stats Section */}
      <WidgetStats stats={createStatsData} className="mb-6" />

      {/* Chart Area — absolute inset so ResponsiveContainer sizes against the
          parent's real rendered box, sidestepping the % height chain. min-h-0
          on the flex parent lets the chart shrink (rather than overflow and
          clip the timeframe buttons below) when stats wrap to two rows at
          narrow container widths. */}
      <div className="flex-1 mb-6 relative min-h-0">
        {hasNoProfitData ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <EmptyState
              icon={<BarChart3 className="w-6 h-6" />}
              title="No profit history yet"
              description="When your bots close deals, their profit will be charted here."
            />
          </div>
        ) : (
        <div className="absolute inset-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={realProfitData.chartData}
              margin={{
                top: 5,
                right: 5,
                left: 5,
                bottom: 5,
              }}
            >
              <defs>
                <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
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
                <linearGradient id="lossGradient" x1="0" y1="0" x2="0" y2="1">
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
                tickFormatter={(value) => (privacyMode ? '***' : `$${value}`)}
                width={40}
              />
              <Tooltip
                content={
                  <CustomTooltip
                    valueFormatter={
                      privacyMode ? () => ['***', ''] as const : undefined
                    }
                  />
                }
                cursor={false}
              />
              <Bar
                isAnimationActive={false} dataKey="value" radius={[4, 4, 0, 0]}>
                {realProfitData.chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={
                      entry.value >= 0
                        ? 'url(#profitGradient)'
                        : 'url(#lossGradient)'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        )}
      </div>

      {/* Time Filter Buttons */}
      <TimeframeButtons
        options={[
          { value: 'Daily', label: 'Daily' },
          { value: 'Weekly', label: 'Weekly' },
          { value: 'Monthly', label: 'Monthly' },
          { value: 'Total', label: 'Total' },
        ]}
        selectedTimeframe={timeFilter}
        onTimeframeChange={(value) => setTimeFilter(value)}
        widgetId={widgetId}
      />

      {/* Options handled by WidgetWrapper portal */}
    </div>
    ),
    [
      createStatsData,
      hasNoProfitData,
      realProfitData,
      privacyMode,
      timeFilter,
      setTimeFilter,
      widgetId,
    ]
  );

  // Calculate profit value for header
  const profitValue = useMemo(
    () => ({
      primary: privacyMode ? '***' : Math.abs(realProfitData.today),
      secondary: 'USD',
      change: {
        value: privacyMode ? '***' : Math.abs(realProfitData.difference),
        percentage: privacyMode ? '***' : realProfitData.differencePercent,
        isPositive: realProfitData.difference >= 0,
      },
    }),
    [privacyMode, realProfitData]
  );

  const metadata = useMemo(
    () => ({
      ...getWidgetMetadata('profit'),
      id: widgetId,
      title: customName || 'Profit over time',
      displayName: customName || 'Profit over time',
      ...(hideHeaderValue ? {} : { value: profitValue }),
      hasOptions: true,
    }),
    [widgetId, customName, hideHeaderValue, profitValue]
  );

  const renderOptionsContent = useCallback(
    () => (
      <div className="space-y-md">
        {/* Widget Name */}
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">
            Widget Name
          </label>
          <input
            type="text"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Profit over time"
            className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Leave empty to use the dynamic name based on filters
          </p>
        </div>
      </div>
    ),
    [customName, setCustomName]
  );

  const cacheQueries = useMemo(
    () => [
      {
        queryKey: 'getProfitByUser',
        variables: profitQuery.variables as Record<string, unknown>,
      },
    ],
    [profitQuery]
  );

  // Keep this as a memo (do NOT collapse to a plain literal): it stabilizes
  // inline-created values — the `menuActions` object with its inline `onOptions`
  // handler, `onCloseOptionsDialog`, and the `style` object. `WidgetWrapper` is
  // `React.memo`'d, so recreating these every render would defeat its memo and
  // re-render the wrapper on every parent render.
  const wrapperProps = useMemo(
    () => ({
      metadata,
      isEditable,
      isCollapsible,
      menuActions: {
        ...menuActions,
        onOptions: () => setShowOptionsDialog(true),
      },
      // Centralized options modal props
      showOptionsDialog,
      onCloseOptionsDialog: () => setShowOptionsDialog(false),
      optionsTitle: 'Widget Options',
      renderOptionsContent,
      ...(onRemove && { onRemove }),
      ...(onSettings && { onSettings }),
      ...(onCollapse && { onCollapse }),
      ...(onTabMove && { onTabMove }),
      // Track GraphQL query for stale-while-revalidate indicator
      cacheQueries,
      style: allowResize
        ? {}
        : {
            height: typeof height === 'number' ? `${height}px` : height,
            minHeight: typeof height === 'number' ? `${height}px` : height,
          },
    }),
    [
      metadata,
      isEditable,
      isCollapsible,
      menuActions,
      showOptionsDialog,
      renderOptionsContent,
      onRemove,
      onSettings,
      onCollapse,
      onTabMove,
      cacheQueries,
      allowResize,
      height,
    ]
  );

  if (isInitialLoad) {
    return (
      <WidgetWrapper
        metadata={{
          ...getWidgetMetadata('profit'),
          id: widgetId,
          title: customName || 'Profit over time',
          displayName: customName || 'Profit over time',
        }}
        isEditable={isEditable}
        isCollapsible={isCollapsible}
        style={
          allowResize
            ? {}
            : {
                height: typeof height === 'number' ? `${height}px` : height,
                minHeight: typeof height === 'number' ? `${height}px` : height,
              }
        }
      >
        {skeletonContent}
      </WidgetWrapper>
    );
  }

  return <WidgetWrapper {...wrapperProps}>{content}</WidgetWrapper>;
};

export default React.memo(Profit);
