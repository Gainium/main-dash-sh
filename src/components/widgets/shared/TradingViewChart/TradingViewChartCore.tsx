/* eslint-disable @typescript-eslint/no-explicit-any */
import { useTradingViewAutoSave } from '@/hooks/useTradingViewAutoSave';
import { logger } from '@/lib/loggerInstance';
import { getCSSVar } from '@/lib/utils/chart';
import {
  BotOrderSideEnum,
  type AvgPrice,
  type ChartIndicatorsConfig,
  type ChartOrderDrawing,
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
  setSymbol?: (
    symbol: string,
    interval?: string,
    onReady?: () => void,
    onError?: (reason?: unknown) => void
  ) => void;
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
    const orderLinesRef = useRef<Map<string, OrderLineInstance>>(new Map());
    // Store transaction entity arrays (each may be single or multiple shapes)
    const transactionEntitiesRef = useRef<Map<string, unknown>>(new Map());
    const orderDrawingEntitiesRef = useRef<Map<string, unknown>>(new Map());
    const pastEntryEntitiesRef = useRef<Map<string, unknown>>(new Map());
    const avgPriceLineEntitiesRef = useRef<Map<string, OrderLineInstance>>(
      new Map()
    );
    const avgPriceLineIdsRef = useRef<Set<string>>(new Set());
    const visibleRangeRef = useRef<{ from: number; to: number } | null>(null);
    const orderDrawingsCacheRef = useRef<ChartOrderDrawing[]>([]);
    const pastEntriesCacheRef = useRef<IndicatorsEvents[]>([]);
    const transactionsCacheRef = useRef<TransactionExtended[]>([]);
    const avgPriceCacheRef = useRef<AvgPrice[]>([]);
    // Signature of the last avgPrice payload we rendered. Used to skip
    // redundant redraws when the same content arrives multiple times in
    // quick succession (each `setAvgPrices` call schedules a
    // `dataReady` callback, and concurrent callbacks can leave orphan
    // lines on the chart if `createOrderLine` is invoked more than once
    // for the same value).
    const avgPriceSignatureRef = useRef<string>('');
    const positionEntityRef = useRef<unknown | null>(null);
    const positionHashRef = useRef<string | null>(null);
    const positionPrecisionRef = useRef<number | undefined>(undefined);
    const currentIntervalRef = useRef<string>(initialInterval);
    const toolbarDropdownHandleRef = useRef<TradingViewDropdownHandle | null>(
      null
    );
    const toolbarDropdownSignatureRef = useRef<string | null>(null);
    const visibleRangeCallbackRef = useRef<
      (range?: { from: number; to: number } | null) => void
    >(() => undefined);
    const intervalChangeCallbackRef = useRef<(interval: string) => void>(
      () => undefined
    );

    const proxyVisibleRange = useCallback(
      (range?: { from: number; to: number }) =>
        visibleRangeCallbackRef.current(range ?? null),
      []
    );

    const proxyIntervalChange = useCallback(
      (interval: string) => intervalChangeCallbackRef.current(interval),
      []
    );

    const { widgetRef, isLoading, error, isChartReady } = useInitializeWidget({
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
      ...(onLayoutChange ? { onLayoutChange } : {}),
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

      const chartCandidate =
        typeof widget.activeChart === 'function'
          ? widget.activeChart?.()
          : widget.chart?.();

      if (!chartCandidate) {
        return null;
      }

      return chartCandidate as ChartInstance & {
        createMultipointShape?: (
          points: Array<{ time: number; price: number }>,
          options: Record<string, unknown>
        ) => unknown;
        createOrderLine?: () => OrderLineInstance;
        dataReady?: (callback: () => void) => void;
        getVisibleRange?: () => { from: number; to: number } | null;
      };
    }, [widgetRef]);

    const renderOrderDrawings = useCallback(() => {
      if (!widgetRef.current || !isChartReady) {
        return;
      }

      const chart = getActiveChart();
      if (!chart) {
        return;
      }

      orderDrawingEntitiesRef.current.forEach((entity) => {
        try {
          chart.removeEntity?.(entity);
        } catch (error) {
          logger.warn('Failed to remove order drawing entity', error);
        }
      });
      orderDrawingEntitiesRef.current.clear();

      const intervalMs = intervalToSeconds(currentIntervalRef.current) * 1000;
      const resolvedRange =
        visibleRangeRef.current ?? chart.getVisibleRange?.() ?? null;

      const createMultipointShape = (
        chart as {
          createMultipointShape?: (
            points: Array<{ time: number; price: number }>,
            options: Record<string, unknown>
          ) => unknown;
        }
      ).createMultipointShape;

      if (typeof createMultipointShape !== 'function') {
        return;
      }

      (orderDrawingsCacheRef.current ?? [])
        .map((order) => {
          if (!order) return null;
          const startTimeMs = Number(order.startTime);
          const endTimeMs = Number(order.endTime);
          const priceValue = Number(order.price);
          if (
            !Number.isFinite(startTimeMs) ||
            !Number.isFinite(endTimeMs) ||
            !Number.isFinite(priceValue)
          ) {
            logger.warn('[OrderDrawings] Invalid order data', {
              order,
              startTimeMs,
              endTimeMs,
              priceValue,
            });
            return null;
          }
          return {
            ...order,
            startTimeMs,
            endTimeMs,
            priceValue,
          };
        })
        .filter(
          (
            order
          ): order is typeof order & {
            startTimeMs: number;
            endTimeMs: number;
            priceValue: number;
          } => Boolean(order)
        )
        .filter((order) => {
          const duration = Math.abs(order.endTimeMs - order.startTimeMs);
          const durationBars = duration / intervalMs;

          logger.debug('[OrderDrawings] Evaluating order for rendering', {
            side: order.side,
            startTime: new Date(order.startTimeMs).toISOString(),
            endTime: new Date(order.endTimeMs).toISOString(),
            price: order.priceValue,
            durationMs: duration,
            durationSeconds: duration / 1000,
            durationBars: durationBars.toFixed(2),
            intervalMs,
            intervalSeconds: intervalMs / 1000,
            meetsMinDuration: duration >= intervalMs,
          });

          if (duration < intervalMs) {
            logger.debug(
              '[OrderDrawings] Filtering out order - duration too short',
              {
                durationMs: duration,
                requiredIntervalMs: intervalMs,
                durationBars: durationBars.toFixed(2),
              }
            );
            return false;
          }
          if (!resolvedRange) {
            return true;
          }
          const startSeconds = order.startTimeMs / 1000;
          const endSeconds = order.endTimeMs / 1000;
          // Keep any segment that OVERLAPS the visible range, not only those
          // whose start is in view — otherwise a line vanishes as soon as its
          // start scrolls off the left edge even though it still crosses the
          // viewport.
          const inRange =
            endSeconds > resolvedRange.from &&
            startSeconds < resolvedRange.to;

          if (!inRange) {
            logger.debug(
              '[OrderDrawings] Filtering out order - outside visible range',
              {
                startSeconds,
                rangeFrom: resolvedRange.from,
                rangeTo: resolvedRange.to,
                startTime: new Date(order.startTimeMs).toISOString(),
                rangeFromTime: new Date(
                  resolvedRange.from * 1000
                ).toISOString(),
                rangeToTime: new Date(resolvedRange.to * 1000).toISOString(),
              }
            );
          }

          return inRange;
        })
        .forEach((order, index) => {
          try {
            const startSeconds = Math.round(order.startTimeMs / 1000);
            const endSeconds = Math.round(order.endTimeMs / 1000);

            logger.info('[OrderDrawings] Creating drawing on chart', {
              index,
              side: order.side,
              price: order.priceValue,
              startTime: new Date(startSeconds * 1000).toISOString(),
              endTime: new Date(endSeconds * 1000).toISOString(),
              startTimestamp: startSeconds,
              endTimestamp: endSeconds,
              durationSeconds: endSeconds - startSeconds,
              currentInterval: currentIntervalRef.current,
              intervalSeconds: intervalMs / 1000,
            });

            const entity = createMultipointShape.call(
              chart,
              [
                {
                  time: startSeconds,
                  price: order.priceValue,
                },
                {
                  time: endSeconds,
                  price: order.priceValue,
                },
              ],
              {
                shape: 'trend_line',
                lock: true,
                disableSave: true,
                disableSelection: true,
                zOrder:
                  order.side?.toUpperCase?.() === 'GREY' ? 'bottom' : 'top',
                overrides: {
                  linecolor: getLineColorForSide(order.side),
                  linewidth: 2,
                },
              }
            );
            if (entity) {
              const key = `${order.startTimeMs}-${order.endTimeMs}-${order.priceValue}-${order.side}-${index}`;
              orderDrawingEntitiesRef.current.set(key, entity);
              logger.debug('[OrderDrawings] Drawing created successfully', {
                key,
                entityCreated: true,
              });
            } else {
              logger.warn(
                '[OrderDrawings] Drawing entity creation returned null',
                {
                  order,
                  index,
                }
              );
            }
          } catch (error) {
            logger.warn('Failed to render order drawing', {
              error,
              order,
              index,
            });
          }
        });
    }, [
      currentIntervalRef,
      getActiveChart,
      isChartReady,
      orderDrawingsCacheRef,
      visibleRangeRef,
      widgetRef,
    ]);

    const renderPastEntries = useCallback(() => {
      if (!widgetRef.current || !isChartReady) {
        return;
      }

      const chart = getActiveChart();
      if (!chart) {
        return;
      }

      pastEntryEntitiesRef.current.forEach((entity) => {
        try {
          chart.removeEntity?.(entity);
        } catch (error) {
          logger.warn('Failed to remove past entry entity', error);
        }
      });
      pastEntryEntitiesRef.current.clear();

      const createMultipointShape = (
        chart as {
          createMultipointShape?: (
            points: Array<{ time: number; price: number }>,
            options: Record<string, unknown>
          ) => unknown;
        }
      ).createMultipointShape;

      if (typeof createMultipointShape !== 'function') {
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

      (pastEntriesCacheRef.current ?? []).forEach((entry) => {
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
          const entity = createMultipointShape.call(
            chart,
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
    }, [
      currentIntervalRef,
      getActiveChart,
      isChartReady,
      pastEntriesCacheRef,
      visibleRangeRef,
      widgetRef,
    ]);

    const renderAvgPriceLines = useCallback(() => {
      if (!widgetRef.current || !isChartReady) {
        return;
      }

      const chart = getActiveChart();
      if (!chart) {
        return;
      }

      const nextSignature = JSON.stringify(
        (avgPriceCacheRef.current ?? []).map((a) => ({
          price: a?.price,
          symbol: a?.symbol,
          label: a?.label,
        }))
      );
      // Skip redundant redraws when the payload hasn't changed. Multiple
      // `dataReady` callbacks can be queued during rapid re-renders; if
      // each one re-creates lines we end up with duplicates because
      // TradingView's `remove()` doesn't always tear the line down
      // before the next `createOrderLine()` fires.
      if (nextSignature === avgPriceSignatureRef.current) {
        return;
      }
      avgPriceSignatureRef.current = nextSignature;

      const applyLines = () => {
        avgPriceLineEntitiesRef.current.forEach((line) => {
          try {
            line.remove?.();
          } catch (error) {
            logger.warn('Failed to remove average price line', error);
          }
        });
        avgPriceLineEntitiesRef.current.clear();
        avgPriceLineIdsRef.current.clear();

        // Theme-neutral grey for the breakeven / avg-price line.
        const lineColor = getCSSVar('--color-muted-foreground', '#94a3b8');
        const transparent = 'rgba(0, 0, 0, 0)';

        (avgPriceCacheRef.current ?? []).forEach((avg, index) => {
          if (!avg) return;
          const price = Number(avg.price);
          if (!Number.isFinite(price) || price === 0) {
            return;
          }

          try {
            const orderLine = (
              chart as {
                createOrderLine?: () => OrderLineInstance;
              }
            ).createOrderLine?.() as
              | (OrderLineInstance & {
                  setLineColor?: (c: string) => unknown;
                  setLineWidth?: (w: number) => unknown;
                  setLineStyle?: (s: number) => unknown;
                  setLineLength?: (n: number) => unknown;
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

            const key = `${avg.symbol ?? 'AVG'}-${price}-${index}`;
            avgPriceLineEntitiesRef.current.set(key, orderLine);
            avgPriceLineIdsRef.current.add(key);
          } catch (error) {
            logger.warn('Failed to render average price line', error);
          }
        });
      };

      const dataReady = (
        chart as {
          dataReady?: (callback: () => void) => void;
        }
      ).dataReady;

      if (typeof dataReady === 'function') {
        dataReady.call(chart, applyLines);
      } else {
        applyLines();
      }
    }, [
      avgPriceCacheRef,
      avgPriceLineEntitiesRef,
      avgPriceLineIdsRef,
      getActiveChart,
      isChartReady,
      widgetRef,
    ]);

    const setOrderDrawings = useCallback(
      (orders?: ChartOrderDrawing[] | null) => {
        const previousCount = orderDrawingsCacheRef.current?.length ?? 0;
        const newOrders = Array.isArray(orders) ? orders : [];

        logger.info('🎯 [OrderDrawings] Updating cache', {
          previousCount,
          newCount: newOrders.length,
          interval: currentIntervalRef.current,
        });

        logger.info('[OrderDrawings] Updating drawings cache', {
          previousCount,
          newCount: newOrders.length,
          currentInterval: currentIntervalRef.current,
          drawings: newOrders.map((o) => ({
            side: o.side,
            startTime: new Date(Number(o.startTime)).toISOString(),
            endTime: new Date(Number(o.endTime)).toISOString(),
            price: o.price,
            durationMs: Number(o.endTime) - Number(o.startTime),
            durationSeconds: (Number(o.endTime) - Number(o.startTime)) / 1000,
          })),
        });

        orderDrawingsCacheRef.current = newOrders;
        renderOrderDrawings();
      },
      [renderOrderDrawings]
    );

    const setPastEntries = useCallback(
      (entries?: IndicatorsEvents[] | null) => {
        pastEntriesCacheRef.current = Array.isArray(entries) ? entries : [];
        renderPastEntries();
      },
      [renderPastEntries]
    );

    const setAvgPriceLines = useCallback(
      (avgPrices?: AvgPrice[] | null) => {
        avgPriceCacheRef.current = Array.isArray(avgPrices) ? avgPrices : [];
        renderAvgPriceLines();
      },
      [renderAvgPriceLines]
    );

    // Plot the transaction overlay, but only for trades whose time span overlaps
    // the currently visible range. On a high-frequency deal the full set can be
    // thousands of trades — each completed trade adds ~4-6 TradingView drawing
    // shapes, so plotting (and letting TradingView repaint) all of them froze the
    // chart on every pan and on every live deal update (bug #9 / ClickUp 86ey529bk).
    // This mirrors the visible-range filtering already used for order drawings and
    // past entries, and is re-run from reapplyRangeFilteredOverlays on pan/zoom so
    // the off-screen trades are never materialized as shapes.
    const renderTransactions = useCallback(() => {
      if (!widgetRef.current || !isChartReady) return;
      const chart = getActiveChart();
      if (!chart) return;

      // Remove the shapes plotted on the previous pass before re-filtering.
      clearTransactionsInternal(
        widgetRef.current as ExtendedWidget,
        isChartReady,
        transactionEntitiesRef.current
      );

      const resolvedRange =
        visibleRangeRef.current ?? chart.getVisibleRange?.() ?? null;

      const inRange = (tr: TransactionExtended): boolean => {
        if (!resolvedRange) return true;
        // Completed trades span [entryTime, exitTime] (ms) — keep any whose span
        // overlaps the viewport. Point transactions are keyed off `time`.
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

      const cache = transactionsCacheRef.current ?? [];
      let visible = resolvedRange ? cache.filter(inRange) : cache.slice();

      // Safety bound: even fully zoomed out we never materialize more than
      // MAX_PLOTTED trades, keeping the worst-case pan/paint cost bounded. Keep the
      // most recent ones (highest time), where activity is densest.
      const MAX_PLOTTED = 400;
      if (visible.length > MAX_PLOTTED) {
        visible = visible
          .slice()
          .sort((a, b) => Number(a.time) - Number(b.time))
          .slice(visible.length - MAX_PLOTTED);
      }

      visible.forEach((t) => {
        addTransactionInternal(
          widgetRef.current as ExtendedWidget,
          isChartReady,
          t,
          (id, entities) => transactionEntitiesRef.current.set(id, entities)
        );
      });
    }, [getActiveChart, isChartReady, widgetRef]);

    const reapplyRangeFilteredOverlays = useCallback(() => {
      renderOrderDrawings();
      renderPastEntries();
      renderTransactions();
    }, [renderOrderDrawings, renderPastEntries, renderTransactions]);

    const handleVisibleRangeChange = useCallback(
      (range?: { from: number; to: number } | null) => {
        visibleRangeRef.current = range ?? null;

        reapplyRangeFilteredOverlays();
        onVisibleRange?.(range ?? undefined);
      },
      [onVisibleRange, reapplyRangeFilteredOverlays]
    );

    const handleIntervalChangeInternal = useCallback(
      (interval: string) => {
        const previousInterval = currentIntervalRef.current;
        currentIntervalRef.current = interval;

        logger.info('⏱️ [Timeframe] Interval changed', {
          from: previousInterval,
          to: interval,
          fromSeconds: intervalToSeconds(previousInterval),
          toSeconds: intervalToSeconds(interval),
        });

        logger.info(
          '[Timeframe] Interval changed - triggering drawing reposition',
          {
            previousInterval,
            newInterval: interval,
            previousIntervalSeconds: intervalToSeconds(previousInterval),
            newIntervalSeconds: intervalToSeconds(interval),
            drawingsCount: orderDrawingsCacheRef.current?.length ?? 0,
            pastEntriesCount: pastEntriesCacheRef.current?.length ?? 0,
            timestamp: new Date().toISOString(),
          }
        );

        reapplyRangeFilteredOverlays();
        onIntervalChange?.(interval);
      },
      [onIntervalChange, reapplyRangeFilteredOverlays]
    );

    useEffect(() => {
      visibleRangeCallbackRef.current = handleVisibleRangeChange;
    }, [handleVisibleRangeChange]);

    useEffect(() => {
      intervalChangeCallbackRef.current = handleIntervalChangeInternal;
    }, [handleIntervalChangeInternal]);

    useEffect(() => {
      if (!isChartReady) {
        return;
      }
      renderOrderDrawings();
      renderPastEntries();
      renderAvgPriceLines();
    }, [
      isChartReady,
      renderAvgPriceLines,
      renderOrderDrawings,
      renderPastEntries,
    ]);

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
      async (config?: TradingViewToolbarDropdownConfig | null) => {
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
          detachToolbarDropdown();
          if (typeof widget.createDropdown !== 'function') {
            return;
          }

          const handle = widget.createDropdown({
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
      const orderEntitiesRef = orderDrawingEntitiesRef.current;
      const pastEntitiesRef = pastEntryEntitiesRef.current;
      const avgLineEntitiesRef = avgPriceLineEntitiesRef.current;
      const avgLineIdsRef = avgPriceLineIdsRef.current;
      return () => {
        const chart = getActiveChart();
        const orderEntities = Array.from(orderEntitiesRef.values());
        const pastEntities = Array.from(pastEntitiesRef.values());
        const avgLines = Array.from(avgLineEntitiesRef.values());
        if (chart) {
          orderEntities.forEach((entity) => {
            try {
              chart.removeEntity?.(entity);
            } catch (error) {
              logger.warn('Failed to cleanup order drawing entity', error);
            }
          });
          pastEntities.forEach((entity) => {
            try {
              chart.removeEntity?.(entity);
            } catch (error) {
              logger.warn('Failed to cleanup past entry entity', error);
            }
          });
        }
        orderEntitiesRef.clear();
        pastEntitiesRef.clear();
        avgLines.forEach((line) => {
          try {
            line.remove?.();
          } catch (error) {
            logger.warn('Failed to cleanup average price line', error);
          }
        });
        avgLineEntitiesRef.clear();
        avgLineIdsRef.clear();
        detachToolbarDropdown();
      };
    }, [detachToolbarDropdown, getActiveChart]);

    const removePositionOverlay = useCallback(
      (
        chartInstance?:
          | (ChartInstance & {
              removeEntity?: (entity: unknown) => void;
            })
          | null
      ) => {
        if (!positionEntityRef.current) {
          positionHashRef.current = null;
          positionPrecisionRef.current = undefined;
          return;
        }

        try {
          const widget = widgetRef.current as ExtendedWidget | null;
          const chart =
            chartInstance ??
            (typeof widget?.chart === 'function'
              ? (widget.chart?.() as ChartInstance & {
                  removeEntity?: (entity: unknown) => void;
                })
              : null);

          chart?.removeEntity?.(positionEntityRef.current);
        } catch (error) {
          logger.warn('Failed to remove position overlay', error);
        } finally {
          positionEntityRef.current = null;
          positionHashRef.current = null;
          positionPrecisionRef.current = undefined;
        }
      },
      [widgetRef]
    );

    const addPositionOverlay = useCallback(
      (
        position: PositionChart,
        normalizedPrecision: number | undefined,
        serialized: string
      ) => {
        if (!widgetRef.current || !isChartReady) {
          return;
        }

        const widget = widgetRef.current as ExtendedWidget;
        const chart = widget.chart?.() as
          | (ChartInstance & {
              createShape?: (
                point: { time: number; price: number },
                options: Record<string, unknown>
              ) => unknown;
              removeEntity?: (entity: unknown) => void;
            })
          | null;

        if (!chart || typeof chart.createShape !== 'function') {
          logger.warn(
            'TradingView chart instance unavailable for position overlay'
          );
          return;
        }

        removePositionOverlay(chart);

        const precision =
          typeof normalizedPrecision === 'number' &&
          Number.isFinite(normalizedPrecision)
            ? Math.max(0, Math.min(12, Math.floor(normalizedPrecision)))
            : undefined;
        const multiplier = Math.pow(10, precision ?? 2);

        const riskValue = Number.isFinite(position.risk)
          ? Math.abs(position.risk)
          : 0;
        const accountSizeValue = Number.isFinite(position.accountSize)
          ? Math.abs(position.accountSize)
          : 0;
        const stopLevel = Math.round(
          Math.abs(position.entryPrice - position.stopPrice) * multiplier
        );
        const profitLevel = Math.round(
          Math.abs(position.entryPrice - position.profitPrice) * multiplier
        );

        try {
          const entity = chart.createShape?.(
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
                risk: riskValue,
                accountSize: accountSizeValue,
                stopLevel,
                profitLevel,
                alwaysShowStats: true,
              },
            }
          );

          if (entity) {
            positionEntityRef.current = entity;
            positionHashRef.current = serialized;
            positionPrecisionRef.current = precision;
          }
        } catch (error) {
          logger.warn('Failed to create position overlay', error);
        }
      },
      [isChartReady, removePositionOverlay, widgetRef]
    );

    useImperativeHandle(ref, (): TradingViewChartCoreRef => {
      const handle = {
        getWidget: () => widgetRef.current,
        getContainerElement: () => chartContainerRef.current,
        isReady: () => isChartReady && widgetRef.current != null,
        updateSymbol: (symbolPair: string) => {
          if (!widgetRef.current || !isChartReady) return;
          try {
            const widget = widgetRef.current as ExtendedWidget;
            const symbolToSet = symbolPair.includes('@')
              ? symbolPair
              : `${symbolPair}@BINANCE`;

            const chart = widget.activeChart?.() ?? widget.chart?.();
            const interval = currentIntervalRef.current;

            if (chart?.setSymbol) {
              chart.setSymbol(
                symbolToSet,
                interval,
                () => {
                  logger.debug('[Core] Chart symbol updated', {
                    symbol: symbolToSet,
                    interval,
                  });
                },
                (reason?: unknown) => {
                  logger.warn('[Core] Chart symbol update reported failure', {
                    symbol: symbolToSet,
                    interval,
                    reason,
                  });
                }
              );
              return;
            }

            widget.setSymbol?.(symbolToSet, () => undefined);
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
            chart?.setResolution?.(interval);
            currentIntervalRef.current = interval;

            logger.debug(
              '[Timeframe] Interval updated, triggering overlay reapply',
              {
                newInterval: interval,
              }
            );

            reapplyRangeFilteredOverlays();
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
          renderTransactions();
        },
        updateIndicators: async (indicators?: ChartIndicatorsConfig | null) => {
          if (!widgetRef.current || !isChartReady) return;
          const widget = widgetRef.current as ExtendedWidget;
          const chart = widget.activeChart?.();
          if (!chart) return;
          clearCustomIndicators(chart as never);
          const configs = Array.isArray(indicators) ? indicators : [];
          for (const config of configs) {
            await addTradingViewIndicator(chart as never, config);
          }
        },
        centerAtTimestampMs: (timestampMs: number) => {
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
            const timeSec = Math.floor(timestampMs / 1000);
            const halfBars = 100;
            const halfWindow = Math.max(1, halfBars * secondsPerBar);
            const range = {
              from: timeSec - halfWindow,
              to: timeSec + halfWindow,
            };
            if (api.setVisibleRange) api.setVisibleRange(range);
            else api.scrollToTime?.(timeSec, true, true);
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

          if (!position) {
            removePositionOverlay();
            return;
          }

          const serialized = JSON.stringify(position);
          if (
            serialized === positionHashRef.current &&
            normalizedPrecision === positionPrecisionRef.current
          ) {
            return;
          }

          if (!widgetRef.current || !isChartReady) {
            return;
          }

          addPositionOverlay(position, normalizedPrecision, serialized);
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
      addPositionOverlay,
      isChartReady,
      removePositionOverlay,
      reapplyRangeFilteredOverlays,
      renderTransactions,
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
        {isLoading && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
            Loading chart...
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
