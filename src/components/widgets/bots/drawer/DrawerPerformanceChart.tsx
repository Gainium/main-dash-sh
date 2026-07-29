import type { DrawerBot } from '@/types/bots/drawer';
import { TrendingUp } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useChartColors } from '../../../../hooks/useChartColors';
import CustomTooltip from '../../../charts/CustomTooltip';
/* import { useComboBots } from '../../../../hooks/useComboBots';
import { useDcaBots } from '../../../../hooks/useDcaBots';
import { useGridBots } from '../../../../hooks/useGridBots';
import { useHedgeComboBots } from '../../../../hooks/useHedgeComboBots';
import { useHedgeDcaBots } from '../../../../hooks/useHedgeDcaBots'; */
import { BotTypesEnum, type BotStats, type DCABot } from '@/types';
import { useLiveBotMetrics } from '../../../../hooks/useLiveBotMetrics';
import { useShareContext } from '../../../../hooks/useShareContext';
import { useSharedBot } from '../../../../hooks/useSharedBot';
import { cn } from '../../../../lib/utils';
import { formatPriceWithPrecision } from '../../../../utils/formatters';
import { formatCurrency } from '../../../../utils/numberFormatter';
import { useUIStore } from '../../../../stores/uiStore';
import { DrawerSection } from './DrawerSection';

interface ChartDataPoint {
  time: number;
  equity?: number;
  realizedProfit?: number;
  buyAndHold?: number;
}

/** A stats object usable as the chart source: it must carry a real series. */
const hasChart = (stats?: BotStats | null): stats is BotStats =>
  Array.isArray(stats?.chart) && stats.chart.length > 1;

/**
 * The backend stores ONE chart point per day and hard-trims the array to this
 * many entries (main-app `core/src/bot/dcaHelper.ts`, `stats.chart.shift()`),
 * so a bot older than ~3 months only ever ships its most recent window. The
 * values stay absolute (realized profit is seeded at the starting balance and
 * accumulated for the bot's whole life), so a truncated window opens at
 * whatever the cumulative P&L was that day — which reads as "the chart ignores
 * my old losses" when the drawdown happened before the window. Surface the
 * truncation instead of leaving the user to infer it.
 */
const CHART_WINDOW_DAYS = 90;

/**
 * Both money helpers below prefix the currency symbol to the *signed* number,
 * so a negative renders as "$-83.20". The realized-profit axis here spans
 * negatives, so normalize to the conventional "-$83.20". This only moves the
 * sign — the magnitude ladders stay owned by the shared formatters.
 */
const signedMoney = (value: number, format: (n: number) => string): string =>
  `${value < 0 ? '-' : ''}${format(Math.abs(value))}`;

export interface DrawerPerformanceChartProps {
  widgetId: string;
  botId?: string;
  bot?: DrawerBot;
  initialChartData?: Array<{
    time: number;
    equity?: number;
    realizedProfit?: number;
    buyAndHold?: number;
  }>;
}

export const DrawerPerformanceChart: React.FC<DrawerPerformanceChartProps> = ({
  widgetId,
  botId,
  bot: botProp,
  initialChartData,
}) => {
  const { botId: paramBotId } = useParams<{ botId: string }>();
  const actualBotId = botId || paramBotId;
  const privacyMode = useUIStore((s) => s.privacyMode);

  // Determine bot type from prop
  /*   const botType = botProp?.type || 'dca'; */

  /* const {
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
    isError: _hedgeDcaError,
  } = useHedgeDcaBots({ terminal: false, paperContext: false });

  const {
    bots: hedgeComboBots,
    isLoading: hedgeComboLoading,
    isError: _hedgeComboError,
  } = useHedgeComboBots({ terminal: false, paperContext: false }); */

  const colors = useChartColors();

  // Use prop bot if available, otherwise find from fetched data
  const bot = botProp; /* ||
    (botType === 'grid'
      ? gridBots.find((b) => b._id === actualBotId)
      : botType === 'combo'
        ? comboBots.find((b) => b._id === actualBotId)
        : botType === 'hedgeDca'
          ? hedgeDcaBots.find((b) => b._id === actualBotId)
          : botType === 'hedgeCombo'
            ? hedgeComboBots.find((b) => b._id === actualBotId)
            : dcaBots.find((b) => b._id === actualBotId)); */

  /*   const botsLoading =
    dcaLoading ||
    gridLoading ||
    comboLoading ||
    hedgeDcaLoading ||
    hedgeComboLoading;
  const botsError = dcaError || gridError || comboError; */

  const { stats: liveStats } = useLiveBotMetrics({
    botId: actualBotId ?? '',
    enabled: Boolean(actualBotId),
  });

  // Determine bot type to map to BotTypesEnum for the by-id bot fetch
  const botType = botProp?.type || 'dca';
  const botTypeEnum =
    botType === 'combo'
      ? BotTypesEnum.combo
      : botType === 'grid'
        ? BotTypesEnum.grid
        : botType === 'hedgeDca'
          ? BotTypesEnum.hedgeDca
          : botType === 'hedgeCombo'
            ? BotTypesEnum.hedgeCombo
            : BotTypesEnum.dca;

  // `stats.chart` is the ONLY series denominated in real currency, so it is the
  // only thing this chart may plot. It normally rides on the bot object, but
  // `dcaBotListFragment` strips `stats` from the DCA list payload
  // (main-dash-sh 52dae4f, "slim dcaBotList payload") on the assumption that
  // "the single-bot drawer path uses getDCABot" — which `useDrawerBot` only
  // does for a bot that is MISSING from the list. An active DCA bot IS in the
  // list, so it arrives with no `stats` at all; and nothing seeds
  // `botStatsStore` until the socket pushes a `bot stats update` (next deal
  // close), so `liveStats` is null on a fresh page load too. Fetch the bot by
  // id in exactly that case — same authenticated `getDCABot` read
  // `useDrawerBot` already uses, whose full fragment does carry `stats.chart`.
  const { shareId } = useShareContext();
  const listStats = (bot as DCABot)?.stats as BotStats | undefined;
  const needsStatsFetch =
    Boolean(actualBotId) && !hasChart(liveStats) && !hasChart(listStats);
  const { bot: fetchedBot } = useSharedBot({
    botId: actualBotId ?? '',
    type: botTypeEnum,
    shareId,
    enabled: needsStatsFetch,
  });

  // Chart visibility state - all enabled by default
  const [showEquity, setShowEquity] = useState(true);
  const [showProfit, setShowProfit] = useState(true);
  const [showBuyAndHold, setShowBuyAndHold] = useState(true);

  // Generate chart data - use same data source as card for consistency.
  // Every source here is a `stats.chart` series, i.e. real currency. There is
  // deliberately NO fallback to `getBotProfitChartData`: that endpoint stores
  // a per-deal ROI *decimal fraction* (main-app dcaHelper.ts,
  // `value: perc = deal.profit.total / (usage * multiplier)`), not an amount,
  // so plotting it as equity/realized profit rendered a 1% deal as "$0.01".
  // That series is already shown correctly, as a percentage, by the sibling
  // "Deal Returns" widget (DrawerPnLScatterChart) directly below this one.
  const chartData = useMemo(() => {
    // The backend seeds the chart's `realizedProfit` at the starting balance and
    // accumulates realized PnL on top of it, so the series shares the equity
    // scale (a legacy single-axis trick). Recover the *true* realized profit by
    // removing that starting-balance offset; equity and buyAndHold are genuine
    // portfolio values and stay absolute, each on the left axis.
    //
    // Take the series and the offset from the SAME stats object. Pairing one
    // source's chart with another's (or with a missing one, which defaults to
    // 0) subtracts the wrong seed and plots the starting balance itself as
    // "realized profit" — off by the whole account size.
    const stats =
      [liveStats, listStats, (fetchedBot as DCABot | undefined)?.stats].find(
        hasChart
      ) ?? undefined;

    const chartSource =
      stats?.chart ??
      (Array.isArray(initialChartData) && initialChartData.length > 0
        ? initialChartData
        : []);
    // `initialChartData` is itself built from the list bot's `stats.chart`
    // (drawerWidgetConfig.buildPerformanceChartProps), so `listStats` is the
    // matching offset for it.
    const realizedOffset =
      (stats ?? listStats)?.numerical?.general?.startBalance?.usd ?? 0;

    const sanitized = (chartSource ?? [])
      .filter(
        (p: unknown): p is ChartDataPoint =>
          typeof (p as ChartDataPoint)?.time !== 'undefined'
      )
      .map((point: ChartDataPoint) => {
        const t = point.time as number | string;
        const timeValue =
          typeof t === 'number'
            ? t
            : typeof t === 'string'
              ? new Date(t).getTime() || Number.parseInt(t, 10) || NaN
              : NaN;

        return {
          equity: typeof point.equity === 'number' ? point.equity : 0,
          realizedProfit:
            typeof point.realizedProfit === 'number'
              ? point.realizedProfit - realizedOffset
              : 0,
          buyAndHold:
            typeof point.buyAndHold === 'number' ? point.buyAndHold : 0,
          time: timeValue,
          formattedTime: new Date(timeValue).toLocaleDateString(),
        };
      })
      .filter((p: { time: number }) => Number.isFinite(p.time))
      // The backend builds stats.chart via filter/push churn (and trims by
      // insertion order, not time), so points arrive unsorted. Without this
      // the lines zigzag and "Realized Profit" appears to fall over time.
      .sort((a: { time: number }, b: { time: number }) => a.time - b.time);

    return sanitized;
  }, [listStats, initialChartData, liveStats, fetchedBot]);

  const isPositiveProfit = useMemo(() => {
    if (typeof liveStats?.numerical?.profit?.grossProfit === 'number') {
      return liveStats.numerical.profit.grossProfit >= 0;
    }
    return (bot?.profit?.totalUsd || 0) >= 0;
  }, [liveStats, bot]);

  const hasRealData = useMemo(() => {
    return chartData.length > 0;
  }, [chartData]);

  // At the cap the backend has been dropping the oldest day for a while, so
  // everything before the first point is missing — including any drawdown.
  const isWindowed = chartData.length >= CHART_WINDOW_DAYS;

  // Chart series are now handled directly in JSX for better performance

  /* const isLoading = botsLoading;
  const isError = botsError; */

  /* if (isLoading) {
    return (
      <DrawerSection
        widgetId={widgetId}
        widgetType="drawer-performance-chart"
        title="Performance Chart"
        icon={TrendingUp}
        minSize={{ w: 6, h: 8 }}
        maxSize={{ w: 12, h: 16 }}
        hasOptions={false}
      >
        <div className="flex items-center justify-center h-48">
          <div className="text-sm text-muted-foreground">
            Loading performance data...
          </div>
        </div>
      </DrawerSection>
    );
  } */

  if (/* isError || */ !bot) {
    return (
      <DrawerSection
        widgetId={widgetId}
        widgetType="drawer-performance-chart"
        title="Performance Chart"
        icon={TrendingUp}
        minSize={{ w: 6, h: 8 }}
        maxSize={{ w: 12, h: 16 }}
        hasOptions={false}
      >
        <div className="flex items-center justify-center h-48">
          <div className="text-sm text-muted-foreground">
            {
              /* isError ? 'Error loading performance data' :  */ 'Bot not found'
            }
          </div>
        </div>
      </DrawerSection>
    );
  }

  return (
    <DrawerSection
      widgetId={widgetId}
      widgetType="drawer-performance-chart"
      title="Performance Chart"
      icon={TrendingUp}
      minSize={{ w: 6, h: 8 }}
      maxSize={{ w: 12, h: 16 }}
      hasOptions={false}
      headerActions={
        hasRealData && (
          <div className="flex flex-wrap items-center gap-xs rounded-lg bg-inner-container p-1">
            {[
              {
                key: 'equity',
                label: 'Equity',
                color: '#3b82f6',
                active: showEquity,
                onToggle: () => setShowEquity((prev) => !prev),
              },
              {
                key: 'profit',
                label: 'Realized Profit',
                color: isPositiveProfit ? colors.success : colors.destructive,
                active: showProfit,
                onToggle: () => setShowProfit((prev) => !prev),
              },
              {
                key: 'buy-and-hold',
                label: 'Buy & Hold',
                color: '#6b7280',
                active: showBuyAndHold,
                onToggle: () => setShowBuyAndHold((prev) => !prev),
              },
            ].map(({ key, label, color, active, onToggle }) => (
              <button
                key={key}
                type="button"
                onClick={onToggle}
                role="checkbox"
                aria-checked={active}
                className={cn(
                  'inline-flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-md border border-transparent px-3 py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-0! sm:flex-none',
                  active
                    ? 'bg-background text-foreground border-border shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
                {label}
              </button>
            ))}
          </div>
        )
      }
    >
      <div className="p-md">
        {!hasRealData && (
          <div className="mb-3 w-full rounded-md bg-muted/40 px-2 py-1 text-xs text-muted-foreground sm:w-auto sm:text-right">
            No data
          </div>
        )}

        {hasRealData && isWindowed && (
          <div className="mb-2 text-xs leading-tight text-muted-foreground">
            Last {CHART_WINDOW_DAYS} days · Realized Profit is cumulative since
            the bot started
          </div>
        )}

        <div className="h-48 w-full">
          {hasRealData ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 1, right: 1, left: 1, bottom: 1 }}
              >
                <defs>
                  <linearGradient
                    id={`equityGradient-${actualBotId}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient
                    id={`profitGradient-${actualBotId}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={
                        isPositiveProfit ? colors.success : colors.destructive
                      }
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor={
                        isPositiveProfit ? colors.success : colors.destructive
                      }
                      stopOpacity={0}
                    />
                  </linearGradient>
                  <linearGradient
                    id={`buyAndHoldGradient-${actualBotId}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#6b7280" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6b7280" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#374151"
                  opacity={0.03}
                  vertical={false}
                  horizontal={true}
                />
                <XAxis
                  dataKey="formattedTime"
                  tick={{ fontSize: 8, fill: '#6b7280' }}
                  tickLine={{ stroke: '#6b7280' }}
                  axisLine={{ stroke: '#6b7280' }}
                  height={15}
                />
                <YAxis
                  yAxisId="equity"
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 8, fill: '#6b7280' }}
                  tickLine={{ stroke: '#6b7280' }}
                  axisLine={{ stroke: '#6b7280' }}
                  tickFormatter={(value) =>
                    privacyMode ? '***' : signedMoney(value, formatCurrency)
                  }
                  width={44}
                />
                <YAxis
                  yAxisId="profit"
                  orientation="right"
                  domain={['auto', 'auto']}
                  tick={{
                    fontSize: 8,
                    fill: isPositiveProfit ? colors.success : colors.destructive,
                  }}
                  tickLine={{
                    stroke: isPositiveProfit ? colors.success : colors.destructive,
                  }}
                  axisLine={{
                    stroke: isPositiveProfit ? colors.success : colors.destructive,
                  }}
                  tickFormatter={(value) =>
                    privacyMode ? '***' : signedMoney(value, formatCurrency)
                  }
                  width={44}
                />
                <Tooltip
                  content={
                    <CustomTooltip
                      valueFormatter={
                        privacyMode
                          ? (value, name) => ['***', name] as const
                          : (value, name) =>
                              [
                                signedMoney(
                                  value as number,
                                  formatPriceWithPrecision
                                ),
                                name,
                              ] as const
                      }
                    />
                  }
                />
                {/* Break-even marker for the realized-P&L axis. Without it a
                    truncated window that opens deep in the red (see
                    CHART_WINDOW_DAYS) reads as an uninterrupted climb, and a
                    bot still recovering from a loss looks purely profitable.
                    Tinted like the realized-profit series, not like the grid,
                    so it reads against the RIGHT axis — on the left axis $0
                    lands mid-equity and would look like a price level. */}
                {showProfit && (
                  <ReferenceLine
                    yAxisId="profit"
                    y={0}
                    stroke={
                      isPositiveProfit ? colors.success : colors.destructive
                    }
                    strokeDasharray="4 4"
                    strokeOpacity={0.45}
                    ifOverflow="extendDomain"
                    label={{
                      value: 'Break-even',
                      position: 'insideBottomRight',
                      fill: isPositiveProfit
                        ? colors.success
                        : colors.destructive,
                      fillOpacity: 0.8,
                      fontSize: 8,
                    }}
                  />
                )}
                {showEquity && (
                  <Area
                    yAxisId="equity"
                    type="monotone"
                    dataKey="equity"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill={`url(#equityGradient-${actualBotId})`}
                    fillOpacity={0.3}
                    name="Bot Equity"
                    // Keep isAnimationActive false on every series here:
                    // recharts' JavascriptAnimate calls setState from its
                    // unmount cleanup, so a chart unmounting mid-animation
                    // trips React's nested-update limit (minified #185).
                    // Mirrors BotCard/TradeCard.
                    isAnimationActive={false}
                  />
                )}
                {showProfit && (
                  <Line
                    yAxisId="profit"
                    type="monotone"
                    dataKey="realizedProfit"
                    stroke={
                      isPositiveProfit ? colors.success : colors.destructive
                    }
                    strokeWidth={2}
                    dot={false}
                    name="Realized Profit"
                    isAnimationActive={false}
                  />
                )}
                {showBuyAndHold && (
                  <Area
                    yAxisId="equity"
                    type="monotone"
                    dataKey="buyAndHold"
                    stroke="#6b7280"
                    strokeWidth={2}
                    fill={`url(#buyAndHoldGradient-${actualBotId})`}
                    fillOpacity={0.3}
                    name="Buy & Hold"
                    isAnimationActive={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-muted-foreground">
                <TrendingUp className="w-6 h-6 mx-auto mb-1 opacity-50" />
                <p className="text-xs">No performance data available</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </DrawerSection>
  );
};

export default DrawerPerformanceChart;
