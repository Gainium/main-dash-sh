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
import { useBotProfitChartData } from '../../../../hooks/useBotProfitChartData';
import { useLiveBotMetrics } from '../../../../hooks/useLiveBotMetrics';
import { useShareContext } from '../../../../hooks/useShareContext';
import { useSharedBot } from '../../../../hooks/useSharedBot';
import { cn } from '../../../../lib/utils';
import { formatPriceWithPrecision } from '../../../../utils/formatters';
import { formatCurrency } from '../../../../utils/numberFormatter';
import { useUIStore } from '../../../../stores/uiStore';
import {
  DealReturnsPanel,
  type ScatterPoint,
} from './DrawerPnLScatterChart';
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
 * Stronger test: the series carries the values this widget actually PLOTS.
 *
 * `BotStats['chart']` types all four fields as required, but GraphQL only
 * returns what the caller selected, and the list payload's slice
 * (`listChartStatsFragment`, GraphQLQueries-fragments.ts) selects just
 * `equity` + `time`. So "has a chart" is NOT "has the three series" — gating
 * the by-id `getDCABot` fetch on `hasChart` alone let that equity-only slice
 * satisfy it, the fetch never fired, and Realized Profit / Buy & Hold were
 * plotted as flat $0 lines (which also dragged the shared equity axis down to
 * zero). Anything that decides whether we still NEED the full payload has to
 * ask this instead.
 */
const hasFullChart = (stats?: BotStats | null): stats is BotStats =>
  hasChart(stats) &&
  stats.chart.some(
    (point) =>
      typeof point?.realizedProfit === 'number' ||
      typeof point?.buyAndHold === 'number'
  );

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The backend keeps at most this many daily points (main-app
 * `core/src/bot/dcaHelper.ts`: `if (stats.chart.length > 90) stats.chart.shift()`).
 * A series at the cap MAY have been trimmed, so its first point is not
 * necessarily the bot's first day — which is exactly what decides whether the
 * leading edge may be seeded from `startBalance` (see `plottedChartData`).
 */
const CHART_POINT_CAP = 90;

/**
 * `value` is a decimal ROI fraction (main-app `dcaHelper.ts`:
 * `perc = deal.profit.total / (usage * multiplier)`), NOT an amount — hence
 * the ×100. Timestamps are used raw: the legacy scatter pre-shifted them by
 * the local timezone offset and then formatted in local time as well, which
 * double-counted the offset. Both panels now plot raw epoch ms, and they must
 * agree or they sit shifted relative to each other.
 */
const buildDealReturnPoints = (
  profitData: Array<{ value: number; time: number }>
): ScatterPoint[] =>
  profitData.map((d) => ({
    x: d.time,
    y: +(d.value * 100).toFixed(3),
    formattedTime: new Date(d.time).toLocaleDateString(),
  }));

/**
 * Range options for BOTH panels. Deliberately no "12M": the deal-returns
 * series is pruned at 12 months, and the equity series is capped at **90 daily
 * points** (main-app `core/src/bot/dcaHelper.ts`, `stats.chart.shift()`) — so
 * a 12M option would be indistinguishable from ALL on every existing bot. If
 * the backend cap is ever raised, add it here; nothing else needs to change.
 *
 * That 90-point cap is also why the upper panel can start mid-chart under ALL:
 * its values are absolute (realized profit is seeded at the starting balance
 * and accumulated for the bot's whole life), so a TRIMMED series simply begins
 * at whatever P&L had accrued by then. For that case the leading gap is the
 * honest picture — the deal-returns panel below still shows the deals from that
 * period, and `plottedChartData` deliberately leaves it alone rather than
 * inventing months of flat equity. An UNTRIMMED series is a different story:
 * there the gap is a sampling artifact of at most a day or two, and it IS
 * filled — see `plottedChartData`.
 */
const RANGES = [
  { key: '1M', label: '1M', days: 30 },
  { key: '3M', label: '3M', days: 90 },
  { key: 'ALL', label: 'ALL', days: null },
] as const;

type RangeKey = (typeof RANGES)[number]['key'];

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
    Boolean(actualBotId) &&
    !hasFullChart(liveStats) &&
    !hasFullChart(listStats);
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

  // Default to ALL: the widest view is the one that answers "is this bot
  // actually up?", and it is the only one that shows a drawdown older than the
  // equity series' 90-day cap.
  const [range, setRange] = useState<RangeKey>('ALL');

  // Lower panel's series. Owned here, not by the panel, because the shared X
  // domain is the union of both series and the range filter applies to both.
  const { profitData, isLoading: dealsLoading } = useBotProfitChartData(
    actualBotId ?? '',
    botTypeEnum
  );

  // Generate chart data - use same data source as card for consistency.
  // Every source here is a `stats.chart` series, i.e. real currency. There is
  // deliberately NO fallback to `getBotProfitChartData`: that endpoint stores
  // a per-deal ROI *decimal fraction* (main-app dcaHelper.ts,
  // `value: perc = deal.profit.total / (usage * multiplier)`), not an amount,
  // so plotting it as equity/realized profit rendered a 1% deal as "$0.01".
  // That series is already shown correctly, as a percentage, by the sibling
  // "Deal Returns" widget (DrawerPnLScatterChart) directly below this one.
  const {
    points: chartData,
    startBalanceUsd,
    isTrimmed,
  } = useMemo(() => {
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
    //
    // Prefer a source that carries all three series; only fall back to an
    // equity-only one (the list slice, while the by-id fetch is still in
    // flight or if it came back empty) so the equity area keeps rendering
    // instead of blanking the panel.
    const sources = [
      liveStats,
      listStats,
      (fetchedBot as DCABot | undefined)?.stats,
    ];
    const stats = sources.find(hasFullChart) ?? sources.find(hasChart);

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

        // A series the payload does not carry stays `undefined`, NOT 0:
        // recharts then draws nothing for it and leaves it out of the axis
        // domain, whereas a 0 is indistinguishable from a real break-even
        // value — it plots a false flat line and pins the shared equity axis
        // to zero.
        return {
          equity: typeof point.equity === 'number' ? point.equity : undefined,
          realizedProfit:
            typeof point.realizedProfit === 'number'
              ? point.realizedProfit - realizedOffset
              : undefined,
          buyAndHold:
            typeof point.buyAndHold === 'number' ? point.buyAndHold : undefined,
          time: timeValue,
          formattedTime: new Date(timeValue).toLocaleDateString(),
        };
      })
      .filter((p: { time: number }) => Number.isFinite(p.time))
      // The backend builds stats.chart via filter/push churn (and trims by
      // insertion order, not time), so points arrive unsorted. Without this
      // the lines zigzag and "Realized Profit" appears to fall over time.
      .sort((a: { time: number }, b: { time: number }) => a.time - b.time);

    return {
      points: sanitized,
      startBalanceUsd: realizedOffset,
      // At the cap the series MAY have been shifted, so its first point is not
      // provably the bot's first day. Anything below the cap was never trimmed.
      isTrimmed: (chartSource?.length ?? 0) >= CHART_POINT_CAP,
    };
  }, [listStats, initialChartData, liveStats, fetchedBot]);

  const isPositiveProfit = useMemo(() => {
    if (typeof liveStats?.numerical?.profit?.grossProfit === 'number') {
      return liveStats.numerical.profit.grossProfit >= 0;
    }
    return (bot?.profit?.totalUsd || 0) >= 0;
  }, [liveStats, bot]);

  const dealPoints = useMemo(
    () => buildDealReturnPoints(profitData),
    [profitData]
  );

  // Range filter, applied to both panels from one cutoff so they can never
  // disagree about what "3M" means.
  const cutoff = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)?.days ?? null;
    return days === null ? null : Date.now() - days * DAY_MS;
  }, [range]);

  const visibleChartData = useMemo(
    () => (cutoff === null ? chartData : chartData.filter((p) => p.time >= cutoff)),
    [chartData, cutoff]
  );
  const visibleDealPoints = useMemo(
    () => (cutoff === null ? dealPoints : dealPoints.filter((p) => p.x >= cutoff)),
    [dealPoints, cutoff]
  );

  /**
   * ONE domain for both panels — the union of what each has in range. The two
   * series come from different stores with different retention (90 daily
   * points on the bot doc vs. up to 500 closed deals in `botProfitChart`) AND
   * different sampling (the equity series is a once-daily MIDNIGHT snapshot,
   * deals are stamped at their exact close time), so the union is normally
   * wider than the equity series at BOTH ends.
   *
   * The dead space that left at each end was not "how far our history goes
   * back" — it is a sampling artifact, and it is what bug #540 reported. So
   * the union is NOT the thing to change here: `domain` stays
   * the union so the two stacked panels remain time-aligned (reading a deal
   * against the equity curve is the whole point of sharing an axis);
   * `plottedChartData` below closes the gap instead.
   */
  const domain = useMemo<[number, number] | null>(() => {
    const times = [
      ...visibleChartData.map((p) => p.time),
      ...visibleDealPoints.map((p) => p.x),
    ];
    if (!times.length) return null;
    const min = Math.min(...times);
    const max = Math.max(...times);
    // A single point (or all points on one day) would give a zero-width
    // domain, which recharts renders as an empty plot.
    return min === max ? [min - DAY_MS, max + DAY_MS] : [min, max];
  }, [visibleChartData, visibleDealPoints]);

  /**
   * The series actually handed to recharts: `visibleChartData` carried out to
   * the shared domain's edges so the Performance panel spans the same width as
   * the Deal Returns panel below it (bug #540 — "space on either side of the
   * trend data").
   *
   * This adds NO new domain: both endpoints land exactly on `domain`, so the
   * lower panel's axis is untouched. Only two edges are synthesized, and only
   * where the value is knowable:
   *
   * • TRAILING — carry the last measured sample forward. The gap here is
   *   bounded by the daily cadence (the newest point is the midnight of the
   *   last day that had a deal, so at most ~48h back), and a flat carry is the
   *   conservative reading: it asserts no NEW information, not a new value.
   *
   * • LEADING — seed the bot's initial condition. At inception equity and
   *   buy & hold are the starting balance and realized profit is 0, which is
   *   exactly what main-app itself pushes as the first point
   *   (`dcaHelper.ts`: equity/buyAndHold/realizedProfit = startBalance.usd,
   *   which is also the offset already subtracted out above). Gated on
   *   `!isTrimmed` — on a trimmed series the first point is mid-history and
   *   the deal scatter can reach ~12 months further back, so seeding there
   *   would draw months of flat equity that never happened. That gap stays.
   *
   * Fields absent from the payload stay `undefined` rather than becoming 0,
   * for the same reason as in `chartData`: a 0 plots a false flat line and
   * drags the shared equity axis to zero.
   */
  const plottedChartData = useMemo(() => {
    if (!domain || visibleChartData.length === 0) return visibleChartData;
    const [domainMin, domainMax] = domain;
    const padded = [...visibleChartData];

    const last = padded[padded.length - 1];
    if (last.time < domainMax) {
      padded.push({
        ...last,
        time: domainMax,
        formattedTime: new Date(domainMax).toLocaleDateString(),
      });
    }

    const first = padded[0];
    if (first.time > domainMin && !isTrimmed && startBalanceUsd > 0) {
      padded.unshift({
        equity: typeof first.equity === 'number' ? startBalanceUsd : undefined,
        realizedProfit:
          typeof first.realizedProfit === 'number' ? 0 : undefined,
        buyAndHold:
          typeof first.buyAndHold === 'number' ? startBalanceUsd : undefined,
        time: domainMin,
        formattedTime: new Date(domainMin).toLocaleDateString(),
      });
    }

    return padded;
  }, [visibleChartData, domain, isTrimmed, startBalanceUsd]);

  const hasRealData = visibleChartData.length > 0;
  const hasAnyData = hasRealData || visibleDealPoints.length > 0;

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
      title="Performance"
      icon={TrendingUp}
      minSize={{ w: 6, h: 8 }}
      maxSize={{ w: 12, h: 16 }}
      hasOptions={false}
      headerActions={
        hasAnyData && (
          <div className="flex flex-wrap items-center gap-sm">
            <div className="flex items-center gap-xs rounded-lg bg-inner-container p-1">
              {RANGES.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setRange(key)}
                  aria-pressed={range === key}
                  className={cn(
                    'inline-flex items-center justify-center rounded-md border border-transparent px-2.5 py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-0!',
                    range === key
                      ? 'bg-background text-foreground border-border shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
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
          </div>
        )
      }
    >
      <div className="p-md">
        {!hasAnyData && (
          <div className="mb-3 w-full rounded-md bg-muted/40 px-2 py-1 text-xs text-muted-foreground sm:w-auto sm:text-right">
            No data
          </div>
        )}

        <div className="h-48 w-full">
          {hasRealData && domain ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={plottedChartData}
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
                {/* Numeric time axis, NOT the old categorical `formattedTime`:
                    a category axis spaces points evenly regardless of date, so
                    it can neither align with the deal-returns panel below nor
                    leave a gap where the daily series has no history. Ticks are
                    hidden here — the lower panel carries the shared labels. */}
                <XAxis
                  type="number"
                  dataKey="time"
                  scale="time"
                  domain={domain}
                  tick={false}
                  tickLine={false}
                  axisLine={{ stroke: '#6b7280' }}
                  height={1}
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
                      labelFormatter={(value) =>
                        new Date(value as number).toLocaleDateString()
                      }
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

        {/* Lower panel: per-deal returns, same X domain as above. Kept as a
            separate plot rather than a fourth series because it is a
            percentage — folding it in would need a third Y axis. Stacked
            panels give the alignment without the axis. */}
        {/* Numeric spacing, not the `-md`/`-lg` design tokens: index.css only
            hand-writes the all-sides and x/y token utilities, so single-side
            ``/`` silently resolve to 0. */}
        <div className="mt-6">
          <div className="mb-3 text-xs font-medium text-muted-foreground">
            Deal Returns
          </div>
          {domain ? (
            <DealReturnsPanel
              points={visibleDealPoints}
              domain={domain}
              isLoading={dealsLoading}
            />
          ) : (
            <div className="flex h-32 items-center justify-center">
              <p className="text-xs text-muted-foreground">
                No deal return data available
              </p>
            </div>
          )}
        </div>
      </div>
    </DrawerSection>
  );
};

export default DrawerPerformanceChart;
