/* eslint-disable @typescript-eslint/no-explicit-any */
import { Button } from '@/components/ui/button';
import { useTradingViewAutoSave } from '@/hooks/useTradingViewAutoSave';
import { logger } from '@/lib/loggerInstance';
import { getCSSVar } from '@/lib/utils/chart';
import {
  BotOrderSideEnum,
  type AvgPrice,
  type ChartIndicatorsConfig,
  type ChartOrderDrawing,
  type ChartOrderLine,
  type IndicatorsEvents,
  type PositionChart,
} from '@/types';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { addTradingViewIndicator, clearCustomIndicators } from './indicators';
import { createOrderLine } from './orderLines';
import {
  addTransactionInternal,
  clearTransactionsInternal,
  normalizeTimeToSeconds,
} from './transactions';
import type {
  ChartInstance,
  OrderLineInstance,
  TradingViewChartCoreProps,
  TradingViewChartCoreRef,
  TradingViewDropdownHandle,
  TradingViewToolbarDropdownConfig,
  TradingViewWidgetInstance,
  TransactionExtended,
} from './types';
import { useInitializeWidget } from './useInitializeWidget';

interface BasicChartAPI {
  setResolution?: (interval: string) => void;
  resolution?: () => string;
  setVisibleRange?: (range: { from: number; to: number }) => void;
  scrollToTime?: (
    time: number,
    animate?: boolean,
    rightAlign?: boolean
  ) => void;
  // TradingView's IChartWidgetApi.setSymbol: the resolution is not an
  // argument, and "loaded" is reported through `options.dataReady`.
  setSymbol?: (symbol: string, options?: { dataReady?: () => void }) => void;
}

interface ExtendedWidget extends TradingViewWidgetInstance {
  chart?: () => BasicChartAPI;
  activeChart?: () => BasicChartAPI;
  setSymbol?: (symbol: string, cb?: () => void) => void;
}

const INTERVAL_SECONDS: Record<string, number> = {
  '1': 60,
  '3': 180,
  '5': 300,
  '15': 900,
  '30': 1800,
  '45': 2700,
  '60': 3600,
  '120': 7200,
  '240': 14400,
  '360': 21600,
  '480': 28800,
  '720': 43200,
  '1D': 86400,
  '1W': 604800,
  '1M': 2592000,
};

const intervalToSeconds = (interval?: string): number => {
  if (!interval) return INTERVAL_SECONDS['60'];
  const normalized = interval.toUpperCase();
  return INTERVAL_SECONDS[normalized] ?? INTERVAL_SECONDS['60'];
};

const getLineColorForSide = (side: string) => {
  const normalized = side?.toUpperCase?.() ?? '';
  if (normalized === 'BUY' || normalized === 'LONG') {
    return getCSSVar('--color-profit', '#22c55e');
  }
  if (normalized === 'GREY' || normalized === 'NEUTRAL') {
    return getCSSVar('--color-muted-foreground', '#94a3b8');
  }
  return getCSSVar('--color-loss', '#ef4444');
};

const adjustPriceForSignal = (price: number | string, side: string) => {
  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice)) {
    return numericPrice;
  }
  const multiplier = side?.toUpperCase?.() === 'BUY' ? 0.998 : 1.002;
  return numericPrice * multiplier;
};

type OverlayKind =
  | 'orderLines'
  | 'orderDrawings'
  | 'pastEntries'
  | 'avgPrice'
  | 'transactions'
  | 'position';

/** Draw order: faint history first, live lines and markers on top. */
const ALL_OVERLAYS: readonly OverlayKind[] = [
  'orderDrawings',
  'pastEntries',
  'transactions',
  'avgPrice',
  'orderLines',
  'position',
];

/** Overlays that only plot what is inside the visible time range. */
const RANGE_FILTERED_OVERLAYS: readonly OverlayKind[] = [
  'orderDrawings',
  'pastEntries',
  'transactions',
];

const OVERLAY_RETRY_BASE_DELAY_MS = 100;
const OVERLAY_RETRY_MAX_DELAY_MS = 2000;
const OVERLAY_RETRY_MAX_ATTEMPTS = 30;
/** Give up waiting for a load's completion signal and draw anyway. */
const PENDING_LOAD_TIMEOUT_MS = 15000;

interface TradingViewSubscription {
  subscribe?: (context: null, callback: () => void) => void;
  unsubscribe?: (context: null, callback: () => void) => void;
}

type OverlayChart = ChartInstance & {
  createMultipointShape?: (
    points: Array<{ time: number; price: number }>,
    options: Record<string, unknown>
  ) => unknown;
  createOrderLine?: () => OrderLineInstance;
  createShape?: (
    point: { time: number; price: number },
    options: Record<string, unknown>
  ) => unknown;
  removeEntity?: (entity: unknown) => void;
  dataReady?: (callback: () => void) => boolean | undefined;
  onDataLoaded?: () => TradingViewSubscription;
  getVisibleRange?: () => { from: number; to: number } | null;
  getVisiblePriceRange?: () => { from?: number; to?: number } | null;
  setSymbol?: (symbol: string, options?: { dataReady?: () => void }) => void;
  symbol?: () => string;
  resolution?: () => string;
};

const normalizeSymbolId = (symbol?: string | null): string =>
  (symbol ?? '').replace(/:/g, '_').toLowerCase();

const chartDataKey = (chart: OverlayChart): string => {
  try {
    return `${normalizeSymbolId(chart.symbol?.())}|${chart.resolution?.() ?? ''}`;
  } catch {
    return '';
  }
};

/**
 * Whether the chart can hold overlays right now. Before the main series has a
 * price scale, `createOrderLine` and the transaction markers refuse to draw
 * (TradingView throws "Value is null" otherwise).
 */
const canDrawOverlays = (chart: OverlayChart): boolean => {
  if (typeof chart.getVisiblePriceRange !== 'function') return true;
  try {
    const range = chart.getVisiblePriceRange();
    return range?.from != null && range?.to != null;
  } catch {
    return false;
  }
};

export const TradingViewChartCore = forwardRef<
  TradingViewChartCoreRef,
  TradingViewChartCoreProps
>(
  (
    {
      initialSymbol = 'BTCUSDT',
      initialInterval = '60',
      onChartReady,
      onVisibleRange,
      onSymbolChange,
      onIntervalChange,
      // New config flags forwarded to initialization hook
      enableAutoSave = true,
      enableLoadLastChart = true,
      enableSeparateDrawingsStorage = true,
      initialLayoutId = null,
      initialLayoutName = null,
      layoutPersistenceKey,
      onLayoutChange,
      toolbarDropdown,
      initialTimeframe,
      indicatorValueCallback,
      datafeed,
    },
    ref
  ) => {
    const chartContainerRef = useRef<HTMLDivElement | null>(null);
    // Order lines added one by one through `addOrderLine` (manual
    // backtesting). The declarative `updateOrderLines` set lives in
    // `managedOrderLinesRef` and is owned by the overlay scheduler.
    const orderLinesRef = useRef<Map<string, OrderLineInstance>>(new Map());
    const managedOrderLinesRef = useRef<Map<string, OrderLineInstance>>(
      new Map()
    );
    // Store transaction entity arrays (each may be single or multiple shapes)
    const transactionEntitiesRef = useRef<Map<string, unknown>>(new Map());
    const orderDrawingEntitiesRef = useRef<Map<string, unknown>>(new Map());
    const pastEntryEntitiesRef = useRef<Map<string, unknown>>(new Map());
    const avgPriceLineEntitiesRef = useRef<Map<string, OrderLineInstance>>(
      new Map()
    );
    const visibleRangeRef = useRef<{ from: number; to: number } | null>(null);
    // What each overlay SHOULD show. The chart itself is only ever a
    // projection of these caches — see `flushOverlays`.
    const orderLinesCacheRef = useRef<ChartOrderLine[]>([]);
    const orderDrawingsCacheRef = useRef<ChartOrderDrawing[]>([]);
    const pastEntriesCacheRef = useRef<IndicatorsEvents[]>([]);
    const transactionsCacheRef = useRef<TransactionExtended[]>([]);
    const avgPriceCacheRef = useRef<AvgPrice[]>([]);
    const positionCacheRef = useRef<{
      position: PositionChart;
      precision: number | undefined;
      serialized: string;
    } | null>(null);
    const positionEntityRef = useRef<unknown | null>(null);
    const currentIntervalRef = useRef<string>(initialInterval);
    const toolbarDropdownHandleRef = useRef<TradingViewDropdownHandle | null>(
      null
    );
    const toolbarDropdownSignatureRef = useRef<string | null>(null);
    /** Serializes toolbar-dropdown attach/detach so they can't interleave. */
    const toolbarDropdownQueueRef = useRef<Promise<void>>(Promise.resolve());
    const visibleRangeCallbackRef = useRef<
      (range?: { from: number; to: number } | null) => void
    >(() => undefined);
    const intervalChangeCallbackRef = useRef<(interval: string) => void>(
      () => undefined
    );
    const layoutChangeCallbackRef = useRef<
      (layout: { id: string; name?: string | null } | null) => void
    >(() => undefined);

    // Overlay scheduler state. Every overlay kind is "dirty" until it has been
    // drawn on a chart that could actually take it; `flushOverlays` retries
    // until that happens.
    const chartReadyRef = useRef(false);
    const dirtyOverlaysRef = useRef<Set<OverlayKind>>(new Set(ALL_OVERLAYS));
    // Set while the chart is loading a symbol / resolution / layout. Shapes
    // created then are dropped by TradingView, so drawing waits for the load.
    const pendingLoadSinceRef = useRef<number | null>(null);
    const pendingLoadTokenRef = useRef(0);
    // symbol + resolution when the pending load began: a data-loaded event
    // for that same key is a late page of the OLD data, not the new load.
    const pendingLoadFromKeyRef = useRef<string | null>(null);
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const retryAttemptsRef = useRef(0);
    // symbol + resolution the overlays were last drawn for.
    const drawnForKeyRef = useRef<string | null>(null);
    const flushOverlaysRef = useRef<() => void>(() => undefined);

    const proxyVisibleRange = useCallback(
      (range?: { from: number; to: number }) =>
        visibleRangeCallbackRef.current(range ?? null),
      []
    );

    const proxyIntervalChange = useCallback(
      (interval: string) => intervalChangeCallbackRef.current(interval),
      []
    );

    const proxyLayoutChange = useCallback(
      (layout: { id: string; name?: string | null } | null) =>
        layoutChangeCallbackRef.current(layout),
      []
    );

    const { widgetRef, isLoading, error, isChartReady, stalled, retry } =
      useInitializeWidget({
        initialSymbol,
        initialInterval,
        ...(indicatorValueCallback ? { indicatorValueCallback } : {}),
        ...(datafeed ? { datafeed } : {}),
        // cast because hook expects non-nullable but ref is filled after mount
        containerRef:
          chartContainerRef as unknown as React.RefObject<HTMLDivElement>,
        onChartReady,
        onVisibleRange: proxyVisibleRange,
        onSymbolChange,
        onIntervalChange: proxyIntervalChange,
        enableAutoSave,
        enableLoadLastChart,
        enableSeparateDrawingsStorage,
        initialLayoutId,
        initialLayoutName,
        initialTimeframe,
        ...(layoutPersistenceKey ? { layoutPersistenceKey } : {}),
        onLayoutChange: proxyLayoutChange,
      });

    useTradingViewAutoSave(
      widgetRef.current,
      isChartReady,
      initialSymbol,
      initialInterval
    );

    const getActiveChart = useCallback(() => {
      const widget = widgetRef.current as ExtendedWidget | null;
      if (!widget) return null;

      // Optional chaining only guards the accessor *existing* — it does not
      // guard it throwing. Both `activeChart()` and `chart()` funnel through the
      // vendor's `_innerAPI()` → `_innerWindow().tradingViewApi` →
      // `_iFrame.contentWindow`. Once the chart iframe is detached (chart
      // re-created on a pair/interval change, or navigated away mid-update)
      // `contentWindow` is null and the vendor throws "Cannot read properties of
      // null (reading 'tradingViewApi')"; before the iframe finishes booting
      // `tradingViewApi` is undefined and it throws on `.activeChart` instead.
      // `widgetRef.current` stays truthy through both, so the callers'
      // `widgetRef.current && isChartReady` guards cannot detect it — the throw
      // escaped the passive effect behind `renderAvgPriceLines` and tripped
      // AppErrorBoundary on /grid/edit. Treat "chart unreachable" as "no chart".
      let chartCandidate: unknown;
      try {
        chartCandidate =
          typeof widget.activeChart === 'function'
            ? widget.activeChart?.()
            : widget.chart?.();
      } catch (error) {
        logger.debug('Chart API unreachable (widget torn down)', error);
        return null;
      }

      if (!chartCandidate) {
        return null;
      }

      return chartCandidate as OverlayChart;
    }, [widgetRef]);

    const renderOrderLines = useCallback(
      (chart: OverlayChart) => {
        managedOrderLinesRef.current.forEach((line) => {
          try {
            line.remove?.();
          } catch (error) {
            logger.warn('Failed to remove order line', error);
          }
        });
        managedOrderLinesRef.current.clear();

        const widget = widgetRef.current;
        if (!widget) return;
        orderLinesCacheRef.current.forEach((order) => {
          createOrderLine(widget, order, (id, instance) =>
            managedOrderLinesRef.current.set(id, instance)
          );
        });
        void chart;
      },
      [widgetRef]
    );

    const renderOrderDrawings = useCallback((chart: OverlayChart) => {
      orderDrawingEntitiesRef.current.forEach((entity) => {
        try {
          chart.removeEntity?.(entity);
        } catch (error) {
          logger.warn('Failed to remove order drawing entity', error);
        }
      });
      orderDrawingEntitiesRef.current.clear();

      if (typeof chart.createMultipointShape !== 'function') {
        return;
      }

      const intervalMs = intervalToSeconds(currentIntervalRef.current) * 1000;
      const resolvedRange =
        visibleRangeRef.current ?? chart.getVisibleRange?.() ?? null;

      orderDrawingsCacheRef.current.forEach((order, index) => {
        if (!order) return;
        const startTimeMs = Number(order.startTime);
        const endTimeMs = Number(order.endTime);
        const priceValue = Number(order.price);
        if (
          !Number.isFinite(startTimeMs) ||
          !Number.isFinite(endTimeMs) ||
          !Number.isFinite(priceValue)
        ) {
          logger.warn('[OrderDrawings] Invalid order data', { order });
          return;
        }
        // Shorter than one bar: nothing to see at this resolution.
        if (Math.abs(endTimeMs - startTimeMs) < intervalMs) return;
        // Keep any segment that OVERLAPS the visible range, not only those
        // whose start is in view — otherwise a line vanishes as soon as its
        // start scrolls off the left edge even though it still crosses the
        // viewport.
        if (
          resolvedRange &&
          !(
            endTimeMs / 1000 > resolvedRange.from &&
            startTimeMs / 1000 < resolvedRange.to
          )
        ) {
          return;
        }

        try {
          const entity = chart.createMultipointShape?.(
            [
              { time: Math.round(startTimeMs / 1000), price: priceValue },
              { time: Math.round(endTimeMs / 1000), price: priceValue },
            ],
            {
              shape: 'trend_line',
              lock: true,
              disableSave: true,
              disableSelection: true,
              zOrder: order.side?.toUpperCase?.() === 'GREY' ? 'bottom' : 'top',
              overrides: {
                linecolor: getLineColorForSide(order.side),
                linewidth: 2,
              },
            }
          );
          if (entity) {
            orderDrawingEntitiesRef.current.set(
              `${startTimeMs}-${endTimeMs}-${priceValue}-${order.side}-${index}`,
              entity
            );
          }
        } catch (error) {
          logger.warn('Failed to render order drawing', { error, order });
        }
      });
    }, []);

    const renderPastEntries = useCallback((chart: OverlayChart) => {
      pastEntryEntitiesRef.current.forEach((entity) => {
        try {
          chart.removeEntity?.(entity);
        } catch (error) {
          logger.warn('Failed to remove past entry entity', error);
        }
      });
      pastEntryEntitiesRef.current.clear();

      if (typeof chart.createMultipointShape !== 'function') {
        return;
      }

      const intervalMs = Math.max(
        1,
        intervalToSeconds(currentIntervalRef.current) * 1000
      );
      const resolvedRange =
        visibleRangeRef.current ?? chart.getVisibleRange?.() ?? null;

      const grouped = new Map<
        string,
        IndicatorsEvents & {
          time: number;
          price: number;
        }
      >();

      pastEntriesCacheRef.current.forEach((entry) => {
        if (!entry) return;
        const entryTime = Number(entry.time);
        const entryPrice = Number(entry.price);
        if (!Number.isFinite(entryTime) || !Number.isFinite(entryPrice)) {
          return;
        }

        if (
          resolvedRange &&
          (entryTime < resolvedRange.from * 1000 ||
            entryTime > resolvedRange.to * 1000)
        ) {
          return;
        }

        const bucketBase = resolvedRange ? resolvedRange.from * 1000 : 0;
        const bucketIndex = Math.floor((entryTime - bucketBase) / intervalMs);
        const key = `${bucketIndex}-${entry.side}-${entry.type}`;
        grouped.set(key, { ...entry, time: entryTime, price: entryPrice });
      });

      Array.from(grouped.values()).forEach((entry, index) => {
        try {
          const entity = chart.createMultipointShape?.(
            [
              {
                time: Math.round(entry.time / 1000),
                price: adjustPriceForSignal(entry.price, entry.side),
              },
            ],
            {
              shape: 'icon',
              disableSave: true,
              disableSelection: true,
              lock: true,
              zOrder: 'top',
              overrides: {
                icon: entry.side === BotOrderSideEnum.buy ? '0xf176' : '0xf175',
                color: getLineColorForSide(entry.side),
                size: 20,
              },
            }
          );
          if (entity) {
            const key = `${entry.time}-${entry.side}-${entry.type}-${index}`;
            pastEntryEntitiesRef.current.set(key, entity);
          }
        } catch (error) {
          logger.warn('Failed to render past entry', error);
        }
      });
    }, []);

    const renderAvgPriceLines = useCallback((chart: OverlayChart) => {
      avgPriceLineEntitiesRef.current.forEach((line) => {
        try {
          line.remove?.();
        } catch (error) {
          logger.warn('Failed to remove average price line', error);
        }
      });
      avgPriceLineEntitiesRef.current.clear();

      // Theme-neutral grey for the breakeven / avg-price line.
      const lineColor = getCSSVar('--color-muted-foreground', '#94a3b8');
      const transparent = 'rgba(0, 0, 0, 0)';

      avgPriceCacheRef.current.forEach((avg, index) => {
        if (!avg) return;
        const price = Number(avg.price);
        if (!Number.isFinite(price) || price === 0) {
          return;
        }

        try {
          const orderLine = chart.createOrderLine?.() as
            | (OrderLineInstance & {
                setLineColor?: (c: string) => unknown;
                setLineWidth?: (w: number) => unknown;
                setLineStyle?: (s: number) => unknown;
              })
            | undefined;

          if (!orderLine) {
            return;
          }

          const label =
            typeof avg.label === 'string' && avg.label.trim().length > 0
              ? avg.label
              : 'Breakeven';

          orderLine.setText?.(label);
          orderLine.setPrice?.(price);
          // Methods must be called on the line instance — destructuring
          // detaches `this` and TradingView silently ignores the call,
          // leaving the line at its default blue.
          orderLine.setLineColor?.(lineColor);
          orderLine.setLineWidth?.(1);
          orderLine.setLineStyle?.(0);
          orderLine.setBodyTextColor?.(lineColor);
          orderLine.setBodyBorderColor?.(lineColor);
          orderLine.setBodyBackgroundColor?.(transparent);
          // The quantity chip on the right always renders even with an
          // empty value, so paint its background / text / border fully
          // transparent to hide it.
          orderLine.setQuantity?.('');
          orderLine.setQuantityBackgroundColor?.(transparent);
          orderLine.setQuantityBorderColor?.(transparent);
          orderLine.setQuantityTextColor?.(transparent);

          avgPriceLineEntitiesRef.current.set(
            `${avg.symbol ?? 'AVG'}-${price}-${index}`,
            orderLine
          );
        } catch (error) {
          logger.warn('Failed to render average price line', error);
        }
      });
    }, []);

    // Plot the transaction overlay, but only for trades whose time span overlaps
    // the currently visible range. On a high-frequency deal the full set can be
    // thousands of trades — each completed trade adds ~4-6 TradingView drawing
    // shapes, so plotting (and letting TradingView repaint) all of them froze the
    // chart on every pan and on every live deal update (bug #9).
    // This mirrors the visible-range filtering already used for order drawings and
    // past entries, and is re-run on pan/zoom so the off-screen trades are never
    // materialized as shapes.
    const renderTransactions = useCallback(
      (chart: OverlayChart) => {
        const widget = widgetRef.current as ExtendedWidget | null;
        // Remove the shapes plotted on the previous pass before re-filtering.
        clearTransactionsInternal(widget, true, transactionEntitiesRef.current);
        if (!widget) return;

        const resolvedRange =
          visibleRangeRef.current ?? chart.getVisibleRange?.() ?? null;

        const inRange = (tr: TransactionExtended): boolean => {
          if (!resolvedRange) return true;
          // Completed trades span [entryTime, exitTime] (ms) — keep any whose
          // span overlaps the viewport. Point transactions are keyed off `time`.
          if (
            tr.isCompletedTrade === true &&
            tr.entryTime != null &&
            tr.exitTime != null
          ) {
            const startSec = tr.entryTime / 1000;
            const endSec = tr.exitTime / 1000;
            return endSec >= resolvedRange.from && startSec <= resolvedRange.to;
          }
          const t = normalizeTimeToSeconds(Number(tr.time));
          return t >= resolvedRange.from && t <= resolvedRange.to;
        };

        const cache = transactionsCacheRef.current;
        let visible = resolvedRange ? cache.filter(inRange) : cache.slice();

        // Collapse to one marker per (side, price level, bar) — the legacy
        // main-dash rule (TVChartContainer.addTransactions keyed by bar-index +
        // side + price). A tight grid re-fills the SAME level within a single
        // candle (partial fills, price wobbling back through it); those are
        // visually identical and pure redundant shapes, so we keep one. But
        // every DISTINCT level, and every distinct BAR a level trades in, keeps
        // its own marker — so no valid order goes missing. Bar comes from the
        // current interval; re-runs on interval / zoom change.
        const barSeconds = Math.max(
          1,
          intervalToSeconds(currentIntervalRef.current)
        );
        const perBarLevel = new Map<string, TransactionExtended>();
        for (const tr of visible) {
          const side = tr.side?.toString().toLowerCase().trim();
          const sideKey = side === 'buy' || side === 'long' ? 'buy' : 'sell';
          const level =
            tr.isCompletedTrade === true && tr.entryPrice != null
              ? tr.entryPrice
              : Number(tr.price);
          const seconds =
            tr.isCompletedTrade === true && tr.entryTime != null
              ? tr.entryTime / 1000
              : normalizeTimeToSeconds(Number(tr.time));
          const barIndex = Math.floor(seconds / barSeconds);
          perBarLevel.set(`${sideKey}-${barIndex}-${level}`, tr);
        }
        visible = [...perBarLevel.values()];

        // Pixel-space trim. TradingView repaints EVERY drawing shape on each
        // pan/zoom (and we re-plot on live updates), so the count must stay
        // bounded — but trimming by recency chopped visible history off the
        // chart. Instead, merge only markers that would render within ~one icon
        // of each other ON SCREEN (icons are ~20px): bucket by (side, ~12px of
        // time, ~12px of price) at the current viewport scale and keep one per
        // cell. Every screen spot that had an icon still shows an icon, so the
        // picture reads the same as plotting everything — zoom in and the cells
        // shrink, revealing the full per-(bar, level) detail. Count is bounded
        // by screen area, not deal size.
        if (resolvedRange && visible.length > 0) {
          const ICON_PX = 12;
          const container = chartContainerRef.current;
          const widthPx = container?.clientWidth || 1200;
          const heightPx = container?.clientHeight || 600;

          // Visible price span: ask the chart; fall back to the markers' own
          // span.
          let pMin = Infinity;
          let pMax = -Infinity;
          try {
            const priceRange = chart.getVisiblePriceRange?.();
            if (priceRange?.from != null && priceRange?.to != null) {
              pMin = Math.min(priceRange.from, priceRange.to);
              pMax = Math.max(priceRange.from, priceRange.to);
            }
          } catch {
            /* fall back below */
          }
          if (!(pMax > pMin)) {
            for (const tr of visible) {
              const v =
                tr.isCompletedTrade === true && tr.entryPrice != null
                  ? tr.entryPrice
                  : Number(tr.price);
              if (Number.isFinite(v)) {
                if (v < pMin) pMin = v;
                if (v > pMax) pMax = v;
              }
            }
          }

          const timeSpan = Math.max(1, resolvedRange.to - resolvedRange.from);
          const tCell = (timeSpan * ICON_PX) / Math.max(ICON_PX, widthPx);
          const pCell =
            pMax > pMin
              ? ((pMax - pMin) * ICON_PX) / Math.max(ICON_PX, heightPx)
              : 1;

          const cells = new Map<string, TransactionExtended>();
          for (const tr of visible) {
            const side = tr.side?.toString().toLowerCase().trim();
            const sideKey = side === 'buy' || side === 'long' ? 'buy' : 'sell';
            const level =
              tr.isCompletedTrade === true && tr.entryPrice != null
                ? tr.entryPrice
                : Number(tr.price);
            const seconds =
              tr.isCompletedTrade === true && tr.entryTime != null
                ? tr.entryTime / 1000
                : normalizeTimeToSeconds(Number(tr.time));
            const cellKey = `${sideKey}-${Math.floor(seconds / tCell)}-${Math.floor(
              (Number.isFinite(level) ? level : 0) / pCell
            )}`;
            cells.set(cellKey, tr);
          }
          visible = [...cells.values()];
        }

        visible.forEach((t) => {
          addTransactionInternal(widget, true, t, (id, entities) =>
            transactionEntitiesRef.current.set(id, entities)
          );
        });
      },
      [widgetRef]
    );

    const renderPosition = useCallback((chart: OverlayChart) => {
      if (positionEntityRef.current) {
        try {
          chart.removeEntity?.(positionEntityRef.current);
        } catch (error) {
          logger.warn('Failed to remove position overlay', error);
        }
        positionEntityRef.current = null;
      }

      const cached = positionCacheRef.current;
      if (!cached || typeof chart.createShape !== 'function') return;
      const { position, precision } = cached;
      const multiplier = Math.pow(10, precision ?? 2);

      try {
        const entity = chart.createShape(
          {
            time: Math.round(Date.now() / 1000),
            price: position.entryPrice,
          },
          {
            disableSave: true,
            shape:
              position.side === BotOrderSideEnum.sell
                ? 'short_position'
                : 'long_position',
            zOrder: 'top',
            lock: true,
            disableSelection: true,
            overrides: {
              risk: Number.isFinite(position.risk) ? Math.abs(position.risk) : 0,
              accountSize: Number.isFinite(position.accountSize)
                ? Math.abs(position.accountSize)
                : 0,
              stopLevel: Math.round(
                Math.abs(position.entryPrice - position.stopPrice) * multiplier
              ),
              profitLevel: Math.round(
                Math.abs(position.entryPrice - position.profitPrice) *
                  multiplier
              ),
              alwaysShowStats: true,
            },
          }
        );
        positionEntityRef.current = entity ?? null;
      } catch (error) {
        logger.warn('Failed to create position overlay', error);
      }
    }, []);

    const renderersRef = useRef<
      Record<OverlayKind, (chart: OverlayChart) => void>
    >(null as never);
    renderersRef.current = {
      orderLines: renderOrderLines,
      orderDrawings: renderOrderDrawings,
      pastEntries: renderPastEntries,
      avgPrice: renderAvgPriceLines,
      transactions: renderTransactions,
      position: renderPosition,
    };

    const scheduleOverlayRetry = useCallback(() => {
      if (retryTimerRef.current) return;
      if (retryAttemptsRef.current >= OVERLAY_RETRY_MAX_ATTEMPTS) return;
      const delay = Math.min(
        OVERLAY_RETRY_MAX_DELAY_MS,
        OVERLAY_RETRY_BASE_DELAY_MS * 2 ** retryAttemptsRef.current
      );
      retryAttemptsRef.current += 1;
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        flushOverlaysRef.current();
      }, delay);
    }, []);

    /**
     * Draw every dirty overlay kind — but only onto a chart that can hold it.
     * A shape created while TradingView is loading a symbol, a resolution or a
     * layout is silently dropped, and `createOrderLine` / transactions refuse
     * to draw before the price scale exists. Previously each of those drops
     * was recorded as "drawn" and never retried, which is why a chart opened
     * or switched at an unlucky moment showed no lines or markers at all. Here
     * a kind only stops being dirty once it was drawn on a loaded chart; until
     * then the flush is retried (on the load callback, on TradingView's
     * data-loaded event, and on a backoff timer as a last resort).
     */
    const flushOverlays = useCallback(() => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (!chartReadyRef.current || dirtyOverlaysRef.current.size === 0) {
        return;
      }

      if (pendingLoadSinceRef.current != null) {
        if (Date.now() - pendingLoadSinceRef.current < PENDING_LOAD_TIMEOUT_MS) {
          scheduleOverlayRetry();
          return;
        }
        // The load's completion signal never arrived — draw anyway rather
        // than leave the chart bare.
        logger.warn('[Overlays] Chart load never signalled completion');
        pendingLoadSinceRef.current = null;
      }

      const chart = getActiveChart();
      if (!chart || !canDrawOverlays(chart)) {
        scheduleOverlayRetry();
        return;
      }

      const kinds = ALL_OVERLAYS.filter((k) => dirtyOverlaysRef.current.has(k));
      dirtyOverlaysRef.current.clear();
      for (const kind of kinds) {
        try {
          renderersRef.current[kind](chart);
        } catch (error) {
          logger.warn('[Overlays] Render failed; will retry', { kind, error });
          dirtyOverlaysRef.current.add(kind);
        }
      }
      drawnForKeyRef.current = chartDataKey(chart);

      if (dirtyOverlaysRef.current.size > 0) {
        scheduleOverlayRetry();
      } else {
        retryAttemptsRef.current = 0;
      }
    }, [getActiveChart, scheduleOverlayRetry]);
    flushOverlaysRef.current = flushOverlays;

    const requestOverlays = useCallback(
      (kinds: readonly OverlayKind[] = ALL_OVERLAYS) => {
        kinds.forEach((kind) => dirtyOverlaysRef.current.add(kind));
        retryAttemptsRef.current = 0;
        flushOverlays();
      },
      [flushOverlays]
    );

    /**
     * The chart started loading new data (symbol, resolution or layout). Hold
     * every overlay until it has loaded, then redraw all of them: TradingView
     * drops order lines on a symbol change, and anything asked for mid-load is
     * never created.
     */
    const beginChartLoad = useCallback(() => {
      ALL_OVERLAYS.forEach((kind) => dirtyOverlaysRef.current.add(kind));
      const chart = getActiveChart();
      pendingLoadFromKeyRef.current = chart ? chartDataKey(chart) : null;
      pendingLoadSinceRef.current = Date.now();
      pendingLoadTokenRef.current += 1;
      return pendingLoadTokenRef.current;
    }, [getActiveChart]);

    const endChartLoad = useCallback(
      (token?: number) => {
        // A stale completion (an earlier switch that was superseded) must not
        // release the newer load.
        if (token != null && token !== pendingLoadTokenRef.current) return;
        pendingLoadSinceRef.current = null;
        requestOverlays();
      },
      [requestOverlays]
    );

    /** Hold the overlays until the chart's current data has loaded. */
    const redrawAfterDataLoads = useCallback(() => {
      const token = beginChartLoad();
      const chart = getActiveChart();
      let settled = false;
      try {
        const ready = chart?.dataReady?.(() => endChartLoad(token));
        settled = ready === true;
      } catch {
        settled = false;
      }
      if (settled || typeof chart?.dataReady !== 'function') {
        endChartLoad(token);
      } else {
        // Also covered by `onDataLoaded` and the pending-load timeout.
        scheduleOverlayRetry();
      }
    }, [beginChartLoad, endChartLoad, getActiveChart, scheduleOverlayRetry]);

    const setOrderDrawings = useCallback(
      (orders?: ChartOrderDrawing[] | null) => {
        orderDrawingsCacheRef.current = Array.isArray(orders) ? orders : [];
        requestOverlays(['orderDrawings']);
      },
      [requestOverlays]
    );

    const setPastEntries = useCallback(
      (entries?: IndicatorsEvents[] | null) => {
        pastEntriesCacheRef.current = Array.isArray(entries) ? entries : [];
        requestOverlays(['pastEntries']);
      },
      [requestOverlays]
    );

    const setAvgPriceLines = useCallback(
      (avgPrices?: AvgPrice[] | null) => {
        const next = Array.isArray(avgPrices) ? avgPrices : [];
        // The wrapper re-sends these on every render; an identical payload
        // that is already on the chart needs no redraw.
        const signature = (list: AvgPrice[]) =>
          JSON.stringify(
            list.map((a) => [a?.price, a?.symbol, a?.label ?? null])
          );
        if (
          !dirtyOverlaysRef.current.has('avgPrice') &&
          signature(next) === signature(avgPriceCacheRef.current)
        ) {
          return;
        }
        avgPriceCacheRef.current = next;
        requestOverlays(['avgPrice']);
      },
      [requestOverlays]
    );

    const handleVisibleRangeChange = useCallback(
      (range?: { from: number; to: number } | null) => {
        visibleRangeRef.current = range ?? null;
        requestOverlays(RANGE_FILTERED_OVERLAYS);
        onVisibleRange?.(range ?? undefined);
      },
      [onVisibleRange, requestOverlays]
    );

    const handleIntervalChangeInternal = useCallback(
      (interval: string) => {
        logger.info('[Timeframe] Interval changed', {
          from: currentIntervalRef.current,
          to: interval,
        });
        currentIntervalRef.current = interval;
        // The new resolution's bars are loading; redraw once they are in.
        redrawAfterDataLoads();
        onIntervalChange?.(interval);
      },
      [onIntervalChange, redrawAfterDataLoads]
    );

    const handleLayoutChangeInternal = useCallback(
      (layout: { id: string; name?: string | null } | null) => {
        // Loading a saved layout wipes every programmatic shape and line, and
        // may bring its own symbol with it.
        redrawAfterDataLoads();
        onLayoutChange?.(layout);
      },
      [onLayoutChange, redrawAfterDataLoads]
    );

    useEffect(() => {
      visibleRangeCallbackRef.current = handleVisibleRangeChange;
    }, [handleVisibleRangeChange]);

    useEffect(() => {
      intervalChangeCallbackRef.current = handleIntervalChangeInternal;
    }, [handleIntervalChangeInternal]);

    useEffect(() => {
      layoutChangeCallbackRef.current = handleLayoutChangeInternal;
    }, [handleLayoutChangeInternal]);

    // A (re)built widget starts with nothing on it: forget the entities that
    // belonged to the previous one and draw everything from the caches.
    useEffect(() => {
      chartReadyRef.current = isChartReady;
      if (!isChartReady) return;

      orderDrawingEntitiesRef.current.clear();
      pastEntryEntitiesRef.current.clear();
      transactionEntitiesRef.current.clear();
      avgPriceLineEntitiesRef.current.clear();
      managedOrderLinesRef.current.clear();
      positionEntityRef.current = null;
      pendingLoadSinceRef.current = null;
      drawnForKeyRef.current = null;
      requestOverlays();

      // Whatever changed the chart's data — our own symbol switch, a symbol
      // picked in TradingView's own search, a resolution change, a layout
      // load — ends in a data-loaded event. If the overlays were drawn for a
      // different symbol / resolution, or are still waiting, redraw them.
      const chart = getActiveChart();
      const dataLoaded = (() => {
        try {
          return chart?.onDataLoaded?.();
        } catch {
          return undefined;
        }
      })();
      const handleDataLoaded = () => {
        const current = getActiveChart();
        if (!current) return;
        const key = chartDataKey(current);
        if (pendingLoadSinceRef.current != null) {
          // Still the old symbol / resolution: wait for the new data (the
          // load's own callback or the next data-loaded event).
          if (key === pendingLoadFromKeyRef.current) return;
          pendingLoadSinceRef.current = null;
          requestOverlays();
          return;
        }
        if (dirtyOverlaysRef.current.size > 0 || key !== drawnForKeyRef.current) {
          requestOverlays();
        }
      };
      try {
        dataLoaded?.subscribe?.(null, handleDataLoaded);
      } catch (subscribeError) {
        logger.debug('onDataLoaded subscription unavailable', subscribeError);
      }

      return () => {
        try {
          dataLoaded?.unsubscribe?.(null, handleDataLoaded);
        } catch {
          /* chart already torn down */
        }
      };
    }, [getActiveChart, isChartReady, requestOverlays]);

    useEffect(
      () => () => {
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      },
      []
    );

    const detachToolbarDropdown = useCallback(() => {
      if (toolbarDropdownHandleRef.current) {
        try {
          toolbarDropdownHandleRef.current.remove?.();
        } catch (dropdownError) {
          logger.debug('Failed to remove TradingView toolbar dropdown', {
            dropdownError,
          });
        } finally {
          toolbarDropdownHandleRef.current = null;
          toolbarDropdownSignatureRef.current = null;
        }
      }
    }, []);

    const attachToolbarDropdown = useCallback(
      (config?: TradingViewToolbarDropdownConfig | null) => {
        const run = async () => {
          if (!config || !config.items?.length) {
            detachToolbarDropdown();
            return;
          }

          const widget = widgetRef.current as ExtendedWidget | null;
          if (!widget || typeof widget.headerReady !== 'function') {
            return;
          }

          const signature = JSON.stringify({
            title: config.title,
            tooltip: config.tooltip ?? '',
            items: config.items.map((item) => ({
              title: item.title,
              isDisabled: item.isDisabled ?? false,
            })),
          });

          if (toolbarDropdownSignatureRef.current === signature) {
            return;
          }

          try {
            await widget.headerReady();
            // Drop the previous button without going through
            // detachToolbarDropdown — that also clears the signature, which we
            // are about to overwrite anyway.
            const previous = toolbarDropdownHandleRef.current;
            toolbarDropdownHandleRef.current = null;
            if (previous) {
              try {
                previous.remove?.();
              } catch (dropdownError) {
                logger.debug('Failed to remove TradingView toolbar dropdown', {
                  dropdownError,
                });
              }
            }
            if (typeof widget.createDropdown !== 'function') {
              return;
            }

            // `createDropdown` RESOLVES to the dropdown API — it does not
            // return it synchronously. Storing the un-awaited promise gave us a
            // "handle" whose `remove` was undefined, so detaching silently did
            // nothing and every re-attach stacked another button on the
            // toolbar. Invisible until something actually changed the config.
            const handle = await widget.createDropdown({
              title: config.title,
              ...(config.tooltip ? { tooltip: config.tooltip } : {}),
              useTradingViewStyle: config.useTradingViewStyle ?? true,
              items: config.items,
            });

            toolbarDropdownHandleRef.current = handle ?? null;
            toolbarDropdownSignatureRef.current = signature;
          } catch (dropdownError) {
            logger.warn('Failed to attach TradingView toolbar dropdown', {
              dropdownError,
            });
          }
        };

        // Serialize: both `headerReady()` and `createDropdown()` yield, so two
        // overlapping attaches would each find `toolbarDropdownHandleRef` empty
        // and create a button nobody removes. Chaining guarantees the next
        // attach sees the previous one's handle.
        toolbarDropdownQueueRef.current = toolbarDropdownQueueRef.current.then(
          run,
          run
        );
        return toolbarDropdownQueueRef.current;
      },
      [detachToolbarDropdown, widgetRef]
    );

    useEffect(() => {
      if (!isChartReady) {
        return;
      }
      void attachToolbarDropdown(toolbarDropdown);
      return () => {
        if (!toolbarDropdown) {
          detachToolbarDropdown();
        }
      };
    }, [
      attachToolbarDropdown,
      detachToolbarDropdown,
      isChartReady,
      toolbarDropdown,
    ]);

    useEffect(() => {
      const orderEntities = orderDrawingEntitiesRef.current;
      const pastEntities = pastEntryEntitiesRef.current;
      const transactionEntities = transactionEntitiesRef.current;
      const avgLines = avgPriceLineEntitiesRef.current;
      const managedLines = managedOrderLinesRef.current;
      return () => {
        const chart = getActiveChart();
        if (chart) {
          [orderEntities, pastEntities, transactionEntities].forEach(
            (entities) =>
              entities.forEach((entityOrEntities) => {
                (Array.isArray(entityOrEntities)
                  ? entityOrEntities
                  : [entityOrEntities]
                ).forEach((entity) => {
                  try {
                    chart.removeEntity?.(entity);
                  } catch (error) {
                    logger.warn('Failed to cleanup chart overlay entity', error);
                  }
                });
              })
          );
          if (positionEntityRef.current) {
            try {
              chart.removeEntity?.(positionEntityRef.current);
            } catch (error) {
              logger.warn('Failed to cleanup position overlay', error);
            }
          }
        }
        [avgLines, managedLines].forEach((lines) =>
          lines.forEach((line) => {
            try {
              line.remove?.();
            } catch (error) {
              logger.warn('Failed to cleanup chart line', error);
            }
          })
        );
        orderEntities.clear();
        pastEntities.clear();
        transactionEntities.clear();
        avgLines.clear();
        managedLines.clear();
        positionEntityRef.current = null;
        detachToolbarDropdown();
      };
    }, [detachToolbarDropdown, getActiveChart]);

    useImperativeHandle(ref, (): TradingViewChartCoreRef => {
      const handle = {
        getWidget: () => widgetRef.current,
        getContainerElement: () => chartContainerRef.current,
        isReady: () => isChartReady && widgetRef.current != null,
        updateSymbol: (symbolPair: string, onLoaded?: () => void) => {
          if (!widgetRef.current || !isChartReady) return;
          try {
            const widget = widgetRef.current as ExtendedWidget;
            const symbolToSet = symbolPair.includes('@')
              ? symbolPair
              : `${symbolPair}@BINANCE`;

            const chart = getActiveChart();

            if (chart?.setSymbol) {
              // Already on it: TradingView would not reload (and might never
              // call `dataReady`), so just make sure the overlays are drawn.
              if (
                normalizeSymbolId(chart.symbol?.()) ===
                normalizeSymbolId(symbolToSet)
              ) {
                requestOverlays();
                onLoaded?.();
                return;
              }
              // Every overlay waits for the new pair: TradingView drops order
              // lines on the switch and never creates anything asked for while
              // it loads — including a `dataReady` callback queued mid-load.
              const token = beginChartLoad();
              chart.setSymbol(symbolToSet, {
                dataReady: () => {
                  logger.debug('[Core] Chart symbol updated', {
                    symbol: symbolToSet,
                  });
                  endChartLoad(token);
                  onLoaded?.();
                },
              });
              return;
            }

            widget.setSymbol?.(symbolToSet, () => undefined);
            redrawAfterDataLoads();
          } catch (e) {
            logger.error('Failed to update symbol', e);
          }
        },
        updateInterval: (interval: string) => {
          if (!widgetRef.current || !isChartReady) {
            logger.warn(
              '[Timeframe] Cannot update interval - chart not ready',
              {
                interval,
                hasWidget: !!widgetRef.current,
                isChartReady,
              }
            );
            return;
          }
          try {
            logger.info('[Timeframe] Updating interval via imperative handle', {
              previousInterval: currentIntervalRef.current,
              newInterval: interval,
              timestamp: new Date().toISOString(),
            });

            const widget = widgetRef.current as ExtendedWidget;
            const chart = widget.chart?.();
            const changed = interval !== currentIntervalRef.current;
            chart?.setResolution?.(interval);
            currentIntervalRef.current = interval;

            if (changed) {
              redrawAfterDataLoads();
            } else {
              requestOverlays(RANGE_FILTERED_OVERLAYS);
            }
          } catch (e) {
            logger.error('Failed to update interval', { error: e, interval });
          }
        },
        addOrderLine: (order) => {
          if (!widgetRef.current || !isChartReady) return null;
          return createOrderLine(
            widgetRef.current as ExtendedWidget,
            order,
            (id, instance) => orderLinesRef.current.set(id, instance)
          );
        },
        removeOrderLine: (lineId: string) => {
          const line = orderLinesRef.current.get(lineId);
          try {
            line?.remove?.();
            orderLinesRef.current.delete(lineId);
          } catch (e) {
            logger.error('Remove order line failed', e);
          }
        },
        clearAllOrderLines: () => {
          orderLinesRef.current.forEach((l) => {
            try {
              l?.remove?.();
            } catch (e) {
              logger.warn('Order line cleanup error', e);
            }
          });
          orderLinesRef.current.clear();
        },
        updateOrderLines: (orders?: ChartOrderLine[] | null) => {
          orderLinesCacheRef.current = Array.isArray(orders) ? orders : [];
          requestOverlays(['orderLines']);
        },
        addTransaction: (t: unknown) => {
          if (!widgetRef.current || !isChartReady) return;
          return addTransactionInternal(
            widgetRef.current as ExtendedWidget,
            isChartReady,
            t,
            (id, entities) => transactionEntitiesRef.current.set(id, entities)
          );
        },
        clearTransactions: () => {
          clearTransactionsInternal(
            widgetRef.current as ExtendedWidget,
            isChartReady,
            transactionEntitiesRef.current
          );
        },
        updateTransactions: (transactions?: unknown[] | null) => {
          transactionsCacheRef.current = Array.isArray(transactions)
            ? (transactions as TransactionExtended[])
            : [];
          requestOverlays(['transactions']);
        },
        updateIndicators: async (indicators?: ChartIndicatorsConfig | null) => {
          if (!widgetRef.current || !isChartReady) return;
          // Guarded accessor — this handler has no try/catch, so a raw
          // `widget.activeChart?.()` throws straight into the error boundary
          // when the chart iframe has been torn down.
          const chart = getActiveChart();
          if (!chart) return;
          clearCustomIndicators(chart as never);
          const configs = Array.isArray(indicators) ? indicators : [];
          for (const config of configs) {
            await addTradingViewIndicator(chart as never, config);
          }
        },
        centerAtTimestampMs: (timestampMs: number, endTimestampMs?: number) => {
          if (!widgetRef.current || !isChartReady) return;
          try {
            const widget = widgetRef.current as ExtendedWidget;
            const api = widget.activeChart?.() || widget.chart?.();
            if (!api) return;
            const res = api.resolution?.() || '60';
            const norm = String(res).toUpperCase();
            let secondsPerBar = 3600; // 1h default
            if (/^\d+$/.test(norm))
              secondsPerBar = parseInt(norm, 10) * 60; // minutes
            else if (norm.endsWith('D')) secondsPerBar = 86400;
            else if (norm.endsWith('W')) secondsPerBar = 604800;
            const startSec = Math.floor(timestampMs / 1000);
            const endSec =
              endTimestampMs != null && Number.isFinite(endTimestampMs)
                ? Math.floor(endTimestampMs / 1000)
                : null;
            let range: { from: number; to: number };
            if (endSec != null && endSec > startSec) {
              // Frame the deal's actual entry→close span plus 20 bars of
              // padding each side (mirrors dealToTradingView's PAD_BARS), so a
              // short deal on a coarse interval fills the viewport instead of
              // being a 1-2 bar sliver inside a fixed ±100-bar window.
              const pad = 20 * secondsPerBar;
              range = { from: startSec - pad, to: endSec + pad };
            } else {
              // No span given (or degenerate) — center a fixed window on the
              // point (used by the grid transactions chart).
              const halfWindow = Math.max(1, 100 * secondsPerBar);
              range = { from: startSec - halfWindow, to: startSec + halfWindow };
            }
            if (api.setVisibleRange) api.setVisibleRange(range);
            else api.scrollToTime?.(startSec, true, true);
          } catch (e) {
            logger.error('centerAtTimestampMs failed', e);
          }
        },
        updateOrderDrawings: (drawings?: ChartOrderDrawing[] | null) => {
          setOrderDrawings(drawings ?? null);
        },
        updatePastEntries: (entries?: IndicatorsEvents[] | null) => {
          setPastEntries(entries ?? null);
        },
        updateAveragePriceLines: (avgPrices?: AvgPrice[] | null) => {
          setAvgPriceLines(avgPrices ?? null);
        },
        updatePositionOverlay: (
          position: PositionChart | null,
          options?: { pricePrecision?: number }
        ) => {
          const normalizedPrecision =
            typeof options?.pricePrecision === 'number' &&
            Number.isFinite(options.pricePrecision)
              ? Math.max(0, Math.min(12, Math.floor(options.pricePrecision)))
              : undefined;

          const serialized = position ? JSON.stringify(position) : null;
          const cached = positionCacheRef.current;
          if (
            (cached?.serialized ?? null) === serialized &&
            (cached?.precision ?? undefined) === normalizedPrecision
          ) {
            return;
          }

          positionCacheRef.current =
            position && serialized
              ? { position, precision: normalizedPrecision, serialized }
              : null;
          requestOverlays(['position']);
        },
        subscribeClick: (
          callback: (params: { time?: number; price?: number }) => void
        ) => {
          if (!widgetRef.current || !isChartReady) {
            logger.warn('Cannot subscribe to click - chart not ready');
            return null;
          }

          try {
            const widget = widgetRef.current as ExtendedWidget;

            logger.info('[TradingViewChartCore] subscribeClick called', {
              hasWidget: !!widget,
              hasActiveChart: typeof widget.activeChart === 'function',
              hasChart: typeof widget.chart === 'function',
              hasSubscribe: typeof widget['subscribe'] === 'function',
            });

            // First try: Use widget's subscribe method for mouse_up event (Advanced Charts API)
            if (typeof widget['subscribe'] === 'function') {
              logger.info(
                '[TradingViewChartCore] Using widget.subscribe for mouse_up event'
              );

              const chart = widget.activeChart?.() ?? widget.chart?.();
              if (!chart) {
                logger.warn(
                  '[TradingViewChartCore] No chart instance available'
                );
                return null;
              }

              logger.info('[TradingViewChartCore] Checking chart methods', {
                hasCrossHairMoved:
                  typeof (chart as any).crossHairMoved === 'function',
                chartType: typeof chart,
                chartKeys: Object.keys(chart).slice(0, 10), // First 10 keys for inspection
              });

              // Store the last crosshair position
              let lastCrosshairPosition: { time?: number; price?: number } = {};
              let crosshairSubscription: any = null;

              // Subscribe to crosshair movements to track position
              if (typeof (chart as any).crossHairMoved === 'function') {
                try {
                  const subscription = (chart as any).crossHairMoved();
                  logger.info(
                    '[TradingViewChartCore] Got crossHairMoved subscription object',
                    {
                      hasSubscribe:
                        typeof subscription?.subscribe === 'function',
                      subscriptionType: typeof subscription,
                      subscriptionKeys: subscription
                        ? Object.keys(subscription)
                        : [],
                    }
                  );

                  if (typeof subscription?.subscribe === 'function') {
                    // TradingView uses a delegate pattern where subscribe expects:
                    // subscribe(thisArg, callback, fireImmediately)
                    try {
                      const callback = (params: {
                        time?: number;
                        price?: number;
                      }) => {
                        lastCrosshairPosition = params || {};
                      };

                      crosshairSubscription = subscription.subscribe(
                        null, // thisArg
                        callback, // callback function
                        false // fireImmediately
                      );
                      logger.info(
                        '[TradingViewChartCore] Successfully subscribed to crosshair movements',
                        {
                          subscriptionResult: crosshairSubscription,
                          hasUnsubscribe:
                            crosshairSubscription &&
                            typeof crosshairSubscription.unsubscribe ===
                              'function',
                        }
                      );
                    } catch (subscribeError) {
                      logger.error(
                        '[TradingViewChartCore] Error during subscribe call',
                        subscribeError
                      );
                    }
                  } else {
                    logger.warn(
                      '[TradingViewChartCore] crossHairMoved() did not return a subscribable object'
                    );
                  }
                } catch (error) {
                  logger.error(
                    '[TradingViewChartCore] Failed to subscribe to crossHairMoved',
                    error
                  );
                }
              } else {
                logger.warn(
                  '[TradingViewChartCore] crossHairMoved method not available on chart'
                );
              }

              const handleMouseUp = (params: any) => {
                logger.info('[TradingViewChartCore] mouse_up event fired', {
                  params,
                  paramsKeys: Object.keys(params || {}),
                  lastCrosshairPosition,
                  hasTime: lastCrosshairPosition?.time !== undefined,
                  hasPrice: lastCrosshairPosition?.price !== undefined,
                });

                // Use the last tracked crosshair position if available
                if (
                  lastCrosshairPosition &&
                  lastCrosshairPosition.time !== undefined &&
                  lastCrosshairPosition.price !== undefined
                ) {
                  logger.info(
                    '[TradingViewChartCore] Using tracked crosshair position',
                    {
                      time: lastCrosshairPosition.time,
                      price: lastCrosshairPosition.price,
                    }
                  );
                  callback({
                    time: lastCrosshairPosition.time,
                    price: lastCrosshairPosition.price,
                  });
                  return;
                }

                // Fallback: try to get current crosshair position from params
                if (
                  params &&
                  params.time !== undefined &&
                  params.price !== undefined
                ) {
                  logger.info(
                    '[TradingViewChartCore] Using params coordinates',
                    { params }
                  );
                  callback({ time: params.time, price: params.price });
                  return;
                }

                // Fallback 2: Try to convert pixel coordinates to chart coordinates
                if (
                  params &&
                  (params.clientX !== undefined || params.pageX !== undefined)
                ) {
                  try {
                    const containerElement = chartContainerRef.current;
                    const timeScale = (chart as any).getTimeScale?.();

                    // Try multiple ways to get series
                    const allSeries = (chart as any).getAllSeries?.();
                    const mainSeries = (chart as any).getSeries?.();
                    const series =
                      mainSeries ||
                      (allSeries && allSeries.length > 0 ? allSeries[0] : null);

                    logger.info(
                      '[TradingViewChartCore] Attempting coordinate conversion',
                      {
                        hasContainer: !!containerElement,
                        hasTimeScale: !!timeScale,
                        hasGetAllSeries:
                          typeof (chart as any).getAllSeries === 'function',
                        hasGetSeries:
                          typeof (chart as any).getSeries === 'function',
                        allSeriesCount: Array.isArray(allSeries)
                          ? allSeries.length
                          : 0,
                        hasMainSeries: !!mainSeries,
                        hasSeries: !!series,
                        seriesType: typeof series,
                        seriesMethods: series
                          ? Object.keys(series)
                              .filter((k) => typeof series[k] === 'function')
                              .slice(0, 30)
                          : [],
                        chartMethods: Object.keys(chart)
                          .filter(
                            (k) => typeof (chart as any)[k] === 'function'
                          )
                          .slice(0, 20),
                      }
                    );

                    if (containerElement && timeScale) {
                      const rect = containerElement.getBoundingClientRect();
                      const x = (params.clientX ?? params.pageX) - rect.left;
                      const y = (params.clientY ?? params.pageY) - rect.top;

                      logger.info('[TradingViewChartCore] Pixel coordinates', {
                        clientX: params.clientX,
                        clientY: params.clientY,
                        rectLeft: rect.left,
                        rectTop: rect.top,
                        relativeX: x,
                        relativeY: y,
                      });

                      // Get time from x coordinate
                      const time = timeScale.coordinateToTime?.(x);

                      // Try to get price from y coordinate
                      let price: number | null = null;

                      // Method 1: Try to get from crosshair data first (most reliable for Advanced Charts)
                      if (
                        typeof (chart as any).crossHairMoved === 'function' &&
                        series
                      ) {
                        logger.info(
                          '[TradingViewChartCore] crossHairMoved available, will use event data'
                        );
                        // Price will be provided by crosshairMoved event
                      }

                      // Method 2: Try series.coordinateToPrice
                      if (
                        price === null &&
                        series &&
                        typeof series.coordinateToPrice === 'function'
                      ) {
                        price = series.coordinateToPrice(y);
                        logger.info(
                          '[TradingViewChartCore] Got price from series.coordinateToPrice',
                          { price }
                        );
                      }

                      // Method 3: Try to get price scale from panes
                      if (
                        price === null &&
                        typeof (chart as any).getPanes === 'function'
                      ) {
                        try {
                          const panes = (chart as any).getPanes();
                          logger.info('[TradingViewChartCore] Got panes', {
                            panesCount: Array.isArray(panes) ? panes.length : 0,
                          });

                          if (panes && panes.length > 0) {
                            const mainPane = panes[0];
                            const rightPriceScale =
                              mainPane.getRightPriceScale?.();
                            const leftPriceScale =
                              mainPane.getLeftPriceScale?.();
                            const priceScale =
                              rightPriceScale || leftPriceScale;

                            logger.info(
                              '[TradingViewChartCore] Got price scale',
                              {
                                hasRightScale: !!rightPriceScale,
                                hasLeftScale: !!leftPriceScale,
                                hasPriceScale: !!priceScale,
                                priceScaleMethods: priceScale
                                  ? Object.keys(priceScale).filter(
                                      (k) => typeof priceScale[k] === 'function'
                                    )
                                  : [],
                              }
                            );

                            if (
                              priceScale &&
                              typeof priceScale.coordinateToPrice === 'function'
                            ) {
                              // Need to adjust Y coordinate relative to the pane
                              const paneRect = mainPane
                                .getElement?.()
                                ?.getBoundingClientRect();
                              const paneY = paneRect
                                ? y - (paneRect.top - rect.top)
                                : y;
                              price = priceScale.coordinateToPrice(paneY);
                              logger.info(
                                '[TradingViewChartCore] Got price from priceScale.coordinateToPrice',
                                {
                                  price,
                                  paneY,
                                  hasPaneRect: !!paneRect,
                                }
                              );
                            }
                          }
                        } catch (error) {
                          logger.warn(
                            '[TradingViewChartCore] Failed to get price from panes',
                            error
                          );
                        }
                      }

                      logger.info(
                        '[TradingViewChartCore] Converted coordinates',
                        {
                          time,
                          price,
                          timeValid: time !== null && time !== undefined,
                          priceValid:
                            price !== null &&
                            price !== undefined &&
                            Number.isFinite(price),
                          hasCoordinateToTime:
                            typeof timeScale.coordinateToTime === 'function',
                          hasCoordinateToPrice: series
                            ? typeof series.coordinateToPrice === 'function'
                            : false,
                        }
                      );

                      // Return coordinates if we have at least time (price can come later)
                      if (time !== null && time !== undefined) {
                        if (
                          price !== null &&
                          price !== undefined &&
                          Number.isFinite(price)
                        ) {
                          // Both time and price available
                          logger.info(
                            '[TradingViewChartCore] Returning time and price'
                          );
                          callback({ time, price });
                          return;
                        } else {
                          // Only time available, still useful for now
                          logger.info(
                            '[TradingViewChartCore] Returning time-only (price conversion pending)'
                          );
                          callback({ time });
                          return;
                        }
                      }
                    }
                  } catch (error) {
                    logger.error(
                      '[TradingViewChartCore] Failed to convert coordinates',
                      error
                    );
                  }
                }

                logger.warn(
                  '[TradingViewChartCore] No coordinates available from mouse_up'
                );
                callback({});
              };

              widget['subscribe']('mouse_up', handleMouseUp);

              return () => {
                logger.info(
                  '[TradingViewChartCore] Unsubscribing from mouse_up and crosshair'
                );
                if (typeof widget['unsubscribe'] === 'function') {
                  widget['unsubscribe']('mouse_up', handleMouseUp);
                }
                if (
                  crosshairSubscription &&
                  typeof crosshairSubscription.unsubscribe === 'function'
                ) {
                  crosshairSubscription.unsubscribe();
                }
              };
            }

            const chart = widget.activeChart?.() ?? widget.chart?.();

            if (!chart) {
              logger.warn('Cannot subscribe to click - no chart instance');
              return null;
            }

            // TradingView's subscribe method for cross-hair position
            const chartWithSubscribe = chart as {
              crossHairMoved?: (
                callback: (params: { time?: number; price?: number }) => void
              ) => () => void;
              subscribeClick?: (
                callback: (params: { time?: number; price?: number }) => void
              ) => () => void;
            };

            // Try using the click subscription if available
            if (typeof chartWithSubscribe.subscribeClick === 'function') {
              logger.info('[TradingViewChartCore] Using chart.subscribeClick');
              const unsubscribe = chartWithSubscribe.subscribeClick(callback);
              return unsubscribe;
            }

            // Fallback: use crossHairMoved with a click simulation
            // This is the primary method for TradingView Advanced Charts
            logger.info(
              '[TradingViewChartCore] Using crossHairMoved for click events'
            );
            let isMouseDown = false;
            let lastCrossHairData: { time?: number; price?: number } = {};
            const containerElement = chartContainerRef.current;

            // Subscribe to crosshair movements
            const unsubscribeCrossHair =
              typeof chartWithSubscribe.crossHairMoved === 'function'
                ? chartWithSubscribe.crossHairMoved((params) => {
                    // Store the latest crosshair data
                    lastCrossHairData = params || {};
                    logger.debug(
                      '[TradingViewChartCore] CrossHair moved:',
                      params
                    );
                  })
                : null;

            const handleMouseDown = () => {
              isMouseDown = true;
              logger.debug('[TradingViewChartCore] Mouse down detected');
            };

            const handleMouseUp = () => {
              if (isMouseDown) {
                logger.info(
                  '[TradingViewChartCore] Click detected, lastCrossHairData:',
                  lastCrossHairData
                );
                // Pass the data even if price is missing - the picker will handle it
                if (
                  lastCrossHairData &&
                  Object.keys(lastCrossHairData).length > 0
                ) {
                  callback(lastCrossHairData);
                }
              }
              isMouseDown = false;
            };

            if (containerElement) {
              containerElement.addEventListener('mousedown', handleMouseDown);
              containerElement.addEventListener('mouseup', handleMouseUp);
            }

            return () => {
              if (unsubscribeCrossHair) {
                unsubscribeCrossHair();
              }
              if (containerElement) {
                containerElement.removeEventListener(
                  'mousedown',
                  handleMouseDown
                );
                containerElement.removeEventListener('mouseup', handleMouseUp);
              }
            };
          } catch (error) {
            logger.error('Failed to subscribe to chart click', error);
            return null;
          }
        },
      } satisfies TradingViewChartCoreRef;

      const _ensureHandleMatches: TradingViewChartCoreRef = handle;

      return _ensureHandleMatches;
    }, [
      beginChartLoad,
      endChartLoad,
      getActiveChart,
      isChartReady,
      redrawAfterDataLoads,
      requestOverlays,
      setAvgPriceLines,
      setOrderDrawings,
      setPastEntries,
      widgetRef,
    ]);

    return (
      <div
        className="h-full w-full relative flex flex-col"
        style={{ minHeight: '300px' }}
      >
        {isLoading && !stalled && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
            Loading chart...
          </div>
        )}
        {isLoading && stalled && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center gap-2 text-sm">
            <span className="text-muted-foreground">Chart failed to load.</span>
            <Button size="sm" variant="outline" onClick={retry}>
              Retry
            </Button>
          </div>
        )}
        {error && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 text-red-600">
            {error}
          </div>
        )}
        <div
          ref={chartContainerRef}
          className={`flex-1 ${isLoading || error ? 'hidden' : 'block'}`}
          style={{
            minHeight: '300px',
            height: '100%',
            width: '100%',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
          }}
        />
      </div>
    );
  }
);

TradingViewChartCore.displayName = 'TradingViewChartCore';

export default TradingViewChartCore;
