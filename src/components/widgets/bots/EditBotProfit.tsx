import { useOptionalGridPageContext } from '@/contexts/bots/grid/GridPageProvider';
import { useBotProfitChartData } from '@/hooks/useBotProfitChartData';
import { CHART_COLORS } from '@/lib/colors';
import { BotTypesEnum } from '@/types';
import { formatCurrency } from '@/utils/numberFormatter';
import {
  BarChart3,
  DollarSign,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../../components/ui/tabs';
import logger from '../../../lib/loggerInstance';
import CustomTooltip from '../../charts/CustomTooltip';
import { getCompatibilityDefaultSize } from '../DefaultWidgetSizes';
import { WidgetWrapper, type WidgetMenuActions } from '../WidgetWrapper';

// Timezone and date helper functions (matching old dashboard)
const timeToTimestamp = (time: string) => {
  const d = new Date(time);
  return new Date(
    Date.UTC(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      d.getHours(),
      d.getMinutes(),
      d.getSeconds(),
      d.getMilliseconds()
    )
  );
};

const convertDate = (date: string | Date, timezone?: string) => {
  return typeof date === 'string'
    ? new Date(
        new Date(date).toLocaleString('en-US', {
          timeZone: timezone || undefined, // Fallback to system timezone like old dashboard
        })
      )
    : new Date(
        date.toLocaleString('en-US', {
          timeZone: timezone || undefined, // Fallback to system timezone like old dashboard
        })
      );
};

// MathHelper.round() function (EXACTLY matching old dashboard implementation)
const MathHelper = {
  convertFromExponential: (num: number | string, precision = 2) => {
    return Number(num)
      .toFixed(Math.min(precision, 20))
      .replace(/(\.\d*?[1-9])0+$/, '$1')
      .replace(/\.*$/, '');
  },

  round: (_num: number, precision = 2, down = false, up = false): number => {
    let num = `${_num}`;
    if (`${_num}`.indexOf('e') !== -1) {
      num = MathHelper.convertFromExponential(_num, precision + 2);
    }
    const intPart = num.split('.')[0];
    if ((intPart?.length ?? 0) + precision > 20) {
      precision = 20 - intPart.length;
    }
    if (down) {
      const res = Number(
        `${Math.floor(Number(`${num}e${precision}`))}e-${precision}`
      );
      return isNaN(res) ? 0 : res;
    }
    if (up) {
      const res = Number(
        `${Math.ceil(Number(`${num}e${precision}`))}e-${precision}`
      );
      return isNaN(res) ? 0 : res;
    }
    const res = Number(
      `${Math.round(Number(`${num}e${precision}`))}e-${precision}`
    );
    return isNaN(res) ? 0 : res;
  },
};

interface EditBotProfitProps {
  widgetId: string;
  botId?: string;
  botType?: BotTypesEnum;
  isEditable?: boolean;
  onRemove?: () => void;
  onSettings?: () => void;
  onCollapse?: (widgetId: string, collapsed: boolean) => void;
  onTabMove?: (
    fromTabId: string,
    toWidgetId: string,
    toTabIndex: number
  ) => void;
  menuActions?: WidgetMenuActions;
}

const EditBotProfit: React.FC<EditBotProfitProps> = ({
  widgetId,
  botId: propBotId,
  botType,
  isEditable = false,
  onRemove,
  onSettings,
  onCollapse,
  onTabMove,
  menuActions,
}) => {
  const { id: routeBotId } = useParams<{ id: string }>();
  const gridPageContext = useOptionalGridPageContext();

  const actualBotId =
    propBotId ?? gridPageContext?.state.botId ?? routeBotId ?? '';
  const resolvedBotId = actualBotId || '';

  const effectiveBotType = useMemo(
    () => botType ?? gridPageContext?.state.botType ?? BotTypesEnum.dca,
    [botType, gridPageContext?.state.botType]
  );

  const isGridBot = effectiveBotType === BotTypesEnum.grid;

  const [activeTab, setActiveTab] = useState('daily');

  // Use the GraphQL hook to fetch profit data
  const {
    profitData: queryProfitData,
    isLoading: queryIsLoading,
    isError: queryIsError,
    hasValidResponse: queryHasValidResponse,
    error: queryError,
  } = useBotProfitChartData(resolvedBotId, effectiveBotType);

  const contextCharts = gridPageContext?.state.charts;
  const contextStatus = gridPageContext?.state.status;
  const contextErrorMessage = gridPageContext?.state.error;

  const profitData = useMemo(() => {
    if (isGridBot && contextCharts) {
      return contextCharts.profit ?? [];
    }
    return queryProfitData;
  }, [isGridBot, contextCharts, queryProfitData]);

  const hasValidResponse = useMemo(() => {
    if (isGridBot && contextCharts) {
      if (typeof contextCharts.hasProfitData === 'boolean') {
        return contextCharts.hasProfitData;
      }
      return (contextCharts.profit?.length ?? 0) > 0;
    }
    return queryHasValidResponse;
  }, [isGridBot, contextCharts, queryHasValidResponse]);

  const isLoading = useMemo(() => {
    if (!resolvedBotId) {
      return false;
    }

    if (isGridBot && contextStatus) {
      const hasData =
        (contextCharts?.hasProfitData ?? false) ||
        (contextCharts?.profit?.length ?? 0) > 0;
      return (
        (contextStatus === 'loading' || contextStatus === 'idle') && !hasData
      );
    }

    return queryIsLoading;
  }, [resolvedBotId, isGridBot, contextStatus, contextCharts, queryIsLoading]);

  const isError = useMemo(() => {
    if (isGridBot) {
      return Boolean(contextErrorMessage) && !isLoading && !hasValidResponse;
    }
    return queryIsError;
  }, [
    isGridBot,
    contextErrorMessage,
    isLoading,
    hasValidResponse,
    queryIsError,
  ]);

  const error = useMemo(() => {
    if (isGridBot && contextErrorMessage) {
      return new Error(contextErrorMessage);
    }
    return queryError;
  }, [isGridBot, contextErrorMessage, queryError]);

  // Process data for different timeframes and summary metrics
  const processedData = useMemo(() => {
    if (!hasValidResponse || !profitData || profitData.length === 0) {
      return {
        dailyData: [],
        weeklyData: [],
        monthlyData: [],
        equityData: [],
        summaryMetrics: {
          today: 0,
          yesterday: 0,
          difference: 0,
          differencePercent: 0,
          average: 0,
          total: 0,
        },
      };
    }

    // Convert timestamp data to daily aggregated data with timezone handling
    const dailyMap = new Map<string, number>();
    const tempProfit: Array<{ date: string; value: number }> = [];

    profitData.forEach((point: { value: number; time: number }) => {
      // Convert timestamp to date string using timezone-aware conversion
      const date = new Date(point.time);
      const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD format
      dailyMap.set(dateStr, (dailyMap.get(dateStr) || 0) + point.value);
      tempProfit.push({ date: dateStr, value: point.value });
    });

    // Sort tempProfit by date
    tempProfit.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Fill missing dates with zero values (EXACTLY like old dashboard)
    if (tempProfit.length > 2) {
      const start = timeToTimestamp(tempProfit[0].date).getTime();
      const end = timeToTimestamp(
        tempProfit[tempProfit.length - 1].date
      ).getTime();
      let index = 0;

      for (
        let i = start;
        i <= end;
        i = new Date(i + 24 * 60 * 60 * 1000).getTime()
      ) {
        if (timeToTimestamp(tempProfit[index].date).getTime() !== i) {
          tempProfit.splice(index, 0, {
            date: `${new Date(i)}`, // EXACT format from old dashboard
            value: 0,
          });
        }
        index++;
      }
    }

    // Create weekly data by aggregating daily data
    const weeklyMap = new Map<string, number>();
    Array.from(dailyMap.entries()).forEach(([dayKey, value]) => {
      const date = new Date(dayKey);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
      const weekKey = weekStart.toISOString().split('T')[0];
      weeklyMap.set(weekKey, (weeklyMap.get(weekKey) || 0) + value);
    });

    // Create monthly data by aggregating daily data
    const monthlyMap = new Map<string, number>();
    Array.from(dailyMap.entries()).forEach(([dayKey, value]) => {
      const date = new Date(dayKey);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + value);
    });

    // Convert to chart data format
    const createChartData = (dataMap: Map<string, number>) => {
      return Array.from(dataMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, value]) => ({
          date,
          value,
          formattedDate: new Date(date + 'T00:00:00').toLocaleDateString(),
        }));
    };

    const dailyChartData = createChartData(dailyMap);
    const weeklyChartData = createChartData(weeklyMap);
    const monthlyChartData = createChartData(monthlyMap);

    // Calculate equity curve (cumulative profit over time)
    let runningTotal = 0;
    const equityData = dailyChartData
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((item) => {
        runningTotal += item.value;
        return {
          ...item,
          equity: runningTotal,
        };
      });

    // Calculate summary metrics (EXACTLY matching old dashboard logic)
    let todayProfit = 0;
    let yesterdayProfit = 0;
    let total = 0;
    let average = 0;

    // Use precision like old dashboard (default to 2 since we can't access props)
    const precision = 2;

    logger.info('[EditBotProfit] Starting metric calculations', {
      dataPoints: tempProfit.length,
    });

    if (tempProfit.length > 0) {
      // Calculate total (EXACTLY like old dashboard)
      total = MathHelper.round(
        tempProfit.reduce((a, v) => (a += v.value), 0),
        precision
      );
      logger.info('[EditBotProfit] Total calculated:', total);

      // Calculate average (EXACTLY like old dashboard)
      average = MathHelper.round(total / tempProfit.length, precision);
      logger.info('[EditBotProfit] Average calculated:', average);

      // Calculate today/yesterday using EXACT timezone-aware logic from old dashboard
      const lastDay = tempProfit[tempProfit.length - 1];
      const lastDate = convertDate(lastDay.date).getTime();
      const currentDate = convertDate(new Date());

      // EXACT date normalization from old dashboard - set ALL time components to 0
      currentDate.setHours(0);
      currentDate.setMinutes(0);
      currentDate.setSeconds(0);
      currentDate.setMilliseconds(0);

      logger.info('[EditBotProfit] Last day date', {
        date: lastDay.date,
        value: lastDay.value,
      });
      logger.info('[EditBotProfit] Current date (normalized)', {
        currentDateNormalized: currentDate.toISOString().split('T')[0],
      });

      if (currentDate.getTime() === lastDate) {
        todayProfit = MathHelper.round(lastDay.value, precision);
        logger.info('[EditBotProfit] Today profit set to:', todayProfit);
      }

      if (tempProfit.length > 1) {
        const prevDay = tempProfit[tempProfit.length - 2];
        const prevDate = convertDate(prevDay.date).getTime();
        currentDate.setDate(currentDate.getDate() - 1);

        logger.info('[EditBotProfit] Previous day date', {
          date: prevDay.date,
          value: prevDay.value,
        });
        logger.info('[EditBotProfit] Yesterday date (normalized)', {
          yesterdayDate: currentDate.toISOString().split('T')[0],
        });

        if (currentDate.getTime() === prevDate) {
          yesterdayProfit = MathHelper.round(prevDay.value, precision);
          logger.info(
            '[EditBotProfit] Yesterday profit set to:',
            yesterdayProfit
          );
        }

        // Handle edge case where yesterday's data is the last entry (EXACTLY like old dashboard)
        if (currentDate.getTime() === lastDate) {
          yesterdayProfit = MathHelper.round(lastDay.value, precision);
          logger.info(
            '[EditBotProfit] Yesterday profit (edge case) set to:',
            yesterdayProfit
          );
        }
      }
    }

    // Calculate difference and percentage (EXACTLY like old dashboard)
    const difference = MathHelper.round(
      todayProfit - yesterdayProfit,
      precision
    );
    const differencePercent =
      yesterdayProfit === 0 && difference > 0
        ? 100 // EXACT edge case from old dashboard
        : MathHelper.round((difference / yesterdayProfit) * 100, 0); // Use precision 0 for percentage

    logger.info('[EditBotProfit] Final metrics', {
      today: todayProfit,
      yesterday: yesterdayProfit,
      difference,
      differencePercent,
      total,
      average,
    });

    return {
      dailyData: dailyChartData,
      weeklyData: weeklyChartData,
      monthlyData: monthlyChartData,
      equityData,
      summaryMetrics: {
        today: todayProfit,
        yesterday: yesterdayProfit,
        difference,
        differencePercent,
        average,
        total,
      },
    };
  }, [profitData, hasValidResponse]);

  // Calculate dynamic metrics based on active tab
  const dynamicMetrics = useMemo(() => {
    const precision = 2;

    if (!processedData.dailyData.length) {
      return {
        current: 0,
        previous: 0,
        difference: 0,
        differencePercent: 0,
        average: 0,
        total: 0,
        currentLabel: 'Today',
        previousLabel: 'Yesterday',
        averageLabel: 'Average',
      };
    }

    switch (activeTab) {
      case 'daily': {
        // Daily metrics: Today vs Yesterday
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const todayStr = today.toISOString().split('T')[0];
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        const todayProfit =
          processedData.dailyData.find((d) => d.date === todayStr)?.value || 0;
        const yesterdayProfit =
          processedData.dailyData.find((d) => d.date === yesterdayStr)?.value ||
          0;

        const difference = MathHelper.round(
          todayProfit - yesterdayProfit,
          precision
        );
        const differencePercent =
          yesterdayProfit === 0 && difference > 0
            ? 100
            : MathHelper.round((difference / yesterdayProfit) * 100, 0);

        // Average over last 30 days
        const last30Days = processedData.dailyData.slice(-30);
        const average =
          last30Days.length > 0
            ? MathHelper.round(
                last30Days.reduce((sum, d) => sum + d.value, 0) /
                  last30Days.length,
                precision
              )
            : 0;

        return {
          current: MathHelper.round(todayProfit, precision),
          previous: MathHelper.round(yesterdayProfit, precision),
          difference,
          differencePercent,
          average,
          total: MathHelper.round(
            processedData.dailyData.reduce((sum, d) => sum + d.value, 0),
            precision
          ),
          currentLabel: 'Today',
          previousLabel: 'Yesterday',
          averageLabel: 'Avg (30 days)',
        };
      }

      case 'weekly': {
        // Weekly metrics: This week vs Last week
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay()); // Start of current week (Sunday)
        startOfWeek.setHours(0, 0, 0, 0);

        const startOfLastWeek = new Date(startOfWeek);
        startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

        const thisWeekData = processedData.dailyData.filter((d) => {
          const date = new Date(d.date);
          return date >= startOfWeek;
        });

        const lastWeekData = processedData.dailyData.filter((d) => {
          const date = new Date(d.date);
          return date >= startOfLastWeek && date < startOfWeek;
        });

        const thisWeekProfit = thisWeekData.reduce(
          (sum, d) => sum + d.value,
          0
        );
        const lastWeekProfit = lastWeekData.reduce(
          (sum, d) => sum + d.value,
          0
        );

        const difference = MathHelper.round(
          thisWeekProfit - lastWeekProfit,
          precision
        );
        const differencePercent =
          lastWeekProfit === 0 && difference > 0
            ? 100
            : MathHelper.round((difference / lastWeekProfit) * 100, 0);

        const weeksData = [];
        const weekStart = new Date(startOfWeek);
        for (let i = 0; i < 24; i++) {
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);
          const weekData = processedData.dailyData.filter((d) => {
            const date = new Date(d.date);
            return date >= weekStart && date <= weekEnd;
          });
          const weekProfit = weekData.reduce((sum, d) => sum + d.value, 0);
          weeksData.push(weekProfit);
          weekStart.setDate(weekStart.getDate() - 7);
        }

        const average =
          weeksData.length > 0
            ? MathHelper.round(
                weeksData.reduce((sum, w) => sum + w, 0) / weeksData.length,
                precision
              )
            : 0;

        return {
          current: MathHelper.round(thisWeekProfit, precision),
          previous: MathHelper.round(lastWeekProfit, precision),
          difference,
          differencePercent,
          average,
          total: MathHelper.round(
            processedData.dailyData.reduce((sum, d) => sum + d.value, 0),
            precision
          ),
          currentLabel: 'This Week',
          previousLabel: 'Last Week',
          averageLabel: 'Avg (24 weeks)',
        };
      }

      case 'monthly': {
        // Monthly metrics: This month vs Last month
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(
          now.getFullYear(),
          now.getMonth() - 1,
          1
        );
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

        const thisMonthData = processedData.dailyData.filter((d) => {
          const date = new Date(d.date);
          return date >= startOfMonth;
        });

        const lastMonthData = processedData.dailyData.filter((d) => {
          const date = new Date(d.date);
          return date >= startOfLastMonth && date <= endOfLastMonth;
        });

        const thisMonthProfit = thisMonthData.reduce(
          (sum, d) => sum + d.value,
          0
        );
        const lastMonthProfit = lastMonthData.reduce(
          (sum, d) => sum + d.value,
          0
        );

        const difference = MathHelper.round(
          thisMonthProfit - lastMonthProfit,
          precision
        );
        const differencePercent =
          lastMonthProfit === 0 && difference > 0
            ? 100
            : MathHelper.round((difference / lastMonthProfit) * 100, 0);

        // Average over last 12 months
        const monthsData = [];
        for (let i = 0; i < 12; i++) {
          const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const monthEnd = new Date(
            now.getFullYear(),
            now.getMonth() - i + 1,
            0
          );
          const monthData = processedData.dailyData.filter((d) => {
            const date = new Date(d.date);
            return date >= monthStart && date <= monthEnd;
          });
          const monthProfit = monthData.reduce((sum, d) => sum + d.value, 0);
          monthsData.push(monthProfit);
        }

        const average =
          monthsData.length > 0
            ? MathHelper.round(
                monthsData.reduce((sum, m) => sum + m, 0) / monthsData.length,
                precision
              )
            : 0;

        return {
          current: MathHelper.round(thisMonthProfit, precision),
          previous: MathHelper.round(lastMonthProfit, precision),
          difference,
          differencePercent,
          average,
          total: MathHelper.round(
            processedData.dailyData.reduce((sum, d) => sum + d.value, 0),
            precision
          ),
          currentLabel: 'This Month',
          previousLabel: 'Last Month',
          averageLabel: 'Avg (12 months)',
        };
      }

      case 'total':
      default: {
        // Total metrics: Overall statistics
        const total = MathHelper.round(
          processedData.dailyData.reduce((sum, d) => sum + d.value, 0),
          precision
        );
        const dailyAvg =
          processedData.dailyData.length > 0
            ? MathHelper.round(
                total / processedData.dailyData.length,
                precision
              )
            : 0;

        // Calculate weekly average (keeping for future use)
        const _weeksCount = Math.ceil(processedData.dailyData.length / 7);
        MathHelper.round(total / Math.max(1, _weeksCount), precision); // Use but don't store

        // Calculate monthly average
        const monthsCount = Math.max(
          1,
          Math.ceil(processedData.dailyData.length / 30)
        );
        const monthlyAvg = MathHelper.round(total / monthsCount, precision);

        return {
          current: total,
          previous: 0, // Not applicable for total
          difference: 0, // Not applicable for total
          differencePercent: 0, // Not applicable for total
          average: dailyAvg,
          total,
          currentLabel: 'Total Profit',
          previousLabel: 'Daily',
          averageLabel: 'Weekly',
          extraMetric: monthlyAvg, // Monthly average
          extraLabel: 'Monthly',
        };
      }
    }
  }, [processedData, activeTab]);

  const wrapperProps = {
    metadata: {
      id: widgetId,
      type: 'edit-bot-profit',
      title: 'Profit Analysis',
      defaultSize: getCompatibilityDefaultSize('profit-chart'),
      minSize: { w: 6, h: 8 },
      maxSize: { w: 12, h: 16 },
      hasOptions: true,
    },
    isEditable,
    isCollapsible: true,
    noPadding: false,
    ...(onRemove && { onRemove }),
    ...(onSettings && { onSettings }),
    ...(onCollapse && { onCollapse }),
    ...(onTabMove && { onTabMove }),
    ...(menuActions && { menuActions }),
  };

  if (isLoading) {
    return (
      <WidgetWrapper {...wrapperProps}>
        <div className="flex items-center justify-center h-48">
          <div className="text-center text-muted-foreground">
            <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Loading profit data...</p>
          </div>
        </div>
      </WidgetWrapper>
    );
  }

  if (isError || !hasValidResponse) {
    return (
      <WidgetWrapper {...wrapperProps}>
        <div className="flex items-center justify-center h-48">
          <div className="text-center text-muted-foreground">
            <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Unable to load profit data</p>
            {error?.message && (
              <p className="text-xs mt-2 text-red-500/80">{error.message}</p>
            )}
          </div>
        </div>
      </WidgetWrapper>
    );
  }

  interface ChartDataPoint {
    date: string;
    value: number;
    formattedDate: string;
    equity?: number;
  }

  const renderChart = (data: ChartDataPoint[], dataKey: string = 'value') => (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={data}
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
            <stop offset="0%" stopColor="var(--color-loss)" stopOpacity={0.8} />
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
          dataKey="formattedDate"
          axisLine={false}
          tickLine={false}
          tick={{
            fill: 'currentColor',
            fontSize: 10,
            className: 'text-muted-foreground',
          }}
          angle={-45}
          textAnchor="end"
          height={60}
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
          tickFormatter={(value) => formatCurrency(value)}
          width={50}
        />
        <Tooltip content={<CustomTooltip />} cursor={false} />
        <Bar
          isAnimationActive={false} dataKey={dataKey} radius={[4, 4, 0, 0]} maxBarSize={50}>
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={
                entry.value >= 0 ? 'url(#profitGradient)' : 'url(#lossGradient)'
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );

  const renderMetrics = (metrics: typeof dynamicMetrics) => (
    <div className="bg-card/50 rounded-lg p-md mb-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-sm">
        <div className="text-center">
          <div className="flex items-center justify-center gap-xs mb-1">
            <DollarSign className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-medium">
              {metrics.currentLabel}
            </span>
          </div>
          <div className="text-lg font-bold text-foreground">
            {formatCurrency(metrics.current)}
          </div>
        </div>

        <div className="text-center">
          <div className="flex items-center justify-center gap-xs mb-1">
            <DollarSign className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-medium">
              {metrics.previousLabel}
            </span>
          </div>
          <div className="text-lg font-bold text-foreground">
            {activeTab === 'total'
              ? formatCurrency(metrics.average)
              : formatCurrency(metrics.previous)}
          </div>
        </div>

        {activeTab !== 'total' && (
          <div className="text-center">
            <div className="flex items-center justify-center gap-xs mb-1">
              {metrics.difference >= 0 ? (
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <TrendingDown className="w-4 h-4 text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground font-medium">
                Difference
              </span>
            </div>
            <div
              className={`text-lg font-bold ${metrics.difference >= 0 ? 'text-success' : 'text-destructive'}`}
            >
              {formatCurrency(metrics.difference)}
            </div>
            <div
              className={`text-xs ${metrics.differencePercent >= 0 ? 'text-success' : 'text-destructive'}`}
            >
              {metrics.differencePercent >= 0 ? '+' : ''}
              {metrics.differencePercent.toFixed(1)}%
            </div>
          </div>
        )}

        <div className="text-center">
          <div className="flex items-center justify-center gap-xs mb-1">
            <Target className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-medium">
              {metrics.averageLabel}
            </span>
          </div>
          <div className="text-lg font-bold text-foreground">
            {activeTab === 'total'
              ? formatCurrency(metrics.extraMetric || 0)
              : formatCurrency(metrics.average)}
          </div>
        </div>

        {activeTab !== 'total' && (
          <div className="text-center">
            <div className="flex items-center justify-center gap-xs mb-1">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">
                Total
              </span>
            </div>
            <div className="text-lg font-bold text-foreground">
              {formatCurrency(metrics.total)}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <WidgetWrapper {...wrapperProps}>
      <div className="p-lg">
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
            <TabsTrigger value="total">Total</TabsTrigger>
          </TabsList>

          <TabsContent value="daily" className="mt-4">
            <div className="space-y-md">
              {renderMetrics(dynamicMetrics)}
              <h4 className="text-md font-semibold">Daily Profit</h4>
              {processedData.dailyData.length > 0 ? (
                renderChart(processedData.dailyData)
              ) : (
                <div className="flex items-center justify-center h-48 text-muted-foreground">
                  No daily data available
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="weekly" className="mt-4">
            <div className="space-y-md">
              {renderMetrics(dynamicMetrics)}
              <h4 className="text-md font-semibold">Weekly Profit</h4>
              {processedData.weeklyData.length > 0 ? (
                renderChart(processedData.weeklyData)
              ) : (
                <div className="flex items-center justify-center h-48 text-muted-foreground">
                  No weekly data available
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="monthly" className="mt-4">
            <div className="space-y-md">
              {renderMetrics(dynamicMetrics)}
              <h4 className="text-md font-semibold">Monthly Profit</h4>
              {processedData.monthlyData.length > 0 ? (
                renderChart(processedData.monthlyData)
              ) : (
                <div className="flex items-center justify-center h-48 text-muted-foreground">
                  No monthly data available
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="total" className="mt-4">
            <div className="space-y-md">
              <h4 className="text-md font-semibold">Total Overview</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
                <div className="text-center p-md bg-muted/50 rounded-lg">
                  <div className="text-sm text-muted-foreground mb-1">
                    Total Profit
                  </div>
                  <div className="text-2xl font-bold text-foreground">
                    {formatCurrency(dynamicMetrics.total)}
                  </div>
                </div>
                <div className="text-center p-md bg-muted/50 rounded-lg">
                  <div className="text-sm text-muted-foreground mb-1">
                    Daily Average
                  </div>
                  <div className="text-2xl font-bold text-foreground">
                    {formatCurrency(dynamicMetrics.average)}
                  </div>
                </div>
                <div className="text-center p-md bg-muted/50 rounded-lg">
                  <div className="text-sm text-muted-foreground mb-1">
                    Monthly Average
                  </div>
                  <div className="text-2xl font-bold text-foreground">
                    {formatCurrency(dynamicMetrics.extraMetric || 0)}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </WidgetWrapper>
  );
};

export default EditBotProfit;
