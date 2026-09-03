import {
  Activity,
  BarChart3,
  Calendar,
  Clock,
  DollarSign,
  PieChart,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart as RechartsPieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  InfoIcon,
  Tooltip as InfoTooltip,
} from '@/components/ui/tooltip';
import { BOT_METRIC_DESCRIPTIONS } from '@/lib/botMetricDescriptions';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../../components/ui/tabs';
import getLatestPrices, { getLocalPrices } from '../../../helper/price';
import { useDcaBots } from '../../../hooks/useDcaBots';
import { useDcaDeals /* type DCADeals */ } from '../../../hooks/useDcaDeals';
import { useGridBots } from '../../../hooks/useGridBots';
import { useLiveUpdateWidget } from '../../../hooks/useLiveUpdateWidget';
import { useUserSettings } from '../../../hooks/useUserSettings';
import { useAuthStore } from '../../../stores/authStore';
import { useUIStore } from '../../../stores/uiStore';
import { calculateBotValue } from '../../../utils/botValueCalculation';
import { getCompatibilityDefaultSize } from '../DefaultWidgetSizes';
import { WidgetWrapper, type WidgetMenuActions } from '../WidgetWrapper';
import { DCADealStatusEnum, type DCABot, type DCADeals } from '@/types';
import { useUserFees } from '@/hooks/useUserFeesService';
import logger from '@/lib/loggerInstance';
import { useExchangesFromContext } from '@/contexts/ExchangeDataContext';

// Utility function to format duration in human-readable format
const formatDuration = (days: number): string => {
  if (days < 1) {
    const hours = Math.floor(days * 24);
    if (hours < 1) {
      const minutes = Math.floor(days * 24 * 60);
      return `${minutes}m`;
    }
    return `${hours}h`;
  } else if (days < 30) {
    return `${Math.floor(days)}d`;
  } else {
    const months = Math.floor(days / 30);
    const remainingDays = Math.floor(days % 30);
    return remainingDays > 0 ? `${months}mo ${remainingDays}d` : `${months}mo`;
  }
};

// Utility function to calculate confidence grade based on deal count
const calculateConfidenceGrade = (
  dealCount: number
): { grade: string; color: string; description: string } => {
  if (dealCount >= 100)
    return {
      grade: 'A+',
      color: 'text-green-600',
      description: 'Excellent statistical significance',
    };
  if (dealCount >= 50)
    return {
      grade: 'A',
      color: 'text-green-500',
      description: 'High statistical confidence',
    };
  if (dealCount >= 30)
    return {
      grade: 'B+',
      color: 'text-blue-600',
      description: 'Good statistical reliability',
    };
  if (dealCount >= 20)
    return {
      grade: 'B',
      color: 'text-blue-500',
      description: 'Moderate confidence',
    };
  if (dealCount >= 15)
    return {
      grade: 'C+',
      color: 'text-yellow-600',
      description: 'Fair confidence',
    };
  if (dealCount >= 10)
    return {
      grade: 'C',
      color: 'text-yellow-500',
      description: 'Limited confidence',
    };
  if (dealCount >= 5)
    return {
      grade: 'D',
      color: 'text-orange-500',
      description: 'Low confidence',
    };
  return {
    grade: 'F',
    color: 'text-red-500',
    description: 'Insufficient data',
  };
};

// Utility function to check if a deal is completed (with profit data)
const isCompletedDeal = (deal: DCADeals): boolean => {
  if (!deal || !deal.status || deal.profit?.totalUsd === undefined)
    return false;

  // Based on Deal History widget logic, only 'completed' status indicates a completed deal
  return (
    deal.status === DCADealStatusEnum.canceled ||
    deal.status === DCADealStatusEnum.closed
  );
};

// MathHelper.round() implementation from old dashboard
const mathRound = (
  num: number,
  precision = 2,
  down = false,
  up = false
): number => {
  let numStr = `${num}`;

  // Handle exponential notation
  if (`${num}`.indexOf('e') !== -1) {
    numStr = convertFromExponential(num, precision + 2);
  }

  const intPart = numStr.split('.')[0];
  let adjustedPrecision = precision;

  // Dynamically adjust precision if needed
  if ((intPart?.length ?? 0) + precision > 20) {
    adjustedPrecision = 20 - intPart.length;
  }

  if (down) {
    const res = Number(
      `${Math.floor(Number(`${numStr}e${adjustedPrecision}`))}e-${adjustedPrecision}`
    );
    return isNaN(res) ? 0 : res;
  }

  if (up) {
    const res = Number(
      `${Math.ceil(Number(`${numStr}e${adjustedPrecision}`))}e-${adjustedPrecision}`
    );
    return isNaN(res) ? 0 : res;
  }

  const res = Number(
    `${Math.round(Number(`${numStr}e${adjustedPrecision}`))}e-${adjustedPrecision}`
  );
  return isNaN(res) ? 0 : res;
};

// Helper function to convert exponential notation
const convertFromExponential = (num: number, precision: number): string => {
  return num.toFixed(precision);
};

// Timezone-aware date conversion function (from old dashboard)
const convertDate = (date: string | Date, timezone?: string) => {
  const convertedDate =
    typeof date === 'string'
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

  // Normalize to start of day for consistent daily grouping (like old dashboard)
  convertedDate.setHours(0, 0, 0, 0);
  return convertedDate;
};

// Progress Bar Component
const ProgressBar: React.FC<{
  value: number;
  maxValue: number;
  color: string;
  height?: string;
  showPercentage?: boolean;
}> = ({ value, maxValue, color, height = 'h-2', showPercentage = false }) => {
  const percentage = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0;

  return (
    <div className="w-full">
      <div className={`w-full bg-muted rounded-full ${height}`}>
        <div
          className={`${height} rounded-full transition-all duration-300 ${color}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showPercentage && (
        <div className="text-xs text-muted-foreground mt-1">
          {percentage.toFixed(1)}%
        </div>
      )}
    </div>
  );
};

// Metric Card Component
const MetricCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  subValue?: string;
  color?: string;
  progress?: { value: number; max: number; color: string };
}> = ({
  icon,
  label,
  value,
  subValue,
  color = 'text-foreground',
  progress,
}) => (
  <div className="bg-background/50 rounded-lg p-sm space-y-xs">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-xs">
        {icon}
        <span className="text-sm font-medium text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="text-right">
        <div className={`font-semibold ${color}`}>{value}</div>
        {subValue && (
          <div className="text-xs text-muted-foreground">{subValue}</div>
        )}
      </div>
    </div>
    {progress && (
      <ProgressBar
        value={progress.value}
        maxValue={progress.max}
        color={progress.color}
        height="h-1.5"
      />
    )}
  </div>
);

export interface EditBotPerformanceProps {
  widgetId: string;
  botId?: string;
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
  data?: { botId?: string; [key: string]: unknown };
  settings?: { [key: string]: unknown };
}

const EditBotPerformance: React.FC<EditBotPerformanceProps> = ({
  widgetId,
  botId,
  isEditable = false,
  onRemove,
  onSettings,
  onCollapse,
  onTabMove,
  menuActions,
  data,
  settings: _settings,
}) => {
  const { id: paramBotId } = useParams<{ id: string }>();
  const dataBotId = data?.['botId'] as string | undefined;
  const actualBotId = dataBotId || botId || paramBotId;

  // Get bot data (exclude terminal deals)
  const {
    bots: dcaBots,
    isLoading: dcaBotsLoading,
    error: dcaBotsError,
  } = useDcaBots({ terminal: false, paperContext: false, all: true });
  const { bots: gridBots, isLoading: gridBotsLoading } = useGridBots();
  const isLoading = dcaBotsLoading || gridBotsLoading;
  const bots = [...(dcaBots || []), ...(gridBots || [])];
  const bot = bots.find((b) => b._id === actualBotId);

  // Get deal data for this specific bot
  const {
    deals,
    isLoading: dealsLoading,
    error: dealsError,
  } = useDcaDeals({ paperContext: false });
  const botDeals = deals.filter((deal) => deal.botId === actualBotId);

  // Get user settings for timezone support (like old dashboard)
  const { user: userSettings } = useUserSettings();
  const userTimezone = userSettings?.timezone;

  // Subscribe to live updates for this specific bot
  const {
    metrics: _liveMetrics,
    /* isSubscribed: _isSubscribed, */
    lastUpdate: _lastUpdate,
  } = useLiveUpdateWidget(actualBotId || '', {
    refreshInterval: 30000, // Refresh every 30 seconds
    onDataUpdate: (_data) => {
      // Live data update received
    },
    onError: (error) => {
      console.error('[EditBotPerformance] Live update error:', error);
    },
  });

  // Get required data for bot calculation comparison
  const tokens = useAuthStore((state) => state.tokens);
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);
  const exchangesQuery = useExchangesFromContext();
  const [userExchanges, setUserExchanges] = useState<
    Array<{ uuid: string; provider: string; name: string }>
  >([]);
  const [allFees, setAllFees] = useState<
    Array<{ exchange: string; symbol: string; fee: number }>
  >([]);

  const { fetchMultipleFees } = useUserFees();
  const botSymbolsMap = useMemo(() => {
    const symbolsMap = new Map<string, Set<string>>();

    for (const bot of (dcaBots || []).filter(
      (b) => b.status !== 'closed' && b.status !== 'archive'
    )) {
      const exchangeUuid = bot.exchangeUUID;
      if (!exchangeUuid) continue;

      for (const symbolEntry of bot.symbol || []) {
        const symbol = symbolEntry.value?.symbol;
        if (!symbol) continue;

        if (!symbolsMap.has(exchangeUuid)) {
          symbolsMap.set(exchangeUuid, new Set());
        }
        symbolsMap.get(exchangeUuid)?.add(symbol);
      }
    }

    return symbolsMap;
  }, [dcaBots]);
  useEffect(() => {
    if (botSymbolsMap.size === 0) {
      return;
    }

    // Use the service to fetch fees with automatic caching
    fetchMultipleFees({
      exchangeSymbolMap: botSymbolsMap,
      options: {
        debug: import.meta.env.DEV,
      },
    })
      .catch((error) => {
        logger.error(
          '[EditBotPerformance] Error fetching fees via service:',
          error
        );
      })
      .then((res) => {
        setAllFees(
          (res || []).map((r) => ({
            exchange: r.exchangeUUID,
            symbol: r.symbol,
            fee: r.maker,
          }))
        );
      });
  }, [botSymbolsMap, tokens?.accessToken, fetchMultipleFees]);
  // Process exchanges data and fetch fees immediately when ready
  useEffect(() => {
    if (exchangesQuery.data.data?.exchanges) {
      const exchanges = exchangesQuery.data.data.exchanges.map(
        (ex: { uuid: string; provider: string; name?: string }) => ({
          uuid: ex.uuid,
          provider: ex.provider,
          name: ex.name || ex.provider,
        })
      );
      setUserExchanges(exchanges);
    }
  }, [
    exchangesQuery.data,
    exchangesQuery.error,
    bot,
    tokens?.accessToken,
    isLiveTrading,
  ]);

  // Initialize price service (required for VALUE calculations)
  useEffect(() => {
    const unsubscribePrices = getLatestPrices(
      (_result) => {},
      false // don't load US exchanges
    );

    return () => {
      unsubscribePrices();
    };
  }, []); // Run once on mount

  // Calculate performance metrics
  // Use backend profit data first (like old dashboard), fallback to calculated from deals
  const botProfitFromData = bot?.profit?.totalUsd;

  const profitFromDeals = botDeals
    .filter((deal) => isCompletedDeal(deal))
    .reduce((sum, deal) => sum + (deal.profit?.totalUsd || 0), 0);

  // 🔥 COMPARISON WITH CALCULATEBOTVALUE 🔥
  let calculatedBotValue = null;
  if (bot && allFees.length > 0 && userExchanges.length > 0) {
    const latestPrices = getLocalPrices();

    calculatedBotValue = calculateBotValue(
      bot,
      false,
      latestPrices,
      allFees,
      userExchanges
    );
  }

  // Priority: backend value first, then calculated value, then 0
  const totalProfitUsd =
    botProfitFromData !== undefined && botProfitFromData !== null
      ? botProfitFromData
      : profitFromDeals;

  // Unrealized PnL — open positions only.
  const unrealizedPnL = calculatedBotValue?.unrealizedValue || 0;

  // Use current usage for invested amount (prioritize usage over assets over initial balances)
  const investedFromUsage = Number(bot?.usage?.current?.quote) || 0;

  // Handle different asset structures for DCA vs Grid bots
  let investedFromAssets = 0;
  if (bot?.assets?.required?.quote) {
    if (Array.isArray(bot.assets.required.quote)) {
      // DCA bot structure: array of assets

      investedFromAssets =
        Number(
          bot.assets.required.quote.reduce(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (sum: number, asset: any) => sum + (asset.value || 0),
            0
          )
        ) || 0;
    } else {
      // Grid bot structure: direct value
      investedFromAssets = Number(bot.assets.required.quote) || 0;
    }
  }

  const investedFromInitialBalances = Number(bot?.initialBalances?.quote) || 0;

  // Priority: current usage first, then required assets, then initial balances
  const investedUsd =
    investedFromUsage > 0
      ? investedFromUsage
      : investedFromAssets > 0
        ? investedFromAssets
        : investedFromInitialBalances;

  // Calculate profit percentage based on invested amount
  const profitPercentage =
    investedUsd > 0 ? (totalProfitUsd / investedUsd) * 100 : 0;

  // Calculate runtime in days, accounting for bot status
  const runtime = bot
    ? Math.floor(
        (Date.now() - new Date(bot.created).getTime()) / (1000 * 60 * 60 * 24)
      )
    : 0;

  // Calculate daily average (simple average for now)
  const dailyAverage = runtime > 0 ? totalProfitUsd / runtime : 0;

  // Calculate additional metrics - use actual month length for more accuracy
  const currentDate = new Date();
  const daysInCurrentMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + 1,
    0
  ).getDate();
  const monthlyAverage = dailyAverage * daysInCurrentMonth;

  // Calculate deal statistics
  const dealStats = React.useMemo(() => {
    if (!botDeals || botDeals.length === 0) {
      return {
        totalDeals: 0,
        winningDeals: 0,
        losingDeals: 0,
        winRate: 0,
        profitFactor: 0,
        totalWinAmount: 0,
        totalLossAmount: 0,
        maxDrawdown: 0,
        maxDrawdownPerc: 0,
        avgDealDuration: 0,
        maxDealDuration: 0,
        confidenceGrade: calculateConfidenceGrade(0),
      };
    }

    let winningDeals = 0;
    let totalWinAmount = 0;
    let totalLossAmount = 0;
    let totalDurationMs = 0;
    let maxDurationMs = 0;

    // Sort deals by creation time to build equity curve
    const sortedDeals = [...botDeals]
      .filter(
        (
          deal
        ): deal is DCADeals & { profit: NonNullable<DCADeals['profit']> } =>
          isCompletedDeal(deal) && typeof deal.profit?.totalUsd === 'number'
      )
      .sort(
        (a, b) =>
          new Date(a.createTime).getTime() - new Date(b.createTime).getTime()
      );

    // Calculate running equity and find max drawdown
    let runningEquity = 0;
    let peakEquity = 0;
    let maxDrawdown = 0;
    let maxDrawdownPerc = 0;

    sortedDeals.forEach((deal) => {
      const profit = deal.profit.totalUsd;
      runningEquity += profit;

      // Update peak equity
      if (runningEquity > peakEquity) {
        peakEquity = runningEquity;
      }

      // Calculate current drawdown
      const currentDrawdown = peakEquity - runningEquity;
      if (currentDrawdown > maxDrawdown) {
        maxDrawdown = currentDrawdown;
        maxDrawdownPerc =
          peakEquity > 0 ? (currentDrawdown / peakEquity) * 100 : 0;
      }

      // Calculate deal duration (approximate - using current time as end time for completed deals)
      const startTime = new Date(deal.createTime).getTime();
      const endTime = Date.now(); // Approximation since we don't have exact completion time
      const durationMs = endTime - startTime;

      totalDurationMs += durationMs;
      if (durationMs > maxDurationMs) {
        maxDurationMs = durationMs;
      }

      // Count wins and losses
      if (profit > 0) {
        winningDeals++;
        totalWinAmount += profit;
      } else if (profit < 0) {
        totalLossAmount += Math.abs(profit);
      }
    });

    const completedDeals = sortedDeals.length;
    const losingDeals = completedDeals - winningDeals;
    const winRate =
      completedDeals > 0 ? (winningDeals / completedDeals) * 100 : 0;
    const profitFactor =
      totalLossAmount > 0
        ? totalWinAmount / totalLossAmount
        : totalWinAmount > 0
          ? 999
          : 0;

    // Convert durations from milliseconds to days
    const avgDealDuration =
      completedDeals > 0
        ? totalDurationMs / completedDeals / (1000 * 60 * 60 * 24)
        : 0;
    const maxDealDuration = maxDurationMs / (1000 * 60 * 60 * 24);

    // Calculate confidence grade
    const confidenceGrade = calculateConfidenceGrade(completedDeals);

    // Calculate additional metrics
    const avgWinAmount = winningDeals > 0 ? totalWinAmount / winningDeals : 0;
    const avgLossAmount =
      completedDeals - winningDeals > 0
        ? totalLossAmount / (completedDeals - winningDeals)
        : 0;

    return {
      totalDeals: completedDeals,
      winningDeals,
      losingDeals,
      winRate,
      profitFactor,
      totalWinAmount,
      totalLossAmount,
      maxDrawdown,
      maxDrawdownPerc,
      avgDealDuration,
      maxDealDuration,
      confidenceGrade,
      avgWinAmount,
      avgLossAmount,
    };
  }, [botDeals]);

  // Calculate additional metrics that depend on other variables
  const dealsPerDay = runtime > 0 ? dealStats.totalDeals / runtime : 0;
  const annualizedReturn = runtime > 0 ? (profitPercentage * 365) / runtime : 0;

  // Prepare chart data
  const equityCurveData = React.useMemo(() => {
    if (!botDeals || botDeals.length === 0) return [];

    try {
      const sortedDeals = [...botDeals]
        .filter((deal) => isCompletedDeal(deal))
        .sort((a, b) => {
          const timeA = new Date(a.createTime).getTime();
          const timeB = new Date(b.createTime).getTime();
          // Handle invalid dates
          if (isNaN(timeA) || isNaN(timeB)) return 0;
          return timeA - timeB;
        });

      let runningEquity = 0;
      const data = sortedDeals.map((deal, index) => {
        const profitValue = deal.profit?.totalUsd || 0;
        runningEquity += profitValue;

        // Convert date to user timezone like old dashboard
        const dealDate = convertDate(new Date(deal.createTime), userTimezone);

        return {
          deal: index + 1,
          date: dealDate.toLocaleDateString(),
          equity: mathRound(runningEquity, 6),
          profit: mathRound(profitValue, 6),
          isWin: profitValue > 0,
        };
      });

      return data;
    } catch (error) {
      console.error(
        '[EditBotPerformance] Error preparing equity curve data:',
        error
      );
      return [];
    }
  }, [botDeals, userTimezone]);

  // Win/Loss distribution data
  const winLossData = React.useMemo(() => {
    return [
      { name: 'Wins', value: dealStats.winningDeals, color: '#22c55e' },
      { name: 'Losses', value: dealStats.losingDeals, color: '#ef4444' },
    ].filter((item) => item.value > 0);
  }, [dealStats.winningDeals, dealStats.losingDeals]);

  // Performance over time data (monthly aggregation)
  const performanceOverTimeData = React.useMemo(() => {
    if (!botDeals || botDeals.length === 0) return [];

    try {
      const monthlyData: { [key: string]: { profit: number; deals: number } } =
        {};

      botDeals
        .filter((deal) => isCompletedDeal(deal))
        .forEach((deal) => {
          try {
            // Convert date to user timezone like old dashboard
            const date = convertDate(new Date(deal.createTime), userTimezone);

            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

            if (!monthlyData[monthKey]) {
              monthlyData[monthKey] = { profit: 0, deals: 0 };
            }

            const profitValue = deal.profit?.totalUsd || 0;
            monthlyData[monthKey].profit += profitValue;
            monthlyData[monthKey].deals += 1;
          } catch (error) {
            console.error(
              '[EditBotPerformance] Error processing deal for monthly data:',
              error,
              deal
            );
          }
        });

      return Object.entries(monthlyData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({
          month,
          profit: mathRound(data.profit, 6),
          deals: data.deals,
          cumulativeProfit: 0, // Will be calculated below
        }))
        .reduce(
          (
            acc: Array<{
              month: string;
              profit: number;
              deals: number;
              cumulativeProfit: number;
            }>,
            curr,
            index
          ) => {
            const cumulativeProfit =
              index === 0
                ? curr.profit
                : acc[index - 1].cumulativeProfit + curr.profit;
            return [
              ...acc,
              { ...curr, cumulativeProfit: mathRound(cumulativeProfit, 6) },
            ];
          },
          []
        );
    } catch (error) {
      console.error(
        '[EditBotPerformance] Error preparing performance over time data:',
        error
      );
      return [];
    }
  }, [botDeals, userTimezone]);

  const wrapperProps = {
    metadata: {
      id: widgetId,
      type: 'edit-bot-performance',
      title: 'Performance Analysis',
      defaultSize: getCompatibilityDefaultSize('bot-performance'),
      minSize: { w: 4, h: 4 },
      maxSize: { w: 12, h: 8 },
      hasOptions: true,
      value: {
        primary: `${profitPercentage.toFixed(2)}%`,
        secondary: 'Total Return',
        change: {
          value:
            totalProfitUsd > 0
              ? `+$${totalProfitUsd.toFixed(2)}`
              : `$${totalProfitUsd.toFixed(2)}`,
          percentage: `${profitPercentage.toFixed(2)}%`,
          isPositive: totalProfitUsd >= 0,
        },
      },
    },
    isEditable,
    ...(onRemove && { onRemove }),
    ...(onSettings && { onSettings }),
    ...(onCollapse && { onCollapse }),
    ...(onTabMove && { onTabMove }),
    ...(menuActions && { menuActions }),
  };

  return (
    <WidgetWrapper {...wrapperProps}>
      <div className="p-lg">
        {isLoading || dealsLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="text-center text-muted-foreground">
              <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Loading performance data...</p>
            </div>
          </div>
        ) : dcaBotsError || dealsError ? (
          <div className="flex items-center justify-center h-48">
            <div className="text-center text-muted-foreground">
              <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50 text-red-500" />
              <p className="text-red-600 font-medium">
                Error Loading Performance
              </p>
              <p className="text-xs mt-1">
                {(dcaBotsError || dealsError)?.message}
              </p>
            </div>
          </div>
        ) : !bot ? (
          <div className="flex items-center justify-center h-48">
            <div className="text-center text-muted-foreground">
              <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Bot not found</p>
            </div>
          </div>
        ) : (
          <>
            {/* Bot Overview Header */}
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div>
                <h3 className="text-lg font-semibold">{bot.settings?.name}</h3>
                <div className="flex items-center gap-xs">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      bot.status === 'open'
                        ? 'bg-green-500'
                        : bot.status === 'error'
                          ? 'bg-red-500'
                          : bot.status === 'closed'
                            ? 'bg-muted-foreground'
                            : 'bg-primary' // fallback for unknown statuses
                    }`}
                  />
                  <span
                    className={`text-sm capitalize font-medium ${
                      bot.status === 'open'
                        ? 'text-green-600'
                        : bot.status === 'error'
                          ? 'text-red-600'
                          : bot.status === 'closed'
                            ? 'text-muted-foreground'
                            : 'text-primary'
                    }`}
                  >
                    {bot.status}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-sm">
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">
                    Trading Pair
                  </div>
                  <div className="font-medium">
                    {Array.isArray(bot.symbol)
                      ? bot?.symbol?.[0]?.value?.symbol
                      : bot?.symbol?.symbol}
                  </div>
                </div>
              </div>
            </div>

            {/* Key Metrics Row */}
            <div className="grid grid-cols-3 gap-md pb-6 border-b border-border">
              {/* Current Usage */}
              <div className="bg-card/50 rounded-lg p-md">
                <div className="flex items-center gap-xs mb-2">
                  <Target className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">
                    Invested
                  </span>
                </div>
                <div className="text-xl font-bold text-foreground">
                  ${investedUsd.toFixed(2)}
                </div>
              </div>

              {/* Active Deals */}
              <div className="bg-card/50 rounded-lg p-md">
                <div className="flex items-center gap-xs mb-2">
                  <Activity className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">
                    Active Deals
                  </span>
                </div>
                <div className="text-xl font-bold text-foreground">
                  {(bot as DCABot)?.dealsInBot?.active || 0}
                </div>
              </div>

              {/* Runtime */}
              <div className="bg-card/50 rounded-lg p-md">
                <div className="flex items-center gap-xs mb-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">
                    Runtime
                  </span>
                </div>
                <div className="text-xl font-bold text-foreground">
                  {formatDuration(runtime)}
                </div>
              </div>
            </div>

            {/* Realized / Unrealized / Net — the same three the bot lists
                show. This block used to label the realized figure "Total
                Profit" and caption it "Realized + Unrealized", which it has
                never been: `totalProfitUsd` is the bot's booked profit. */}
            <div className="grid grid-cols-1 gap-md pb-6 border-b border-border sm:grid-cols-3">
              <div className="bg-card/50 rounded-lg p-md">
                <div className="flex items-center gap-xs mb-2">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">
                    Realized PnL
                  </span>
                  <InfoTooltip
                    tooltip={BOT_METRIC_DESCRIPTIONS.dca.realizedPnl}
                    side="top"
                  >
                    <InfoIcon />
                  </InfoTooltip>
                </div>
                <div
                  className={`text-xl font-bold ${
                    totalProfitUsd >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  ${totalProfitUsd.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Closed deals only
                </div>
              </div>

              <div className="bg-card/50 rounded-lg p-md">
                <div className="flex items-center gap-xs mb-2">
                  <TrendingUp className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">
                    Unrealized PnL
                  </span>
                  <InfoTooltip
                    tooltip={BOT_METRIC_DESCRIPTIONS.dca.unrealizedPnl}
                    side="top"
                  >
                    <InfoIcon />
                  </InfoTooltip>
                </div>
                <div
                  className={`text-xl font-bold ${
                    unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  ${unrealizedPnL.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Open deals only
                </div>
              </div>

              <div className="bg-card/50 rounded-lg p-md">
                <div className="flex items-center gap-xs mb-2">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">
                    Net PnL
                  </span>
                  <InfoTooltip
                    tooltip={BOT_METRIC_DESCRIPTIONS.dca.netPnl}
                    side="top"
                  >
                    <InfoIcon />
                  </InfoTooltip>
                </div>
                <div
                  className={`text-xl font-bold ${
                    totalProfitUsd + unrealizedPnL >= 0
                      ? 'text-green-600'
                      : 'text-red-600'
                  }`}
                >
                  ${(totalProfitUsd + unrealizedPnL).toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Realized + Unrealized
                </div>
              </div>
            </div>

            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="overview">Performance</TabsTrigger>
                <TabsTrigger value="stats">Statistics</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-md">
                <div className="bg-card/50 rounded-lg p-lg">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold">
                      Performance Overview
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
                    {/* Main Return */}
                    <div className="text-center md:text-left">
                      <div className="text-sm text-muted-foreground mb-1 flex items-center justify-center gap-1 md:justify-start">
                        Realized Return
                        <InfoTooltip
                          tooltip="Realized PnL ÷ the amount invested. Open deals are not included."
                          side="top"
                        >
                          <InfoIcon />
                        </InfoTooltip>
                      </div>
                      <div
                        className={`text-3xl font-bold ${
                          profitPercentage >= 0
                            ? 'text-green-600'
                            : 'text-red-600'
                        }`}
                      >
                        {profitPercentage >= 0 ? '+' : ''}
                        {profitPercentage.toFixed(2)}%
                      </div>
                      <div
                        className={`text-lg font-semibold mt-1 ${
                          totalProfitUsd >= 0
                            ? 'text-green-600'
                            : 'text-red-600'
                        }`}
                      >
                        {totalProfitUsd >= 0 ? '+' : ''}$
                        {totalProfitUsd.toFixed(2)}
                      </div>
                    </div>

                    {/* Key Metrics */}
                    <div className="grid grid-cols-2 gap-sm">
                      <div className="text-center">
                        <div className="text-sm text-muted-foreground">
                          Win Rate
                        </div>
                        <div
                          className={`text-xl font-bold ${
                            dealStats.winRate >= 50
                              ? 'text-green-600'
                              : dealStats.winRate > 0
                                ? 'text-yellow-600'
                                : 'text-muted-foreground'
                          }`}
                        >
                          {dealStats.totalDeals > 0
                            ? `${dealStats.winRate.toFixed(1)}%`
                            : 'N/A'}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-sm text-muted-foreground">
                          Profit Factor
                        </div>
                        <div
                          className={`text-xl font-bold ${
                            dealStats.profitFactor >= 1
                              ? 'text-green-600'
                              : dealStats.profitFactor > 0
                                ? 'text-red-600'
                                : 'text-muted-foreground'
                          }`}
                        >
                          {dealStats.totalDeals > 0
                            ? dealStats.profitFactor >= 999
                              ? '∞'
                              : dealStats.profitFactor.toFixed(2)
                            : 'N/A'}
                        </div>
                      </div>
                    </div>

                    {/* Confidence Grade */}
                    <div className="text-center md:text-right">
                      <div className="text-sm text-muted-foreground mb-1">
                        Confidence Grade
                      </div>
                      <div
                        className={`text-2xl font-bold ${dealStats.confidenceGrade.color}`}
                      >
                        {dealStats.confidenceGrade.grade}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {dealStats.confidenceGrade.description}
                      </div>
                    </div>
                  </div>

                  {/* Progress Bars */}
                  {dealStats.totalDeals > 0 && (
                    <div className="mt-4 space-y-sm">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Win Rate</span>
                          <span>{dealStats.winRate.toFixed(1)}%</span>
                        </div>
                        <ProgressBar
                          value={dealStats.winRate}
                          maxValue={100}
                          color={
                            dealStats.winRate >= 50
                              ? 'bg-green-600'
                              : 'bg-yellow-600'
                          }
                          height="h-2"
                        />
                      </div>

                      {dealStats.profitFactor < 999 && (
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span>Profit Factor</span>
                            <span>{dealStats.profitFactor.toFixed(2)}</span>
                          </div>
                          <ProgressBar
                            value={Math.min(dealStats.profitFactor, 3)}
                            maxValue={3}
                            color={
                              dealStats.profitFactor >= 1
                                ? 'bg-green-600'
                                : 'bg-red-600'
                            }
                            height="h-2"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Detailed Metrics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-sm">
                  <MetricCard
                    icon={
                      <DollarSign className="w-4 h-4 text-muted-foreground" />
                    }
                    label="Invested"
                    value={`$${investedUsd.toFixed(2)}`}
                  />

                  <MetricCard
                    icon={
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                    }
                    label="Daily Average"
                    value={`${dailyAverage >= 0 ? '+' : ''}$${dailyAverage.toFixed(2)}`}
                    color={
                      dailyAverage >= 0 ? 'text-green-600' : 'text-red-600'
                    }
                  />

                  <MetricCard
                    icon={<Target className="w-4 h-4 text-muted-foreground" />}
                    label="Monthly Est."
                    value={`${monthlyAverage >= 0 ? '+' : ''}$${monthlyAverage.toFixed(2)}`}
                    color={
                      monthlyAverage >= 0 ? 'text-green-600' : 'text-red-600'
                    }
                  />

                  <MetricCard
                    icon={<Clock className="w-4 h-4 text-muted-foreground" />}
                    label="Runtime"
                    value={`${runtime} days`}
                  />

                  <MetricCard
                    icon={
                      <BarChart3 className="w-4 h-4 text-muted-foreground" />
                    }
                    label="Total Deals"
                    value={
                      dealStats.totalDeals > 0
                        ? `${dealStats.totalDeals}`
                        : 'No deals yet'
                    }
                    subValue={
                      dealStats.totalDeals > 0
                        ? `${dealStats.winningDeals}W / ${dealStats.losingDeals}L`
                        : ''
                    }
                  />

                  {dealStats.totalDeals > 0 && dealStats.maxDrawdown > 0 && (
                    <MetricCard
                      icon={
                        <TrendingDown className="w-4 h-4 text-muted-foreground" />
                      }
                      label="Max Drawdown"
                      value={`$${dealStats.maxDrawdown.toFixed(2)}`}
                      subValue={`${dealStats.maxDrawdownPerc.toFixed(1)}%`}
                      color="text-red-600"
                    />
                  )}

                  {dealStats.totalDeals > 0 &&
                    dealStats.avgDealDuration > 0 && (
                      <MetricCard
                        icon={
                          <Clock className="w-4 h-4 text-muted-foreground" />
                        }
                        label="Avg Deal Duration"
                        value={formatDuration(dealStats.avgDealDuration)}
                      />
                    )}

                  {dealStats.totalDeals > 0 &&
                    dealStats.maxDealDuration > 0 && (
                      <MetricCard
                        icon={
                          <Clock className="w-4 h-4 text-muted-foreground" />
                        }
                        label="Max Deal Duration"
                        value={formatDuration(dealStats.maxDealDuration)}
                      />
                    )}

                  {runtime > 0 && dealStats.totalDeals > 0 && (
                    <MetricCard
                      icon={
                        <Activity className="w-4 h-4 text-muted-foreground" />
                      }
                      label="Deals per Day"
                      value={dealsPerDay.toFixed(2)}
                    />
                  )}

                  {runtime > 0 && (
                    <MetricCard
                      icon={
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                      }
                      label="Annualized Return"
                      value={`${annualizedReturn.toFixed(1)}%`}
                    />
                  )}
                </div>

                {/* Performance Status */}
                <div className="bg-background/50 rounded-lg p-sm">
                  <div className="flex items-center justify-center gap-xs">
                    {profitPercentage >= 0 ? (
                      <TrendingUp className="w-5 h-5 text-green-600" />
                    ) : (
                      <TrendingDown className="w-5 h-5 text-red-600" />
                    )}
                    <span
                      className={`font-medium ${
                        profitPercentage >= 0
                          ? 'text-green-600'
                          : 'text-red-600'
                      }`}
                    >
                      {profitPercentage >= 0
                        ? 'Profitable Bot'
                        : 'Unprofitable Bot'}
                      {dealStats.totalDeals > 0 && (
                        <>
                          <span className="mx-2">•</span>
                          <span className="text-sm">
                            {dealStats.confidenceGrade.grade} Grade (
                            {dealStats.totalDeals} deals)
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                </div>

                {/* Advanced Analytics Section */}
                <div className="bg-linear-to-r from-background/80 to-background/40 rounded-lg p-md">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">
                      Advanced Analytics
                    </h3>
                  </div>

                  {/* Equity Curve Chart */}
                  <div className="mb-6">
                    <h4 className="text-md font-medium mb-3">Equity Curve</h4>
                    {equityCurveData.length > 0 ? (
                      <div className="bg-card/50 rounded-lg p-md">
                        <ResponsiveContainer width="100%" height={300}>
                          <AreaChart
                            data={equityCurveData}
                            margin={{
                              top: 10,
                              right: 10,
                              left: 10,
                              bottom: 10,
                            }}
                          >
                            <defs>
                              <linearGradient
                                id="equityGradient"
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                              >
                                <stop
                                  offset="0%"
                                  stopColor="oklch(var(--primary))"
                                  stopOpacity={0.3}
                                />
                                <stop
                                  offset="100%"
                                  stopColor="oklch(var(--primary))"
                                  stopOpacity={0.05}
                                />
                              </linearGradient>
                            </defs>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke="oklch(var(--muted-foreground))"
                              opacity={0.2}
                            />
                            <XAxis
                              dataKey="deal"
                              axisLine={false}
                              tickLine={false}
                              tick={{
                                fill: 'currentColor',
                                fontSize: 10,
                                className: 'text-muted-foreground',
                              }}
                            />
                            <YAxis
                              axisLine={false}
                              tickLine={false}
                              tick={{
                                fill: 'currentColor',
                                fontSize: 10,
                                className: 'text-muted-foreground',
                              }}
                              tickFormatter={(value) => `$${value.toFixed(0)}`}
                              width={60}
                            />
                            <Tooltip
                              formatter={(value: number) => [
                                `$${Number(value).toFixed(2)}`,
                                'Equity',
                              ]}
                              labelFormatter={(label) => `Deal ${label}`}
                              contentStyle={{
                                backgroundColor: 'oklch(var(--background))',
                                border: '1px solid oklch(var(--border))',
                                borderRadius: '8px',
                                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                              }}
                            />
                            <ReferenceLine
                              y={0}
                              stroke="oklch(var(--muted-foreground))"
                              strokeDasharray="2 2"
                              opacity={0.6}
                            />
                            <Area
                              isAnimationActive={false}
                              type="monotone"
                              dataKey="equity"
                              stroke="oklch(var(--primary))"
                              fill="url(#equityGradient)"
                              strokeWidth={2}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="bg-card/50 rounded-lg p-lg h-48 flex items-center justify-center">
                        <div className="text-center text-muted-foreground">
                          <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-40" />
                          <p className="text-sm font-medium">
                            No completed deals yet
                          </p>
                          <p className="text-xs mt-1 opacity-70">
                            Chart will appear when the first deal is completed
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Win/Loss Distribution */}
                  <div className="mb-6">
                    <h4 className="text-md font-medium mb-3">
                      Win/Loss Distribution
                    </h4>
                    {winLossData.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                        <div className="bg-background/50 rounded-lg p-md">
                          <ResponsiveContainer width="100%" height={150}>
                            <RechartsPieChart>
                              <Pie
                                isAnimationActive={false}
                                data={winLossData}
                                cx="50%"
                                cy="50%"
                                innerRadius={30}
                                outerRadius={60}
                                paddingAngle={5}
                                dataKey="value"
                              >
                                {winLossData.map((entry, index) => (
                                  <Cell
                                    key={`cell-${index}`}
                                    fill={entry.color}
                                  />
                                ))}
                              </Pie>
                              <Tooltip
                                formatter={(value: number) => [
                                  `${value} deals`,
                                  'Count',
                                ]}
                                contentStyle={{
                                  backgroundColor: 'oklch(var(--background))',
                                  border: '1px solid oklch(var(--border))',
                                  borderRadius: '6px',
                                }}
                              />
                            </RechartsPieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="space-y-sm">
                          <div className="bg-background/50 rounded-lg p-md">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium">
                                Winning Trades
                              </span>
                              <span className="text-sm text-green-600 font-semibold">
                                {dealStats.winningDeals}
                              </span>
                            </div>
                            <ProgressBar
                              value={
                                dealStats.totalDeals > 0
                                  ? (dealStats.winningDeals /
                                      dealStats.totalDeals) *
                                    100
                                  : 0
                              }
                              maxValue={100}
                              color="bg-green-600"
                              height="h-2"
                              showPercentage={true}
                            />
                          </div>
                          <div className="bg-background/50 rounded-lg p-md">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium">
                                Losing Trades
                              </span>
                              <span className="text-sm text-red-600 font-semibold">
                                {dealStats.losingDeals}
                              </span>
                            </div>
                            <ProgressBar
                              value={
                                dealStats.totalDeals > 0
                                  ? (dealStats.losingDeals /
                                      dealStats.totalDeals) *
                                    100
                                  : 0
                              }
                              maxValue={100}
                              color="bg-red-600"
                              height="h-2"
                              showPercentage={true}
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-background/50 rounded-lg p-md h-32 flex items-center justify-center">
                        <div className="text-center text-muted-foreground">
                          <PieChart className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No completed deals yet</p>
                          <p className="text-xs mt-1">
                            Win/loss distribution will appear after first
                            completed deal
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Profit/Loss Breakdown */}
                  <div className="mb-6">
                    <h4 className="text-md font-medium mb-3">
                      Profit/Loss Breakdown
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                      <div className="bg-background/50 rounded-lg p-md">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">
                            Total Wins
                          </span>
                          <span className="text-sm text-green-600 font-semibold">
                            +${dealStats.totalWinAmount.toFixed(2)}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Avg: $
                          {dealStats.winningDeals > 0
                            ? (
                                dealStats.totalWinAmount /
                                dealStats.winningDeals
                              ).toFixed(2)
                            : '0.00'}
                        </div>
                      </div>
                      <div className="bg-background/50 rounded-lg p-md">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">
                            Total Losses
                          </span>
                          <span className="text-sm text-red-600 font-semibold">
                            -${dealStats.totalLossAmount.toFixed(2)}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Avg: $
                          {dealStats.losingDeals > 0
                            ? (
                                dealStats.totalLossAmount /
                                dealStats.losingDeals
                              ).toFixed(2)
                            : '0.00'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Performance Timeline */}
                  <div className="mb-6">
                    <h4 className="text-md font-medium mb-3">
                      Performance Timeline
                    </h4>
                    {performanceOverTimeData.length > 0 ? (
                      <div className="bg-background/50 rounded-lg p-md">
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart data={performanceOverTimeData}>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              className="opacity-30"
                            />
                            <XAxis
                              dataKey="month"
                              tick={{ fontSize: 12 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              tick={{ fontSize: 12 }}
                              axisLine={false}
                              tickLine={false}
                              tickFormatter={(value) => `$${value.toFixed(0)}`}
                            />
                            <Tooltip
                              formatter={(value: number, name: string) => [
                                name === 'profit'
                                  ? `$${Number(value).toFixed(2)}`
                                  : value,
                                name === 'profit' ? 'Monthly Profit' : 'Deals',
                              ]}
                              labelFormatter={(label) => `Month: ${label}`}
                              contentStyle={{
                                backgroundColor: 'oklch(var(--background))',
                                border: '1px solid oklch(var(--border))',
                                borderRadius: '6px',
                              }}
                            />
                            <ReferenceLine
                              y={0}
                              stroke="oklch(var(--muted-foreground))"
                              strokeDasharray="2 2"
                            />
                            <Bar
                              isAnimationActive={false}
                              dataKey="profit"
                              fill="#3b82f6"
                              radius={[2, 2, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                        <div className="mt-4 grid grid-cols-3 gap-md text-center">
                          <div>
                            <div className="text-sm text-muted-foreground">
                              Runtime
                            </div>
                            <div className="text-lg font-semibold">
                              {runtime} days
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-muted-foreground">
                              Deals per Day
                            </div>
                            <div className="text-lg font-semibold">
                              {dealsPerDay.toFixed(2)}
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-muted-foreground">
                              Annualized Return
                            </div>
                            <div
                              className={`text-lg font-semibold ${annualizedReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}
                            >
                              {annualizedReturn.toFixed(1)}%
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-background/50 rounded-lg p-md">
                        <div className="space-y-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Runtime</span>
                            <span className="text-sm font-semibold">
                              {runtime} days
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Deals per Day</span>
                            <span className="text-sm font-semibold">
                              {dealsPerDay.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Annualized Return</span>
                            <span
                              className={`text-sm font-semibold ${annualizedReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}
                            >
                              {annualizedReturn.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Risk Analysis */}
                  <div>
                    <h4 className="text-md font-medium mb-3">Risk Analysis</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                      <div className="bg-background/50 rounded-lg p-md">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">
                            Max Drawdown
                          </span>
                          <span className="text-sm text-red-600 font-semibold">
                            {dealStats.maxDrawdownPerc.toFixed(1)}%
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          ${dealStats.maxDrawdown.toFixed(2)}
                        </div>
                      </div>
                      <div className="bg-background/50 rounded-lg p-md">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">
                            Profit Factor
                          </span>
                          <span className="text-sm font-semibold">
                            {dealStats.profitFactor >= 999
                              ? '∞'
                              : dealStats.profitFactor.toFixed(2)}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {dealStats.profitFactor >= 1
                            ? 'Profitable'
                            : 'Unprofitable'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Stats Tab */}
              <TabsContent value="stats" className="space-y-md">
                {dealStats.totalDeals > 0 ? (
                  <div className="space-y-lg">
                    {/* Detailed Statistics Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
                      <div className="bg-background/50 rounded-lg p-md">
                        <div className="flex items-center gap-xs mb-2">
                          <Target className="w-4 h-4 text-blue-600" />
                          <span className="text-sm font-medium">Win Rate</span>
                        </div>
                        <div className="text-2xl font-bold text-blue-600">
                          {dealStats.winRate.toFixed(1)}%
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {dealStats.winningDeals} wins out of{' '}
                          {dealStats.totalDeals} deals
                        </div>
                      </div>

                      <div className="bg-background/50 rounded-lg p-md">
                        <div className="flex items-center gap-xs mb-2">
                          <BarChart3 className="w-4 h-4 text-purple-600" />
                          <span className="text-sm font-medium">
                            Profit Factor
                          </span>
                        </div>
                        <div className="text-2xl font-bold text-purple-600">
                          {dealStats.profitFactor >= 999
                            ? '∞'
                            : dealStats.profitFactor.toFixed(2)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {dealStats.profitFactor >= 1
                            ? 'Profitable'
                            : 'Unprofitable'}
                        </div>
                      </div>

                      <div className="bg-background/50 rounded-lg p-md">
                        <div className="flex items-center gap-xs mb-2">
                          <TrendingDown className="w-4 h-4 text-red-600" />
                          <span className="text-sm font-medium">
                            Max Drawdown
                          </span>
                        </div>
                        <div className="text-2xl font-bold text-red-600">
                          {dealStats.maxDrawdownPerc.toFixed(1)}%
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          ${dealStats.maxDrawdown.toFixed(2)} loss
                        </div>
                      </div>

                      <div className="bg-background/50 rounded-lg p-md">
                        <div className="flex items-center gap-xs mb-2">
                          <Clock className="w-4 h-4 text-orange-600" />
                          <span className="text-sm font-medium">
                            Avg Deal Duration
                          </span>
                        </div>
                        <div className="text-2xl font-bold text-orange-600">
                          {formatDuration(dealStats.avgDealDuration)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Max: {formatDuration(dealStats.maxDealDuration)}
                        </div>
                      </div>

                      <div className="bg-background/50 rounded-lg p-md">
                        <div className="flex items-center gap-xs mb-2">
                          <DollarSign className="w-4 h-4 text-green-600" />
                          <span className="text-sm font-medium">Avg Win</span>
                        </div>
                        <div className="text-2xl font-bold text-green-600">
                          ${dealStats.avgWinAmount?.toFixed(2) || '0.00'}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Per winning deal
                        </div>
                      </div>

                      <div className="bg-background/50 rounded-lg p-md">
                        <div className="flex items-center gap-xs mb-2">
                          <DollarSign className="w-4 h-4 text-red-600" />
                          <span className="text-sm font-medium">Avg Loss</span>
                        </div>
                        <div className="text-2xl font-bold text-red-600">
                          ${dealStats.avgLossAmount?.toFixed(2) || '0.00'}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Per losing deal
                        </div>
                      </div>
                    </div>

                    {/* Risk/Reward Ratio */}
                    <div className="bg-linear-to-r from-background/80 to-background/40 rounded-lg p-md">
                      <h4 className="text-lg font-semibold mb-4">
                        Risk/Reward Analysis
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
                        <div>
                          <h5 className="text-md font-medium mb-3">
                            Reward-to-Risk Ratio
                          </h5>
                          <div className="text-3xl font-bold text-blue-600 mb-2">
                            {dealStats.avgLossAmount &&
                            dealStats.avgLossAmount > 0
                              ? (dealStats.avgWinAmount || 0) /
                                dealStats.avgLossAmount
                              : '∞'}
                            :1
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Average win amount vs average loss amount
                          </div>
                        </div>

                        <div>
                          <h5 className="text-md font-medium mb-3">
                            Kelly Criterion Estimate
                          </h5>
                          <div className="text-3xl font-bold text-purple-600 mb-2">
                            {dealStats.winRate > 0 &&
                            dealStats.avgLossAmount &&
                            dealStats.avgLossAmount > 0 &&
                            dealStats.avgWinAmount
                              ? (
                                  ((dealStats.winRate / 100) *
                                    (dealStats.avgWinAmount /
                                      dealStats.avgLossAmount +
                                      1) -
                                    1) /
                                  (dealStats.avgWinAmount /
                                    dealStats.avgLossAmount)
                                ).toFixed(3)
                              : 'N/A'}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Optimal position sizing percentage
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Performance Confidence */}
                    <div className="bg-background/50 rounded-lg p-md">
                      <h4 className="text-lg font-semibold mb-4">
                        Statistical Confidence
                      </h4>
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <div className="text-2xl font-bold mb-1">
                            Grade {dealStats.confidenceGrade.grade}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {dealStats.confidenceGrade.description}
                          </div>
                        </div>
                        <div
                          className={`text-4xl font-bold ${dealStats.confidenceGrade.color}`}
                        >
                          {dealStats.confidenceGrade.grade}
                        </div>
                      </div>
                      <div className="space-y-xs">
                        <div className="flex justify-between text-sm">
                          <span>Sample Size</span>
                          <span>{dealStats.totalDeals} deals</span>
                        </div>
                        <ProgressBar
                          value={Math.min(
                            (dealStats.totalDeals / 100) * 100,
                            100
                          )}
                          maxValue={100}
                          color="bg-blue-600"
                          height="h-2"
                        />
                        <div className="text-xs text-muted-foreground mt-2">
                          Statistical significance increases with more deals
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">
                      No Deal Data Available
                    </p>
                    <p className="text-sm">
                      Detailed statistics will appear after the bot completes
                      its first deal
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </WidgetWrapper>
  );
};

export default EditBotPerformance;
