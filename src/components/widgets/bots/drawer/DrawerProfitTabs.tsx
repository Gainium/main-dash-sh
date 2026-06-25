import type { DrawerBot } from '@/types/bots/drawer';
import type { GridBot } from '@/types/gridBot';
import { BarChart2, DollarSign } from 'lucide-react';
import React, { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
/* import { getLocalPrices } from '../../../../helper/price'; */
/* import { useComboBots } from '../../../../hooks/useComboBots';
import { useDcaBots } from '../../../../hooks/useDcaBots'; */
/* import { useDcaDeals } from '../../../../hooks/useDcaDeals'; */
/* import { useGridBots } from '../../../../hooks/useGridBots';
import { useHedgeComboBots } from '../../../../hooks/useHedgeComboBots';
import { useHedgeDcaBots } from '../../../../hooks/useHedgeDcaBots'; */
import { useComboBotDealsStats } from '../../../../hooks/useComboBotDealsStats';
import { useLiveBotMetrics } from '../../../../hooks/useLiveBotMetrics';
import { cn, formatCurrency } from '../../../../lib/utils';
/* import {
  transformComboBotToBot,
  type ComboBot as ComboBotType,
} from '../../../../types/comboBot';
import { transformDcaBotToBot } from '../../../../types/dcaBot';
import { transformGridBotToBot } from '../../../../types/gridBot';
import { transformHedgeBotToBot } from '../../../../types/hedgeBot'; */
import type { BotStats, DCABot } from '@/types';
import { useUIStore } from '../../../../stores/uiStore';
import { ProfitAndPerc } from '../../../ui/chip/ProfitAndPerc';
import { ProfitLossPercChip } from '../../../ui/chip/ProfitLossPercChip';
import { ProgressBar } from '../../../ui/ProgressBar';
import { Skeleton } from '../../../ui/skeleton';
import { usePricesLoaded } from '../../../../lib/hooks/usePricesLoaded';
import { DrawerSection } from './DrawerSection';

// Utility function to format working time like old Info widget (23 D 10 H 27 MIN)
const formatWorkingTime = (milliseconds: number): string => {
  if (milliseconds <= 0) return '0 MIN';

  const totalMinutes = Math.floor(milliseconds / (1000 * 60));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} D`);
  if (hours > 0) parts.push(`${hours} H`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} MIN`);

  return parts.join(' ');
};

// Type for bot with unrealized P&L data
interface BotWithUnrealizedPnl {
  unrealizedPnlUsd?: number;
  unrealizedPnl?: number;
  unrealizedPnlPercent?: number;
  openTrades?: number;
}

type MetricCardProps = {
  label: string;
  value: React.ReactNode;
  helper?: React.ReactNode;
  icon?: React.ReactNode;
  tooltip?: string;
  valueClassName?: string;
  helperClassName?: string;
};

const MetricCard = ({
  label,
  value,
  helper,
  icon,
  tooltip,
  valueClassName = 'text-sm font-semibold text-foreground',
  helperClassName = 'text-xs text-muted-foreground',
}: MetricCardProps) => (
  <div className="rounded-lg bg-muted p-sm">
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
      {label}
      {tooltip && (
        <Tooltip tooltip={tooltip} side="top">
          <InfoIcon />
        </Tooltip>
      )}
    </p>
    <div className="mt-1 flex items-center gap-1">
      {icon}
      <span className={valueClassName}>{value}</span>
    </div>
    {helper ? (
      <div className={cn('mt-1', helperClassName)}>{helper}</div>
    ) : null}
  </div>
);
// Interface for performance metrics
interface PerformanceMetrics {
  netResultPerc: number;
  avgDailyReturnPerc: number;
  openPnlPerc?: number;
  maxEquityDrawdownPerc: number;
  maxDealDuration?: string;
  winRate: number;
  profitFactor: number;
}

export interface DrawerProfitTabsProps {
  widgetId: string;
  botId?: string;
  bot?: DrawerBot;
}

const DrawerProfitTabs: React.FC<DrawerProfitTabsProps> = ({
  widgetId,
  botId,
  bot: botProp,
}) => {
  const { id: paramBotId } = useParams<{ id: string }>();
  const actualBotId = useMemo(() => botId || paramBotId, [botId, paramBotId]);
  const privacyMode = useUIStore((s) => s.privacyMode);

  // Determine bot type from prop
  const botType = useMemo(() => botProp?.type || 'dca', [botProp?.type]);

  const isGrid = useMemo(() => botType === 'grid', [botType]);
  // Current Value & Unrealized P&L are derived client-side from the live-price
  // feed (via transformDcaBotToBot). Until prices arrive they read 0; show a
  // skeleton instead. Grid bots derive Value Change from server stats, so they
  // don't gate on the price feed.
  const pricesLoading = !usePricesLoaded();

  // Get bot and deals data using real GraphQL hooks (exclude terminal deals)
  /*  const {
    bots: dcaBots,
    isLoading: dcaLoading,
    isError: dcaError,
  } = useDcaBots({ terminal: false, paperContext: false, all: true });

  const {
    bots: gridBots,
    isLoading: gridLoading,
    isError: gridError,
  } = useGridBots({ paperContext: false });

  const {
    bots: comboBots,
    isLoading: comboLoading,
    isError: comboError,
  } = useComboBots({ paperContext: false });

  const {
    bots: hedgeDcaBots,
    isLoading: hedgeDcaLoading,
    isError: hedgeDcaError,
  } = useHedgeDcaBots({ terminal: false, paperContext: false });

  const {
    bots: hedgeComboBots,
    isLoading: hedgeComboLoading,
    isError: hedgeComboError,
  } = useHedgeComboBots({ terminal: false, paperContext: false }); */

  /* const { isLoading: dealsLoading, isError: dealsError } = useDcaDeals(
    { paperContext: false },
    { enabled: botType === 'dca' }
  ); */

  // Always fetch the source bot from hooks for proper stats calculations
  // botProp (DrawerBot) is only used for display, not for metric calculations
  // DrawerBot doesn't have stats.numerical which is needed for metrics
  const rawBot = useMemo(
    () =>
      /* (botType === 'grid'
        ? gridBots.find((b) => b._id === actualBotId)
        : botType === 'combo'
          ? comboBots.find((b) => b._id === actualBotId)
          : botType === 'hedgeDca'
            ? hedgeDcaBots.find((b) => b._id === actualBotId)
            : botType === 'hedgeCombo'
              ? hedgeComboBots.find((b) => b._id === actualBotId)
              : dcaBots.find((b) => b._id === actualBotId)) || */ botProp,
    [
      /* actualBotId,
      botType,
      dcaBots,
      gridBots,
      comboBots,
      hedgeDcaBots,
      hedgeComboBots, */
      botProp,
    ]
  );

  /*   const botsLoading =
    dcaLoading ||
    gridLoading ||
    comboLoading ||
    hedgeDcaLoading ||
    hedgeComboLoading; */
  /*   const botsError =
    dcaError || gridError || comboError || hedgeDcaError || hedgeComboError; */

  const { stats: liveStats } = useLiveBotMetrics({
    botId: actualBotId ?? '',
    enabled: Boolean(actualBotId),
  });

  // Fetch combo bot deals stats (win rate, avg profit) from dedicated API
  // stats.numerical.deals may not be recalculated by the backend for combo bots
  const isCombo = botType === 'combo' || botType === 'hedgeCombo';
  const { stats: comboDealStats } = useComboBotDealsStats(
    actualBotId ?? '',
    isCombo
  );

  // Transform the bot data to get consistent value calculation (same as table and card views)
  /*  const transformedBot = useMemo(() => {
    if (!rawBot) return null;

    // If we have a DrawerBot (from botProp), skip transformation as it already has all values
    if (botProp && 'profit' in rawBot) {
      // This is already a DrawerBot with calculated values
      const baseBot: DrawerBot = rawBot as DrawerBot;

      if (!liveStats) {
        return baseBot;
      }

      // Just merge live stats if available
      const liveGeneral = liveStats.numerical?.general;
      const liveProfit = liveStats.numerical?.profit;
      const liveChart = Array.isArray(liveStats.chart)
        ? liveStats.chart
        : undefined;

      const liveNetProfitPerc =
        typeof liveGeneral?.netProfitPerc === 'number'
          ? liveGeneral.netProfitPerc * 100
          : undefined;
      const liveAvgDailyUsd =
        typeof liveGeneral?.avgDaily === 'number'
          ? liveGeneral.avgDaily
          : undefined;
      const liveAvgDailyPerc =
        typeof liveGeneral?.avgDailyPerc === 'number'
          ? liveGeneral.avgDailyPerc
          : undefined;
      const liveAnnualized =
        typeof liveGeneral?.avgDailyPerc === 'number'
          ? Math.round(
              (((liveGeneral.avgDailyPerc ?? 0) / 100) * 365 * 100 +
                Number.EPSILON) *
                100
            ) / 100
          : undefined;
      const liveGrossProfitUsd =
        typeof liveProfit?.grossProfit === 'number'
          ? liveProfit.grossProfit
          : undefined;
      const liveGrossProfitPerc =
        typeof liveProfit?.grossProfitPerc === 'number'
          ? liveProfit.grossProfitPerc
          : undefined;

      return {
        ...baseBot,
        totalProfitUsd:
          typeof liveGrossProfitUsd === 'number'
            ? liveGrossProfitUsd
            : baseBot.totalProfitUsd,
        totalProfitPercent:
          typeof liveGrossProfitPerc === 'number'
            ? liveGrossProfitPerc
            : baseBot.totalProfitPercent,
        pnlPercent:
          typeof liveNetProfitPerc === 'number'
            ? liveNetProfitPerc
            : baseBot.pnlPercent,
        avgDaily:
          typeof liveAvgDailyUsd === 'number'
            ? liveAvgDailyUsd
            : baseBot.avgDaily,
        avgDailyPerc:
          typeof liveAvgDailyPerc === 'number'
            ? liveAvgDailyPerc
            : (baseBot.avgDailyPerc ?? 0),
        annualizedReturn:
          typeof liveAnnualized === 'number'
            ? liveAnnualized
            : baseBot.annualizedReturn,
        rawData: {
          ...baseBot.rawData,
          stats: {
            ...baseBot.rawData?.stats,
            chart:
              liveChart && liveChart.length > 0
                ? liveChart
                : (baseBot.rawData?.stats?.chart ?? []),
          },
        },
      };
    }

    // Transform based on bot type for source bots (not DrawerBot)
    let baseBot;
    if (botType === 'dca') {
      // DCA bots: Use DCA-specific transformation
      const latestPrices = getLocalPrices();
      baseBot = transformDcaBotToBot(rawBot, undefined, latestPrices, [], []);
    } else if (botType === 'grid') {
      // Grid bots: Need transformation to calculate value, avgDaily, annualizedReturn
      // transformGridBotToBot adds calculated metrics that aren't in the backend response
      baseBot = transformGridBotToBot(rawBot as GridBot);
    } else if (botType === 'hedgeDca' || botType === 'hedgeCombo') {
      // Hedge bots: Use hedge-specific transformation with aggregation
      const latestPrices = getLocalPrices();
      baseBot = transformHedgeBotToBot(rawBot, latestPrices, []);
    } else {
      // Combo bots: Use combo-specific transformation to compute unified metrics
      baseBot = transformComboBotToBot(rawBot as ComboBotType);
    }

    if (!liveStats) {
      return baseBot;
    }

    const liveGeneral = liveStats.numerical?.general;
    const liveProfit = liveStats.numerical?.profit;
    const liveChart = Array.isArray(liveStats.chart)
      ? liveStats.chart
      : undefined;

    const liveNetProfitPerc =
      typeof liveGeneral?.netProfitPerc === 'number'
        ? liveGeneral.netProfitPerc * 100
        : undefined;
    const liveAvgDailyUsd =
      typeof liveGeneral?.avgDaily === 'number'
        ? liveGeneral.avgDaily
        : undefined;
    const liveAvgDailyPerc =
      typeof liveGeneral?.avgDailyPerc === 'number'
        ? liveGeneral.avgDailyPerc
        : undefined;
    const liveAnnualized =
      typeof liveGeneral?.avgDailyPerc === 'number'
        ? Math.round(
            (((liveGeneral.avgDailyPerc ?? 0) / 100) * 365 * 100 +
              Number.EPSILON) *
              100
          ) / 100
        : undefined;
    const liveGrossProfitUsd =
      typeof liveProfit?.grossProfit === 'number'
        ? liveProfit.grossProfit
        : undefined;
    const liveGrossProfitPerc =
      typeof liveProfit?.grossProfitPerc === 'number'
        ? liveProfit.grossProfitPerc
        : undefined;

    type BaseMetrics = {
      totalProfitUsd?: number;
      totalProfitPercent?: number;
      avgDaily?: number;
      avgDailyPerc?: number;
      rawData?: { stats?: { chart?: unknown } };
    };
    const baseAny = baseBot as unknown as BaseMetrics;

    return {
      ...baseBot,
      totalProfitUsd:
        typeof liveGrossProfitUsd === 'number'
          ? liveGrossProfitUsd
          : baseAny.totalProfitUsd,
      totalProfitPercent:
        typeof liveGrossProfitPerc === 'number'
          ? liveGrossProfitPerc
          : baseAny.totalProfitPercent,
      pnlPercent:
        typeof liveNetProfitPerc === 'number'
          ? liveNetProfitPerc
          : baseBot.pnlPercent,
      avgDaily:
        typeof liveAvgDailyUsd === 'number'
          ? liveAvgDailyUsd
          : baseAny.avgDaily,
      avgDailyPerc:
        typeof liveAvgDailyPerc === 'number'
          ? liveAvgDailyPerc
          : baseAny.avgDailyPerc,
      annualizedReturn:
        typeof liveAnnualized === 'number'
          ? liveAnnualized
          : baseBot.annualizedReturn,
      rawData: {
        ...baseAny.rawData,
        stats: {
          ...baseAny.rawData?.stats,
          chart:
            liveChart && liveChart.length > 0
              ? liveChart
              : (baseAny.rawData?.stats?.chart ?? []),
        },
      },
    };
  }, [rawBot, liveStats, botType, botProp]); */

  const transformedBot = useMemo(() => botProp, [botProp]);

  const botWithUnrealizedPnl = transformedBot as BotWithUnrealizedPnl | null;
  const hasUnrealizedPnl =
    botWithUnrealizedPnl?.unrealizedPnlUsd !== undefined ||
    botWithUnrealizedPnl?.unrealizedPnl !== undefined;

  // Use consistent value calculation from transformation layer (same as table and card views)
  const valueMetrics = useMemo(() => {
    if (!transformedBot) {
      return {
        currentValue: 0,
        currentValuePercent: 0,
        totalProfit: 0,
        investedAmount: 0,
        totalProfitPercent: 0,
        isProfit: true,
      };
    }

    // Use the calculated value from transformDcaBotToBot (consistent across all views)
    const currentValue = isGrid
      ? transformedBot.value || 0
      : transformedBot.unPnl || 0;
    // Get other metrics from the transformed bot data
    type WithTotals = {
      totalProfitUsd?: number;
      profitPerc?: number;
      avgDaily?: number;
      avgDailyPerc?: number;
      investedUsd?: number;
      closedTrades?: number;
      unPnlPerc?: number;
    };
    const tb = transformedBot as unknown as WithTotals;
    const totalProfit = tb.totalProfitUsd || 0;
    const investedAmount = transformedBot.maxValue || 0;
    const totalProfitPercent = isGrid
      ? +(transformedBot.valueChange || 0)
      : tb.profitPerc || 0;
    const currentValuePercent = isGrid
      ? +(transformedBot.valueChange || 0)
      : tb.unPnlPerc || 0;

    return {
      currentValue: currentValue,
      currentValuePercent: currentValuePercent,
      totalProfit: totalProfit,
      investedAmount: investedAmount,
      totalProfitPercent: totalProfitPercent,
      isProfit: totalProfit >= 0,
    };
  }, [transformedBot, isGrid]);

  // Use backend-calculated profit metrics with fallback calculations
  const profitMetrics = useMemo(() => {
    if (!rawBot && !liveStats) return null;

    const totalProfit =
      typeof liveStats?.numerical?.profit?.grossProfit === 'number'
        ? liveStats.numerical.profit.grossProfit
        : rawBot?.profit?.totalUsd || 0;

    // Grid bots: Use client-calculated avgDaily from transformation
    // DCA bots: Use backend stats.numerical if available
    const avgDaily = transformedBot?.avgDaily || 0;

    const workingTimeMs = rawBot?.workingTimeNumber || 0;

    let totalDays = 0;
    if (workingTimeMs > 0) {
      totalDays = Math.max(
        1,
        Math.floor(workingTimeMs / (1000 * 60 * 60 * 24))
      );
    } else if (rawBot) {
      const createdDate = new Date(rawBot.created);
      const now = new Date();
      totalDays = Math.max(
        1,
        Math.floor(
          (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
        )
      );
    }

    const bestDay =
      typeof liveStats?.numerical?.general?.bestDay?.value === 'number'
        ? liveStats.numerical.general?.bestDay?.value
        : (rawBot?.stats as BotStats)?.numerical?.general.bestDay?.value || 0;
    const worstDay =
      typeof liveStats?.numerical?.general?.worstDay?.value === 'number'
        ? liveStats.numerical.general?.worstDay?.value
        : (rawBot?.stats as BotStats)?.numerical?.general.worstDay?.value || 0;

    // Grid bots: Use closedTrades (buy + sell transactions)
    // DCA bots: Use backend stats.numerical.deals
    const totalDeals =
      botType === 'grid'
        ? (rawBot as GridBot).transactionsCount.buy +
          (rawBot as GridBot).transactionsCount.sell
        : (rawBot as DCABot)?.dealsInBot?.all;

    // Grid bots: Use investedUsd (initial budget)
    // DCA bots: Use usage.current.quote (current allocated capital)
    const investedAmount =
      botType === 'grid'
        ? transformedBot?.budget || 0
        : transformedBot?.currentValue || 0;

    const roi = investedAmount > 0 ? (totalProfit / investedAmount) * 100 : 0;

    // Win rate only applies to DCA bots (Grid bots don't track deal profit/loss)
    const dealsProfit =
      liveStats?.numerical?.deals?.profit ??
      (rawBot as DCABot)?.stats?.numerical?.deals?.profit ??
      0;
    const dealsLoss =
      liveStats?.numerical?.deals?.loss ??
      (rawBot as DCABot)?.stats?.numerical?.deals?.loss ??
      0;
    // For combo bots, use getComboBotDealsStats API when stats.numerical.deals is empty
    const tradeWinRate =
      botType === 'grid'
        ? 0
        : dealsProfit + dealsLoss > 0
          ? (dealsProfit / (dealsProfit + dealsLoss)) * 100
          : isCombo && typeof comboDealStats?.winRate === 'number'
            ? comboDealStats.winRate
            : 0;

    const grossProfit =
      typeof liveStats?.numerical?.profit?.grossProfit === 'number'
        ? liveStats.numerical.profit.grossProfit
        : undefined;
    const grossLoss =
      typeof liveStats?.numerical?.loss?.grossLoss === 'number'
        ? liveStats.numerical.loss.grossLoss
        : undefined;

    const profitFactor =
      grossLoss && grossLoss > 0
        ? (grossProfit ?? 0) / grossLoss
        : grossProfit && grossProfit > 0
          ? Infinity
          : 0;

    const maxDrawdown =
      typeof liveStats?.numerical?.loss?.maxDrawdown === 'number'
        ? liveStats.numerical.loss.maxDrawdown
        : (rawBot as DCABot)?.stats?.numerical?.loss?.maxDrawdown?.usd || 0;

    return {
      totalProfit,
      avgDailyProfit: avgDaily,
      bestDay,
      worstDay,
      totalDays,
      totalDeals,
      tradeWinRate,
      roi,
      profitFactor,
      maxDrawdown,
    };
  }, [rawBot, liveStats, botType, transformedBot, isCombo, comboDealStats]);

  // Performance metrics from DrawerPerformanceMetrics (merged functionality)
  const performanceMetrics = useMemo((): PerformanceMetrics | null => {
    const liveNumerical = liveStats?.numerical;
    const apiNumerical = (rawBot as DCABot)?.stats?.numerical;
    // Prefer live stats when they have meaningful deal data; otherwise use API stats
    const stats =
      liveNumerical &&
      ((liveNumerical.deals?.profit ?? 0) + (liveNumerical.deals?.loss ?? 0) >
        0 ||
        !apiNumerical)
        ? liveNumerical
        : (apiNumerical ?? liveNumerical);
    // For combo bots, allow rendering even without stats if we have comboDealStats
    if (!stats && !comboDealStats) return null;

    const dealsProfit = stats?.deals?.profit ?? 0;
    const dealsLoss = stats?.deals?.loss ?? 0;
    const totalDeals = dealsProfit + dealsLoss;

    // For combo bots, use getComboBotDealsStats API when stats.numerical.deals is empty
    const winRate =
      totalDeals > 0
        ? Math.round((dealsProfit / totalDeals) * 100)
        : isCombo && typeof comboDealStats?.winRate === 'number'
          ? Math.round(comboDealStats.winRate)
          : 0;

    const ratios = (stats as { ratios?: { profitFactor?: number } } | undefined)
      ?.ratios;
    const rawProfitFactor =
      typeof ratios?.profitFactor === 'number' ? ratios.profitFactor : 0;
    // Backend sends -1 when profit factor is Infinity (all wins, no losses)
    let profitFactorValue =
      rawProfitFactor === -1 || rawProfitFactor === Infinity
        ? Infinity
        : rawProfitFactor;
    // For combo bots: if stats profitFactor is 0 but winRate is 100%, it means all wins
    if (profitFactorValue === 0 && isCombo && winRate === 100) {
      profitFactorValue = Infinity;
    }

    const lossStats = (
      stats as {
        loss?: {
          maxEquityDrawdownPerc?: number;
          maxDrawdownPerc?: number;
          maxDrawdownPercent?: number;
        };
      }
    )?.loss;
    const maxEquityDrawdownPerc = (() => {
      if (typeof lossStats?.maxEquityDrawdownPerc === 'number') {
        return Math.abs(lossStats.maxEquityDrawdownPerc);
      }
      if (typeof lossStats?.maxDrawdownPerc === 'number') {
        return Math.abs(lossStats.maxDrawdownPerc);
      }
      if (typeof lossStats?.maxDrawdownPercent === 'number') {
        return Math.abs(lossStats.maxDrawdownPercent);
      }
      return 0;
    })();

    const generalStats = stats?.general as {
      avgDailyPerc?: number;
      netProfitPerc?: number;
    };

    const avgDailyReturnPercRaw =
      typeof generalStats?.avgDailyPerc === 'number'
        ? generalStats.avgDailyPerc
        : 0;

    const netResultPercRaw =
      typeof generalStats?.netProfitPerc === 'number'
        ? generalStats.netProfitPerc
        : 0;

    return {
      netResultPerc: Math.round(netResultPercRaw * 100),
      avgDailyReturnPerc: Math.round(avgDailyReturnPercRaw * 100),
      maxEquityDrawdownPerc: Math.round(maxEquityDrawdownPerc),
      winRate,
      profitFactor:
        profitFactorValue === Infinity
          ? Infinity
          : Math.round(profitFactorValue * 100) / 100,
    };
  }, [liveStats, rawBot, comboDealStats, isCombo]);

  // Note: Removed period grouping since we're using consistent calculations

  /* if (botsLoading || dealsLoading) {
    return (
      <DrawerSection
        widgetId={widgetId}
        widgetType="drawer-profit-tabs"
        title="Profit & Performance"
        icon={DollarSign}
        minSize={{ w: 6, h: 6 }}
        maxSize={{ w: 12, h: 10 }}
      >
        <div className="flex items-center justify-center h-64">
          <div className="text-xs text-muted-foreground">
            Loading profit data...
          </div>
        </div>
      </DrawerSection>
    );
  } */

  /*  if (botsError || dealsError) {
    return (
      <DrawerSection
        widgetId={widgetId}
        widgetType="drawer-profit-tabs"
        title="Profit & Performance"
        icon={DollarSign}
        minSize={{ w: 6, h: 6 }}
        maxSize={{ w: 12, h: 10 }}
      >
        <div className="text-sm text-muted-foreground">
          Unable to load profit and performance data. Please try refreshing the
          page.
        </div>
      </DrawerSection>
    );
  } */

  const workingTime = useMemo(
    () => transformedBot?.workingTimeNumber ?? 0,
    [transformedBot?.workingTimeNumber]
  );

  if (/* botsError || dealsError || */ !rawBot) {
    return (
      <DrawerSection
        widgetId={widgetId}
        widgetType="drawer-profit-tabs"
        title="Overview"
        icon={DollarSign}
        minSize={{ w: 6, h: 6 }}
        maxSize={{ w: 12, h: 10 }}
      >
        <div className="flex items-center justify-center h-64">
          <div className="text-xs text-muted-foreground">
            {
              /* botsError || dealsError
              ? 'Error loading profit data'
              :  */ 'Bot not found'
            }
          </div>
        </div>
      </DrawerSection>
    );
  }

  // Use backend-calculated working time if available, otherwise calculate from working shifts

  const workingDays = Math.max(1, workingTime / (24 * 60 * 60 * 1000));
  // Use backend-calculated annualized return if available, otherwise calculate client-side
  const annualizedReturn =
    typeof transformedBot?.annualizedReturn === 'number'
      ? transformedBot.annualizedReturn
      : workingDays > 0
        ? ((rawBot?.profit?.totalUsd || 0) / workingDays) * 365
        : 0;

  // Calculate average daily profit (for potential future use)
  // const avgDaily = workingDays > 0 ? (bot.profit?.totalUsd || 0) / workingDays : 0;

  // Profit Overview Section - Primary metrics
  const profitOverviewCards: MetricCardProps[] = [
    // Grid bots: show Value Change (USD diff); Others: show Current Value
    {
      label: isGrid ? 'Value Change' : 'Current Value',
      value:
        !isGrid && pricesLoading ? (
          <Skeleton className="h-4 w-20" />
        ) : (
          <ProfitAndPerc
            value={
              isGrid
                ? parseFloat(transformedBot?.valueChangeUsd || '0') || 0
                : valueMetrics.currentValue
            }
            percentage={valueMetrics.currentValuePercent}
            privacyMode={privacyMode}
            chipPosition="right"
            size="sm"
          />
        ),
      valueClassName: 'text-sm font-semibold',
    },
    // Grid bots: show Bot Profit + Bot Free Profit; Others: show Total Profit
    ...(isGrid
      ? ([
          {
            label: 'Bot Profit',
            value: (
              <ProfitAndPerc
                value={rawBot?.profit?.totalUsd || 0}
                percentage={transformedBot?.fullProfitPerc || 0}
                privacyMode={privacyMode}
                chipPosition="right"
                size="sm"
              />
            ),
            valueClassName: 'text-sm font-semibold',
          },
          {
            label: 'Bot Free Profit',
            value: (
              <ProfitAndPerc
                value={
                  rawBot?.status === 'closed' || rawBot?.status === 'archive'
                    ? (rawBot?.profit?.totalUsd || 0)
                    : (rawBot?.profit?.freeTotalUsd ||
                        rawBot?.profit?.totalUsd ||
                        0)
                }
                percentage={transformedBot?.profitPerc || 0}
                privacyMode={privacyMode}
                chipPosition="right"
                size="sm"
              />
            ),
            valueClassName: 'text-sm font-semibold',
          },
        ] as MetricCardProps[])
      : [
          {
            label: 'Total Profit',
            value: (
              <ProfitAndPerc
                value={rawBot?.profit?.totalUsd || 0}
                percentage={valueMetrics.totalProfitPercent}
                privacyMode={privacyMode}
                chipPosition="right"
                size="sm"
              />
            ),
            valueClassName: 'text-sm font-semibold',
          },
        ]),
    {
      label: 'Invested Amount',
      value: formatCurrency(
        botType === 'grid'
          ? (transformedBot?.budget ?? 0)
          : (rawBot?.currentValue ?? 0),
        2
      ),
      valueClassName: 'text-sm font-semibold text-foreground',
    },
    ...(profitMetrics
      ? ([
          {
            label: 'Annual Return',
            value: <ProfitLossPercChip value={annualizedReturn} size="sm" />,
            valueClassName: 'text-sm font-semibold',
          },
          {
            label: 'Avg Daily Return',
            value: (
              <ProfitAndPerc
                value={transformedBot?.avgDaily || 0}
                percentage={transformedBot?.avgDailyPerc || 0}
                privacyMode={privacyMode}
                chipPosition="right"
                size="sm"
              />
            ),
            valueClassName: 'text-sm font-semibold',
          },
        ] as MetricCardProps[])
      : []),
    // Deals (not applicable for grid bots)
    ...(profitMetrics && botType !== 'grid'
      ? ([
          {
            label: 'Deals',
            value: `${(rawBot as DCABot)?.dealsInBot?.active ?? 0} / ${profitMetrics.totalDeals}`,
            valueClassName: 'text-sm font-semibold text-foreground',
          },
        ] as MetricCardProps[])
      : []),
  ];

  // Risk & Performance Section
  const riskPerformanceCards: MetricCardProps[] = performanceMetrics
    ? [
        // Only show Max Equity Drawdown when the backend has actually calculated a value
        ...(performanceMetrics.maxEquityDrawdownPerc > 0
          ? [
              {
                label: 'Max Equity Drawdown',
                value: (
                  <ProfitLossPercChip
                    value={-Math.abs(
                      performanceMetrics.maxEquityDrawdownPerc
                    )}
                    size="sm"
                  />
                ),
                valueClassName: 'text-sm font-semibold',
              } as MetricCardProps,
            ]
          : []),
        {
          label: 'Win Rate',
          value: (
            <ProfitLossPercChip
              value={performanceMetrics.winRate}
              size="sm"
              showSign={false}
            />
          ),
          helper: (
            <ProgressBar
              value={performanceMetrics.winRate}
              max={100}
              className="h-1.5"
              variant={
                performanceMetrics.winRate >= 60
                  ? 'success'
                  : performanceMetrics.winRate >= 40
                    ? 'warning'
                    : 'danger'
              }
            />
          ),
          helperClassName: 'mt-2',
        },
        {
          label: 'Profit Factor',
          value:
            performanceMetrics.profitFactor === Infinity
              ? '∞'
              : performanceMetrics.profitFactor.toFixed(2),
          icon: <BarChart2 className="h-3 w-3 text-muted-foreground" />,
          valueClassName: 'text-sm font-semibold text-foreground',
        },
      ]
    : [];

  const unrealizedMetricCards: MetricCardProps[] = hasUnrealizedPnl
    ? [
        {
          label: 'Unrealized P&L',
          value: pricesLoading ? (
            <Skeleton className="h-4 w-20" />
          ) : (
            <ProfitAndPerc
              value={botWithUnrealizedPnl?.unrealizedPnlUsd || 0}
              percentage={botWithUnrealizedPnl?.unrealizedPnlPercent || 0}
              privacyMode={privacyMode}
              chipPosition="right"
              size="sm"
            />
          ),
          valueClassName: 'text-sm font-semibold',
        },
        {
          label: 'Open Trades',
          value: (
            botWithUnrealizedPnl?.openTrades ||
            (rawBot as DCABot)?.dealsInBot?.active ||
            0
          ).toLocaleString(),
          valueClassName: 'text-sm font-semibold text-foreground',
        },
      ]
    : [];


  return (
    <div className="space-y-5 sm:space-y-lg @container">
      {/* Grid Info Section - Only for Grid bots */}
      {botType === 'grid' &&
        rawBot &&
        (() => {
          const gridRaw = rawBot as unknown as GridBot;
          const txBuy = gridRaw?.transactionsCount?.buy ?? 0;
          const txSell = gridRaw?.transactionsCount?.sell ?? 0;
          const txTotal = txBuy + txSell;
          const activeBuy = gridRaw?.levels?.active?.buy ?? 0;
          const activeSell = gridRaw?.levels?.active?.sell ?? 0;
          const allBuy = gridRaw?.levels?.all?.buy ?? 0;
          const allSell = gridRaw?.levels?.all?.sell ?? 0;

          return (
            <DrawerSection
              widgetId={`${widgetId}-grid-info`}
              widgetType="drawer-profit-tabs"
              title="Grid Info"
              icon={DollarSign}
              minSize={{ w: 6, h: 4 }}
              maxSize={{ w: 12, h: 6 }}
            >
              <div className="grid grid-cols-2 gap-sm @[380px]:grid-cols-3 @[520px]:grid-cols-4 @[640px]:grid-cols-5">
                <MetricCard
                  label="Transactions"
                  tooltip="The bot's total completed buy and sell orders."
                  value={txTotal}
                  helper={
                    <span className="flex items-center gap-1">
                      <span className="text-profit">{txBuy}</span>
                      <span>/</span>
                      <span className="text-loss">{txSell}</span>
                    </span>
                  }
                />
                <MetricCard
                  label="Working Time"
                  tooltip='The time the bot was actively trading, excluding time spent in "error" and "range" status.'
                  value={formatWorkingTime(workingTime)}
                />
                {gridRaw.status !== 'closed' && (
                  <MetricCard
                    label="Active Orders"
                    tooltip="The bot's total limit grid orders on exchange."
                    value={
                      <span className="flex items-center gap-1">
                        <span>{activeBuy + activeSell}</span>
                        <span className="text-xs text-muted-foreground">
                          ({activeBuy}/{activeSell})
                        </span>
                      </span>
                    }
                  />
                )}
                {gridRaw.status !== 'closed' && (
                  <MetricCard
                    label="Grid Levels"
                    value={
                      <span className="flex items-center gap-1">
                        <span>{allBuy + allSell}</span>
                        <span className="text-xs text-muted-foreground">
                          ({allBuy}/{allSell})
                        </span>
                      </span>
                    }
                  />
                )}
              </div>
            </DrawerSection>
          );
        })()}

      {/* Profit Section */}
      <DrawerSection
        widgetId={`${widgetId}-profit`}
        widgetType="drawer-profit-tabs"
        title="Profit"
        icon={DollarSign}
        minSize={{ w: 6, h: 4 }}
        maxSize={{ w: 12, h: 8 }}
      >
        <div className="grid grid-cols-1 gap-sm @[300px]:grid-cols-2 @[520px]:grid-cols-3 @[680px]:grid-cols-4 @[860px]:grid-cols-5">
          {profitOverviewCards.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </div>
      </DrawerSection>

      {/* Risk & Performance Section */}
      {riskPerformanceCards.length > 0 && (
        <DrawerSection
          widgetId={`${widgetId}-risk`}
          widgetType="drawer-profit-tabs"
          title="Risk & Performance"
          icon={BarChart2}
          minSize={{ w: 6, h: 4 }}
          maxSize={{ w: 12, h: 8 }}
        >
          <div className="grid grid-cols-1 gap-sm @[300px]:grid-cols-2 @[520px]:grid-cols-3 @[680px]:grid-cols-4">
            {riskPerformanceCards.map((metric) => (
              <MetricCard key={metric.label} {...metric} />
            ))}
          </div>
        </DrawerSection>
      )}

      {/* Unrealized P&L Section */}
      {hasUnrealizedPnl && unrealizedMetricCards.length > 0 && (
        <DrawerSection
          widgetId={`${widgetId}-unrealized`}
          widgetType="drawer-profit-tabs"
          title="Current Positions"
          icon={DollarSign}
          minSize={{ w: 6, h: 4 }}
          maxSize={{ w: 12, h: 6 }}
        >
          <div className="grid grid-cols-1 gap-sm @[300px]:grid-cols-2 @[520px]:grid-cols-3">
            {unrealizedMetricCards.map((metric) => (
              <MetricCard key={metric.label} {...metric} />
            ))}
          </div>
        </DrawerSection>
      )}
    </div>
  );
};

export default DrawerProfitTabs;
