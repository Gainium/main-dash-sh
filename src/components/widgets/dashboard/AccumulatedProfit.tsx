import { useGraphQL } from '@/hooks/useGraphQL';
import { GraphQlQuery } from '@/lib/api';
import { CHART_COLORS } from '@/lib/colors';
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

  // Memoize the GraphQL query definition - changes only when dependencies change
  const accumulatedProfitQuery = useMemo(
    () =>
      GraphQlQuery.getProfitByUser({
        timezone: 'UTC',
        timeframe: 0, // Daily data
      }),
    [] // No dependencies - this query is static
  );

  // Use the same GraphQL approach as the Profit widget
  const {
    data: profitResponse,
    isLoading,
    error,
    refetch: refetchAccumulatedProfit,
  } = useGraphQL<ProfitData_API>('getProfitByUser', accumulatedProfitQuery);

  // Extract profit data from the response
  const profitData = profitResponse?.data?.result || [];

  // Refetch data when timeFilter changes
  useEffect(() => {
    refetchAccumulatedProfit();
  }, [timeFilter, refetchAccumulatedProfit]);

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

  // Helper function to get date range based on timeFilter
  const getDateRange = (filter: string) => {
    const today = new Date();
    let startDate: Date;

    switch (filter) {
      case '7D':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 7);
        break;
      case '30D':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 30);
        break;
      case '90D':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 90);
        break;
      case 'All':
      default:
        // For 'All', use data from first available date
        if (profitData.length > 0) {
          const sortedData = [...profitData]
            .filter((point) => point.date !== null && point.date !== undefined)
            .sort(
              (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
            );
          if (sortedData.length > 0) {
            startDate = new Date(sortedData[0].date);
          } else {
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 30); // Default to 30 days if no data
          }
        } else {
          startDate = new Date(today);
          startDate.setDate(today.getDate() - 30); // Default to 30 days if no data
        }
        break;
    }

    return { startDate, endDate: today };
  };

  // Process real profit data for chart display
  const getAccumulatedProfitDataForExchanges = (exchangeIds: string[]) => {
    // If loading, return empty state
    if (isLoading) {
      return {
        currentTotal: 0,
        previousTotal: 0,
        change: 0,
        changePercent: 0,
        periodStart: 0,
        periodEnd: 0,
        chartData: [],
      };
    }

    const { startDate, endDate } = getDateRange(timeFilter);

    // Create a map of existing profit data by date
    const profitMap = new Map<string, number>();
    profitData.forEach((point) => {
      if (point.date === undefined || point.date === null) {
        return;
      }
      const dateKey = new Date(point.date).toISOString().split('T')[0];
      profitMap.set(dateKey, point.quote);
    });

    // Generate complete date series for the selected period
    const dateSeriesData: Array<{
      date: string;
      value: number;
      label: string;
      dailyProfit: number;
      fullDate: string;
    }> = [];

    let accumulated = 0;
    const currentDate = new Date(startDate);

    // Calculate initial accumulated value up to start date
    const dataBeforeStart = profitData.filter(
      (point) => point.date && new Date(point.date) < startDate
    );
    const initialAccumulated = dataBeforeStart.reduce(
      (sum, point) => sum + point.quote,
      0
    );
    accumulated = initialAccumulated;

    // Generate daily data points for the entire period
    while (currentDate <= endDate) {
      const dateKey = currentDate.toISOString().split('T')[0];
      const dailyProfit = profitMap.get(dateKey) || 0;
      accumulated += dailyProfit;

      const label = currentDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });

      const fullDate = currentDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });

      dateSeriesData.push({
        date: currentDate.toISOString(),
        value: accumulated,
        label,
        dailyProfit,
        fullDate,
      });

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Calculate stats
    const currentTotal = accumulated;
    const periodStart = initialAccumulated;
    const change = currentTotal - periodStart;
    const changePercent = periodStart !== 0 ? (change / periodStart) * 100 : 0;

    // Apply exchange filters (simplified for now - in real app this would be more sophisticated)
    let multiplier = 1;
    if (!exchangeIds.includes('ALL')) {
      // Simulate different profit percentages for different exchanges
      const exchangeMultipliers: { [key: string]: number } = {
        binance: 0.45,
        coinbase: 0.25,
        kraken: 0.15,
        bybit: 0.1,
        kucoin: 0.05,
      };

      multiplier = exchangeIds.reduce((sum, exchangeId) => {
        return sum + (exchangeMultipliers[exchangeId] || 0);
      }, 0);

      multiplier = multiplier > 0 ? multiplier : 1;
    }

    return {
      currentTotal: currentTotal * multiplier,
      previousTotal: periodStart * multiplier,
      change: change * multiplier,
      changePercent,
      periodStart: periodStart * multiplier,
      periodEnd: currentTotal * multiplier,
      chartData: dateSeriesData.map((point) => ({
        ...point,
        value: point.value * multiplier,
        dailyProfit: point.dailyProfit * multiplier,
      })),
    };
  };

  const accumulatedProfitData = getAccumulatedProfitDataForExchanges(['ALL']);

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
      {isLoading && (
        <div className="flex items-center justify-center h-full">
          <div className="text-muted-foreground">Loading profit data...</div>
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <div className="flex items-center justify-center h-full">
          <div className="text-destructive">Error: {error.message}</div>
        </div>
      )}

      {/* Data Content */}
      {!isLoading && !error && (
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
    ],
  };

  return <WidgetWrapper {...wrapperProps}>{content}</WidgetWrapper>;
};

export default AccumulatedProfit;
