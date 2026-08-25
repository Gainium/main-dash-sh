import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Ref,
  /*  type ReactElement, */
} from 'react';

import type { PanelMenuConfig } from '@/components/bots/panels/PanelContainer';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useChartColors } from '@/hooks/useChartColors';
import {
  useUnfoldingChartData,
  type DealMarker,
  type UseUnfoldingChartDataOptions,
} from '@/hooks/useUnfoldingChartData';
import { cn, formatCurrency } from '@/lib/utils';
import type { DrawerBot } from '@/types/bots/drawer';
import type { SanitizedChartPoint, TimeframeKey } from '@/utils/chartData';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  /*   Scatter, */
  XAxis,
  YAxis,
} from 'recharts';

import TradingViewChart, {
  type TradingViewChartRef,
} from '@/components/widgets/shared/TradingViewChart/TradingViewChart';
import { exampleOrdersStore } from '@/utils/bots/dca/example-orders';
import {
  ExchangeIntervals,
  timeIntervalMap,
  tvIntervalMap,
  type AvgPrice,
  type ChartIndicatorConfig,
  type ChartOrderLine,
  type DCABotSettings,
  type DCAGrid,
  type TransactionChart,
} from '@/types';
import { indicatorStore } from '@/stores/indicatorStore';

export interface UnfoldingChartPanelProps {
  botId?: string;
  bot?: DrawerBot | null;
  defaultTimeframe?: TimeframeKey;
  enabled?: boolean;
  className?: string;
  onTimeframeChange?: (timeframe: TimeframeKey) => void;
  onPanelMenuChange?: (menu: PanelMenuConfig | null) => void;
  overrideSymbol?: string | null;
  overrideExchange?: string | null;
  /**
   * Handle on the underlying TradingView widget. The bot drawer needs it to
   * mount a `TVChartPicker` over this chart so the TP/SL bullseyes in the Edit
   * Deal form can resolve a click to a price. Only set when the market chart
   * (not the equity/recharts fallback) is what's rendered.
   */
  chartRef?: Ref<TradingViewChartRef>;
}

const DEFAULT_TIMEFRAME: TimeframeKey = 'all';

const TIMEFRAME_OPTIONS: Array<{ value: TimeframeKey; label: string }> = [
  { value: '1d', label: '1D' },
  { value: '3d', label: '3D' },
  { value: '1w', label: '1W' },
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '1y', label: '1Y' },
  { value: 'all', label: 'ALL' },
];

const TIMEFRAME_VALUES = TIMEFRAME_OPTIONS.map(
  (option) => option.value
) as TimeframeKey[];

const isPersistedTimeframe = (value: string | null): value is TimeframeKey =>
  typeof value === 'string' && TIMEFRAME_VALUES.includes(value as TimeframeKey);

const readPersistedTimeframe = (key: string): TimeframeKey | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(key);
    return isPersistedTimeframe(stored) ? stored : null;
  } catch {
    return null;
  }
};

const writePersistedTimeframe = (key: string, value: TimeframeKey) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures (quota, privacy mode, etc.).
  }
};

const TIMEFRAME_STORAGE_PREFIX = 'gainium:unfoldingChart:timeframe';

const getTimeframeStorageKey = (identifier: string | null) =>
  `${TIMEFRAME_STORAGE_PREFIX}:${identifier ?? 'global'}`;

interface MarkerDatum extends DealMarker {
  x: number;
  y: number;
  type: 'marker';
  fillColor: string;
  profitLabel?: string;
}

interface ChartTooltipEntry {
  color?: string;
  dataKey?: string | number;
  value?: number | string;
  payload?: (SanitizedChartPoint & { type?: string }) | MarkerDatum;
}

interface ChartTooltipContext {
  active?: boolean;
  payload?: ReadonlyArray<ChartTooltipEntry>;
}

type SeriesKey = 'equity' | 'buyAndHold' | 'realizedProfit';

const UnfoldingChartPanel = ({
  botId,
  bot,
  defaultTimeframe = DEFAULT_TIMEFRAME,
  enabled = true,
  className,
  onTimeframeChange,
  onPanelMenuChange,
  overrideSymbol,
  overrideExchange,
  chartRef,
}: UnfoldingChartPanelProps) => {
  const resolvedBotIdentifier = botId ?? bot?.id ?? null;
  const persistenceKey = getTimeframeStorageKey(resolvedBotIdentifier);

  const [timeframe, setTimeframe] = useState<TimeframeKey>(() => {
    const stored = readPersistedTimeframe(persistenceKey);
    return stored ?? defaultTimeframe;
  });
  const [seriesVisibility] = useState<Record<SeriesKey, boolean>>({
    equity: true,
    buyAndHold: true,
    realizedProfit: true,
  });
  /* const [selectedMarker, setSelectedMarker] = useState<MarkerDatum | null>(
    null
  ); */
  const colors = useChartColors();

  useEffect(() => {
    const stored = readPersistedTimeframe(persistenceKey);
    const nextTimeframe = stored ?? defaultTimeframe;

    let didChange = false;
    setTimeframe((current) => {
      if (current === nextTimeframe) {
        return current;
      }
      didChange = true;
      return nextTimeframe;
    });

    if (didChange) {
      onTimeframeChange?.(nextTimeframe);
    }
  }, [defaultTimeframe, onTimeframeChange, persistenceKey]);

  useEffect(() => {
    writePersistedTimeframe(persistenceKey, timeframe);
  }, [persistenceKey, timeframe]);

  useEffect(() => {
    if (!onPanelMenuChange) {
      return;
    }

    onPanelMenuChange(null);

    return () => {
      onPanelMenuChange(null);
    };
  }, [onPanelMenuChange]);

  const canRequestData = useMemo(
    () => enabled && Boolean(botId ?? bot?.id),
    [bot?.id, botId, enabled]
  );

  const unfoldingChartOptions = useMemo(() => {
    const options: UseUnfoldingChartDataOptions = {
      timeframe,
      enabled: canRequestData,
      // The sidebar chart never renders backtest markers (they're commented
      // out downstream and `backtests` is not read from the hook result), so
      // skip the getBacktests request that would otherwise fire on open for
      // every bot sidebar / trade sidebar.
      includeBacktests: false,
    };

    if (botId) {
      options.botId = botId;
    }

    if (bot !== undefined) {
      options.bot = bot ?? null;
    }

    return options;
  }, [bot, botId, canRequestData, timeframe]);

  const unfoldingChart = useUnfoldingChartData(unfoldingChartOptions);

  const { chart, /* deals, */ status, isLoading, isError, error } =
    unfoldingChart;

  const latestPoint = useMemo(
    () =>
      chart.points.length > 0 ? chart.points[chart.points.length - 1] : null,
    [chart.points]
  );

  // Prefer full market chart (TradingView) like create/edit pages when symbol is available
  const marketChartSymbol = useMemo(() => {
    // bot.symbol can be Array<{key,value}> (multi-pair bot) — coerce safely
    // to the first pair's symbol string instead of letting String() join
    // produce "[object Object],[object Object],…".
    const symbolFallback = Array.isArray(bot?.symbol)
      ? (bot?.symbol as Array<{ value?: { symbol?: string } }>)[0]?.value
          ?.symbol
      : (bot?.symbol as unknown as string | undefined);
    const pair = overrideSymbol || bot?.pair || symbolFallback;
    // Fall back to the deal's own exchange when the parent bot isn't in the
    // live store — e.g. terminal deals, whose bots are loaded with
    // `terminal: false` on the Trading page and so never land in the DCA
    // bots store. Without this the price chart can't resolve a symbol and
    // the panel shows "No chart data is available for the selected timeframe".
    const exch = overrideExchange || bot?.exchange;
    if (pair && exch && exch !== 'Unknown') return `${pair}@${exch}`;
    return undefined;
  }, [overrideSymbol, overrideExchange, bot?.exchange, bot?.pair, bot?.symbol]);

  /* const handleMarkerClick = useCallback((data: unknown, _index?: number) => {
    const marker = (data as { payload?: MarkerDatum })?.payload;
    if (!marker) {
      return;
    }

    setSelectedMarker(marker);
  }, []); */

  const hasChartPoints = chart.points.length > 0;
  const hasEquitySeries = useMemo(
    () => chart.points.some((point) => typeof point.equity === 'number'),
    [chart.points]
  );
  const hasBuyAndHoldSeries = useMemo(
    () => chart.points.some((point) => typeof point.buyAndHold === 'number'),
    [chart.points]
  );
  const hasRealizedProfitSeries = useMemo(
    () =>
      chart.points.some((point) => typeof point.realizedProfit === 'number'),
    [chart.points]
  );

  const visibleValueSeries = useMemo(() => {
    const keys: Array<'equity' | 'buyAndHold'> = [];
    if (hasEquitySeries && seriesVisibility.equity) keys.push('equity');
    if (hasBuyAndHoldSeries && seriesVisibility.buyAndHold)
      keys.push('buyAndHold');

    return keys;
  }, [
    hasEquitySeries,
    hasBuyAndHoldSeries,
    seriesVisibility.equity,
    seriesVisibility.buyAndHold,
  ]);

  const primarySeriesKey = useMemo(
    () => visibleValueSeries[0],
    [visibleValueSeries]
  );

  const shouldShowEquitySeries = hasEquitySeries && seriesVisibility.equity;
  const shouldShowBuyAndHoldSeries =
    hasBuyAndHoldSeries && seriesVisibility.buyAndHold;
  const shouldShowRealizedProfitSeries =
    hasRealizedProfitSeries && seriesVisibility.realizedProfit;

  const chartId = useMemo(
    () => botId ?? bot?.id ?? 'unfolding-chart',
    [bot?.id, botId]
  );

  const formatTimeTick = useCallback(
    (value: number) => {
      const date = new Date(value);
      if (!Number.isFinite(date.getTime())) {
        return '';
      }

      if (timeframe === '1d' || timeframe === '3d') {
        return date.toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
        });
      }

      if (timeframe === '1w' || timeframe === '1m') {
        return date.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        });
      }

      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: timeframe === 'all' ? 'numeric' : undefined,
      });
    },
    [timeframe]
  );

  const primaryTickFormatter = useCallback(
    (value: number) => {
      const key =
        primarySeriesKey ??
        (shouldShowEquitySeries
          ? 'equity'
          : shouldShowBuyAndHoldSeries
            ? 'buyAndHold'
            : undefined);
      if (!key) {
        return '';
      }
      const decimals = value >= 1_000 ? 0 : 2;
      return formatCurrency(value, decimals);
    },
    [primarySeriesKey, shouldShowEquitySeries, shouldShowBuyAndHoldSeries]
  );

  const profitTickFormatter = useCallback(
    (value: number) => formatCurrency(value, 2),
    []
  );

  const tooltipDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    []
  );

  /* const markerPoints = useMemo(() => {
    if (
      !primarySeriesKey ||
      chart.points.length === 0 ||
      !deals?.markers?.length
    ) {
      return [] as MarkerDatum[];
    }

    const points: MarkerDatum[] = [];

    for (const marker of deals.markers) {
      if (!Number.isFinite(marker.time)) {
        continue;
      }

      let nearest: SanitizedChartPoint | undefined;
      let minDiff = Number.POSITIVE_INFINITY;

      for (const point of chart.points) {
        const diff = Math.abs(point.time - marker.time);
        if (diff < minDiff) {
          nearest = point;
          minDiff = diff;
        }

        if (point.time > marker.time && diff > minDiff) {
          break;
        }
      }

      if (!nearest) {
        continue;
      }

      const yCandidate = nearest[primarySeriesKey as keyof SanitizedChartPoint];
      if (typeof yCandidate !== 'number') {
        continue;
      }

      const fillColor =
        typeof marker.profitUsd === 'number'
          ? marker.profitUsd >= 0
            ? colors.success
            : colors.destructive
          : colors.chart3;

      const markerDatum: MarkerDatum = {
        ...marker,
        x: marker.time,
        y: yCandidate,
        type: 'marker',
        fillColor,
      };

      if (typeof marker.profitUsd === 'number') {
        markerDatum.profitLabel = formatCurrency(marker.profitUsd, 2);
      } else if (typeof marker.profitQuote === 'number') {
        markerDatum.profitLabel = `${marker.profitQuote.toFixed(2)} quote`;
      }

      points.push(markerDatum);
    }

    return points;
  }, [chart.points, colors, deals?.markers, primarySeriesKey]); */

  /* const shouldRenderMarkers =
    markerPoints.length > 0 && Boolean(primarySeriesKey); */

  /* useEffect(() => {
    if (!selectedMarker) {
      return;
    }

    const stillExists = markerPoints.some(
      (marker) =>
        marker.id === selectedMarker.id && marker.time === selectedMarker.time
    );

    if (!stillExists) {
      setSelectedMarker(null);
    }
  }, [markerPoints, selectedMarker]); */

  /*   const renderMarkerShape = useCallback((props: unknown): ReactElement => {
    const { cx, cy, payload } =
      (props as {
        cx?: number;
        cy?: number;
        payload?: MarkerDatum;
      }) ?? {};

    if (typeof cx !== 'number' || typeof cy !== 'number' || !payload) {
      return <g />;
    }

    return (
      <g>
        <circle cx={cx} cy={cy} r={6} fill={payload.fillColor} opacity={0.14} />
        <circle
          cx={cx}
          cy={cy}
          r={4}
          fill={payload.fillColor}
          stroke="rgba(15, 23, 42, 0.85)"
          strokeWidth={1}
        />
      </g>
    );
  }, []); */

  const tooltipRenderer = useCallback(
    (props: ChartTooltipContext) => {
      const { active, payload } = props as {
        active?: boolean;
        payload?: readonly ChartTooltipEntry[];
      };
      if (!active || !payload || payload.length === 0) {
        return null;
      }

      const referencePayload = payload[0]?.payload as
        | (SanitizedChartPoint & { type?: string })
        | MarkerDatum
        | undefined;

      const rawTimestamp =
        referencePayload?.time ??
        (referencePayload as MarkerDatum | undefined)?.x ??
        null;
      const timestamp =
        typeof rawTimestamp === 'number' ? rawTimestamp : Number(rawTimestamp);

      const heading =
        Number.isFinite(timestamp) && timestamp
          ? tooltipDateFormatter.format(new Date(timestamp))
          : undefined;

      const metricEntries: Array<{
        key: string;
        label: string;
        value: string;
        color?: string;
      }> = [];
      const markerEntries: MarkerDatum[] = [];

      for (const entry of payload) {
        const base = entry.payload as
          | (SanitizedChartPoint & { type?: string })
          | MarkerDatum;
        if (base?.type === 'marker') {
          markerEntries.push(base as MarkerDatum);
          continue;
        }

        const numericValue =
          typeof entry.value === 'number' ? entry.value : Number(entry.value);
        if (!Number.isFinite(numericValue)) {
          continue;
        }

        const key = entry.dataKey?.toString() ?? 'value';
        const labelMap: Record<string, string> = {
          price: 'Price',
          equity: 'Equity',
          buyAndHold: 'Buy & Hold',
          realizedProfit: 'Realized Profit',
        };

        const decimals =
          key === 'realizedProfit'
            ? 2
            : key === 'price'
              ? 2
              : numericValue >= 1_000
                ? 0
                : 2;

        metricEntries.push({
          key,
          label: labelMap[key] ?? key,
          value: formatCurrency(numericValue, decimals),
          ...(entry.color ? { color: entry.color } : {}),
        });
      }

      if (!metricEntries.length && !markerEntries.length) {
        return null;
      }

      return (
        <div className="min-w-[180px] rounded-lg border border-border bg-card/95 p-sm shadow-lg">
          {heading ? (
            <div className="mb-2 text-xs font-medium text-muted-foreground">
              {heading}
            </div>
          ) : null}
          {metricEntries.map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between gap-lg text-sm"
            >
              <span className="text-muted-foreground">{item.label}</span>
              <span className="font-medium" style={{ color: item.color }}>
                {item.value}
              </span>
            </div>
          ))}
          {markerEntries.length > 0 ? (
            <div
              className={cn(
                'mt-2 space-y-1 border-t border-border/60 pt-2 text-xs'
              )}
            >
              {markerEntries.map((marker) => (
                <div
                  key={`${marker.id}-${marker.time}`}
                  className="flex flex-col gap-0.5"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="font-medium"
                      style={{ color: marker.fillColor }}
                    >
                      {marker.status ?? 'Deal'}
                    </span>
                    {marker.profitLabel ? (
                      <span>{marker.profitLabel}</span>
                    ) : null}
                  </div>
                  {marker.paperContext ? (
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      Paper
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      );
    },
    [tooltipDateFormatter]
  );

  const idleState = status === 'idle';
  const errorMessage = error ?? (isError ? 'Unable to load chart data.' : null);
  const [exampleOrders, setExampleOrders] = useState<DCAGrid[]>([]);
  const [transactions, setTransactions] = useState<TransactionChart[]>([]);
  const [avgPrices, setAvgPrices] = useState<AvgPrice[]>([]);
  const [indicators, setIndicators] = useState<ChartIndicatorConfig[]>([]);
  const getIndicatorInterval = useCallback((): string => {
    const indicators = (bot?.settings as DCABotSettings)?.indicators;
    if (!indicators?.length) return '60';
    const int =
      [...indicators].sort(
        (a, b) =>
          timeIntervalMap[a.indicatorInterval] -
          timeIntervalMap[b.indicatorInterval]
      )[0]?.indicatorInterval || ExchangeIntervals.oneH;
    return tvIntervalMap[int];
  }, [bot?.settings]);

  const [interval, setInterval] = useState(() => getIndicatorInterval());
  const [manuallyChanged, setManuallyChanged] = useState(false);
  const handleIntervalChange = useCallback((int: string) => {
    setInterval(int);
    setManuallyChanged(true);
  }, []);

  useEffect(() => {
    const unsubscribe = exampleOrdersStore.subscribe(
      (incomingOrders, incomingTransactions, incomingAvgPrices) => {
        setExampleOrders(incomingOrders);
        setTransactions(incomingTransactions);
        setAvgPrices(incomingAvgPrices);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = indicatorStore.subscribe((incomingIndicators) => {
      setIndicators(incomingIndicators);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (manuallyChanged) return;
    const computed = getIndicatorInterval();
    setInterval(computed);
  }, [manuallyChanged, getIndicatorInterval]);

  const orders: ChartOrderLine[] = useMemo(
    () =>
      exampleOrders.map((o) => ({
        ...o,
        side: o.side.toLowerCase(),
        label: o.label || o.type,
        // Projected (not-yet-placed) levels have to carry `greyLabel` + a grey
        // colour through, or `orderLines.ts` can't tell them apart from real
        // resting orders and drops their label. Mirrors BotChart's mapping.
        greyLabel: o.grey ? (o.greyLabel ?? 'Smart order') : undefined,
        isDraggable: o.grey ? false : !!o.draggable,
        ...(o.grey ? { color: '#94a3b8' } : {}),
      })),
    [exampleOrders]
  );

  useEffect(() => {
    indicatorStore.setChartIndicatorsContext({
      chartInterval: interval,
    });
  }, [interval]);
  return (
    <div className={cn('flex h-full flex-col', className)}>
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : idleState ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
            Select a bot to begin streaming unfolding chart data.
          </div>
        ) : isError ? (
          <Alert variant="destructive" className="m-0 border-0 rounded-none">
            <AlertTitle>Unable to load data</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : marketChartSymbol ? (
          <div className="flex h-full flex-col">
            <div className="h-full flex-1">
              <TradingViewChart
                ref={chartRef}
                symbol={marketChartSymbol}
                interval={interval}
                onIntervalChange={handleIntervalChange}
                enableAutoSave={true}
                enableLoadLastChart={true}
                enableSeparateDrawingsStorage={true}
                widgetId={`drawer-market-chart-${chartId}`}
                orders={orders}
                transactions={transactions}
                avgPrice={avgPrices}
                indicators={indicators}
              />
            </div>
          </div>
        ) : hasChartPoints ? (
          shouldShowEquitySeries ||
          shouldShowRealizedProfitSeries ||
          shouldShowBuyAndHoldSeries ? (
            <div className="flex h-full flex-col">
              <div className="h-full flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chart.points}
                    margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                  >
                    <defs>
                      {hasEquitySeries ? (
                        <linearGradient
                          id={`unfolding-${chartId}-equity`}
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor={colors.primary}
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor={colors.primary}
                            stopOpacity={0}
                          />
                        </linearGradient>
                      ) : null}
                      {hasBuyAndHoldSeries ? (
                        <linearGradient
                          id={`unfolding-${chartId}-buyAndHold`}
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#6b7280"
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor="#6b7280"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      ) : null}
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#374151"
                      opacity={0.03}
                      vertical={false}
                      horizontal={true}
                    />
                    <XAxis
                      dataKey="time"
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      tickFormatter={formatTimeTick}
                      tick={{ fontSize: 8, fill: '#6b7280' }}
                      tickLine={{ stroke: '#6b7280' }}
                      axisLine={{ stroke: '#6b7280' }}
                      minTickGap={28}
                    />
                    {shouldShowEquitySeries || shouldShowBuyAndHoldSeries ? (
                      <YAxis
                        yAxisId="equity"
                        domain={['auto', 'auto']}
                        tick={{ fontSize: 8, fill: '#6b7280' }}
                        tickLine={{ stroke: '#6b7280' }}
                        axisLine={{ stroke: '#6b7280' }}
                        tickFormatter={primaryTickFormatter}
                        width={25}
                      />
                    ) : null}
                    {shouldShowRealizedProfitSeries ? (
                      <YAxis
                        yAxisId="profit"
                        orientation="right"
                        domain={['auto', 'auto']}
                        tick={false}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={profitTickFormatter}
                        width={15}
                      />
                    ) : null}
                    <RechartsTooltip
                      content={tooltipRenderer}
                      cursor={{
                        stroke: colors.chart3,
                        strokeWidth: 1,
                        opacity: 0.1,
                      }}
                    />
                    {shouldShowEquitySeries ? (
                      <Area
                        yAxisId="equity"
                        type="monotone"
                        dataKey="equity"
                        stroke={colors.primary}
                        strokeWidth={2}
                        fill={`url(#unfolding-${chartId}-equity)`}
                        fillOpacity={0.3}
                        name="Equity"
                        isAnimationActive={false}
                      />
                    ) : null}
                    {shouldShowBuyAndHoldSeries ? (
                      <Area
                        yAxisId="equity"
                        type="monotone"
                        dataKey="buyAndHold"
                        stroke="#6b7280"
                        strokeWidth={2}
                        fill={`url(#unfolding-${chartId}-buyAndHold)`}
                        fillOpacity={0.3}
                        name="Buy & Hold"
                        isAnimationActive={false}
                      />
                    ) : null}
                    {shouldShowRealizedProfitSeries ? (
                      <Line
                        yAxisId="profit"
                        type="monotone"
                        dataKey="realizedProfit"
                        stroke={
                          latestPoint &&
                          typeof latestPoint.realizedProfit === 'number' &&
                          latestPoint.realizedProfit >= 0
                            ? colors.success
                            : colors.destructive
                        }
                        strokeWidth={2}
                        dot={false}
                        name="Realized Profit"
                        isAnimationActive={false}
                      />
                    ) : null}
                    {/* {shouldRenderMarkers ? (
                      <Scatter
                        yAxisId="equity"
                        data={markerPoints}
                        name="Deals"
                        shape={renderMarkerShape}
                        isAnimationActive={false}
                        onClick={handleMarkerClick}
                      />
                    ) : null} */}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
              Enable at least one series to visualize the unfolding chart data.
            </div>
          )
        ) : (
          <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
            No chart data is available for the selected timeframe.
          </div>
        )}
      </div>
    </div>
  );
};

UnfoldingChartPanel.displayName = 'UnfoldingChartPanel';

export default UnfoldingChartPanel;
