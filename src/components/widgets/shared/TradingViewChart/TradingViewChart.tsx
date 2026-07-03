import { logger } from '@/lib/loggerInstance';
import {
  ExchangeEnum,
  type AvgPrice,
  type ChartIndicatorsConfig,
  type ChartOrderDrawing,
  type ChartOrderLine,
  type IndicatorsEvents,
  type PositionChart,
  type Symbols,
  type TransactionChart,
} from '@/types';
/* import { convertIndicatorConfigsToChart } from '@/utils/indicators/chartIndicatorUtils'; */
import { extractPairAssets } from '@/utils/pairs';
import { maybePrefetchHistory } from '@/utils/tradingView/historyPrefetcher';
import {
  setAvailableSymbols,
  setCurrentSymbol,
} from '@/utils/tradingViewDatafeed';
import type { EntityId } from 'public/static/charting_library/charting_library';
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import TradingViewWidgetRenderer from './TradingViewWidgetRenderer';
import type {
  TradingViewChartCoreRef,
  TradingViewToolbarDropdownConfig,
} from './types';

const mapStringToExchangeEnum = (exchangeString?: string): ExchangeEnum => {
  if (!exchangeString) {
    return ExchangeEnum.binance;
  }

  const normalized = exchangeString.toLowerCase();
  const match = (Object.values(ExchangeEnum) as string[]).find(
    (value) => value.toLowerCase() === normalized
  );

  return (match as ExchangeEnum) ?? ExchangeEnum.binance;
};

const buildSymbolFromFullName = (
  fullSymbol: string,
  symbolList: Symbols[] = []
): Symbols => {
  const [rawPair = '', rawExchange = ''] = fullSymbol.split('@');
  // Preserve case for HIP-3 builder-perp pairs (`xyz:SP500`). The dex
  // prefix is lowercase by upstream convention and the backend candles
  // endpoint rejects an uppercased prefix.
  const pair = rawPair.includes(':') ? rawPair : rawPair.toUpperCase();
  const normalizedExchange = rawExchange.toLowerCase();

  // Loose match: TradingView normalizes our HIP-3 ticker (`flx:CRCL-USDH`)
  // to its uppercase/underscore form (`FLX_CRCL-USDH`) and feeds the
  // normalized string back through `onSymbolChanged`. Compare both
  // pair strings with `:` and `_` collapsed to the same character so we
  // still resolve the original TradingPair (whose `.pair` still has the
  // real `:`-bearing form the candles endpoint expects).
  const normalizePair = (value: string): string =>
    value.replace(/:/g, '_').toLowerCase();
  const normalizedRequested = normalizePair(pair);

  const matchedSymbol =
    symbolList.find(
      (symbol) =>
        normalizePair(symbol.pair) === normalizedRequested &&
        (!normalizedExchange ||
          (symbol.exchange as string).toLowerCase() === normalizedExchange)
    ) ??
    symbolList.find(
      (symbol) => normalizePair(symbol.pair) === normalizedRequested
    );

  if (matchedSymbol) {
    return matchedSymbol;
  }

  const inferredAssets = extractPairAssets(pair);
  const fallbackExchange = mapStringToExchangeEnum(normalizedExchange);

  return {
    pair,
    exchange: fallbackExchange,
    baseAsset: {
      minAmount: 0,
      maxAmount: 0,
      step: 0,
      name: inferredAssets.baseAsset || pair,
    },
    quoteAsset: {
      minAmount: 0,
      name: inferredAssets.quoteAsset || 'USDT',
    },
    maxOrders: 100,
    priceAssetPrecision: 8,
    crossAvailable: false,
  };
};

/* const isChartIndicatorConfigArray = (
  value: unknown
): value is ChartIndicatorsConfig =>
  Array.isArray(value) &&
  value.every(
    (indicator) =>
      indicator &&
      typeof indicator === 'object' &&
      'uuid' in indicator &&
      typeof (indicator as { uuid: unknown }).uuid === 'string'
  ); */

// High-level props for the wrapper component
interface TradingViewChartProps {
  symbol?: string;
  availableSymbols?: Symbols[];
  orders?: ChartOrderLine[];
  ordersForDrawing?: ChartOrderDrawing[];
  transactions?: (TransactionChart & { entity?: EntityId | null })[];
  priceUpdateCallback?:
    | ((latestPrice: string, symbol: string) => Promise<void>)
    | ((latestPrice: string, symbol: string) => void);
  avgPrice?: AvgPrice[];
  draggable?: boolean;
  dragEvent?: (side: 'top' | 'low', price: number) => void;
  indicators?: ChartIndicatorsConfig;
  interval?: string;
  updateInterval?: React.Dispatch<React.SetStateAction<string>>;
  chartFrom?: number;
  pastEntries?: (IndicatorsEvents & { entity?: EntityId | null })[];
  useCb?: (value: number, id: string) => void;
  position?: PositionChart | null;
  setOnChangeSymbol?: (s: Symbols) => void;
  // Notify parent when user changes interval inside the embedded TradingView widget UI
  onIntervalChange?: (interval: string) => void;
  enableAutoSave?: boolean;
  enableLoadLastChart?: boolean;
  enableSeparateDrawingsStorage?: boolean;
  widgetId?: string;
  initialLayoutId?: string | null;
  initialLayoutName?: string | null;
  onLayoutChange?: (
    layout: { id: string; name?: string | null } | null
  ) => void;
  showOrders?: boolean;
  showTransactions?: boolean;
  showPastOrders?: boolean;
  showSignals?: boolean;
  toolbarDropdown?: TradingViewToolbarDropdownConfig | null;
  // Initial timeframe to show when chart first loads (UNIX timestamps in seconds)
  initialTimeframe?: { from: number; to: number };
  /**
   * Optional custom datafeed for this chart instance. When supplied, this
   * chart routes data through the provided feed AND skips the wrapper's
   * shared-exchange prefetch + global symbol-state writes, making it a
   * fully self-contained chart. Defaults to the shared live datafeed when
   * omitted, so all existing (live) consumers are unaffected.
   */
  datafeed?: import('@/utils/tradingView/types').IBasicDataFeed;
}

// Interface for exposing high-level methods
export interface TradingViewChartRef {
  getWidget: () => unknown | null;
  isReady: () => boolean;
  updateSymbol: (symbol: Symbols) => void;
  updateInterval: (interval: string) => void;
  addOrder: (order: ChartOrderLine) => void;
  removeOrder: (orderId: string) => void;
  getCoreRef: () => TradingViewChartCoreRef | null;
  centerAtTimestampMs: (timestampMs: number) => void;
}

/**
 * High-level TradingView Chart Wrapper Component
 *
 * This component handles prop changes and calls appropriate methods on the low-level chart.
 * It compares props and updates the chart accordingly without re-initializing the entire widget.
 *
 * Architecture:
 * - TradingViewChartCore: Low-level component that initializes once and exposes widget methods
 * - TradingViewChart: High-level wrapper that handles prop changes and business logic
 */
const TradingViewChartComponent = forwardRef<
  TradingViewChartRef,
  TradingViewChartProps
>((props, ref) => {
  const {
    symbol,
    availableSymbols,
    interval = '60',
    orders = [],
    ordersForDrawing = [],
    transactions = [],
    indicators,
    position,
    avgPrice,
    pastEntries = [],
    setOnChangeSymbol,
    onIntervalChange,
    enableAutoSave = true,
    enableLoadLastChart = true,
    enableSeparateDrawingsStorage = true,
    widgetId,
    initialLayoutId = null,
    initialLayoutName = null,
    onLayoutChange,
    showOrders = true,
    showTransactions = true,
    showPastOrders = true,
    showSignals = true,
    toolbarDropdown,
    initialTimeframe,
    useCb,
    datafeed,
    // ... other props
  } = props;
  const coreChartRef = useRef<TradingViewChartCoreRef>(null);
  const availableSymbolsRef = useRef<Symbols[]>([]);
  const [isChartReady, setIsChartReady] = useState(false);
  const [isBarsReady, setIsBarsReady] = useState(false);

  // Custom indicators close over a callback at widget-init time; keep the
  // latest `useCb` reachable via a ref so the closure always sees the
  // current consumer without re-initializing the widget. The wrapper
  // also filters to only forward values for indicators that opted in
  // via `useCallback: true` on their chart config (mirrors legacy).
  const useCbRef = useRef<typeof useCb>(useCb);
  useEffect(() => {
    useCbRef.current = useCb;
  }, [useCb]);
  const indicatorValueCallback = useMemo(
    () => (value: number, id: string) => {
      const cb = useCbRef.current;
      if (!cb) return;
      if (!Number.isFinite(value)) return;
      const match = currentStateRef.current.indicators.find(
        (i) => i.uuid === id
      );
      if (!match || !match.useCallback) return;
      cb(value, id);
    },
    []
  );

  // Keep track of current state to compare with new props
  const currentStateRef = useRef<{
    symbol: string;
    interval: string;
    orders: ChartOrderLine[];
    transactions: Array<TransactionChart & { entity?: EntityId | null }>;
    indicators: ChartIndicatorsConfig;
    position: PositionChart | null;
    orderDrawings: ChartOrderDrawing[];
    pastEntries: IndicatorsEvents[];
    avgPrices: AvgPrice[];
  }>({
    symbol: '',
    interval: '',
    orders: [],
    transactions: [],
    indicators: [],
    position: null,
    orderDrawings: [],
    pastEntries: [],
    avgPrices: [],
  });

  // Keep track of order line IDs
  const orderLineIdsRef = useRef<Map<string, string>>(new Map());
  const indicatorHashRef = useRef<string>('[]');
  const indicatorUpdateFrameRef = useRef<number | null>(null);
  const indicatorUpdateTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const INDICATOR_UPDATE_DEBOUNCE_MS = 80;

  const chartIndicatorConfigs = useMemo<ChartIndicatorsConfig>(() => {
    return indicators ?? [];
  }, [indicators]);

  const nextIndicatorHash = useMemo(
    () => JSON.stringify(chartIndicatorConfigs),
    [chartIndicatorConfigs]
  );

  useEffect(() => {
    const symbolsToRegister = availableSymbols ?? [];
    availableSymbolsRef.current = symbolsToRegister;
    // A custom datafeed is self-contained; never mutate the shared live
    // global symbol state from a chart that doesn't use it.
    if (datafeed) return;
    logger.info('availableSymbols in TVChart', {
      availableSymbols: symbolsToRegister,
    });
    if (symbolsToRegister.length) {
      setAvailableSymbols(symbolsToRegister);
    }
  }, [availableSymbols, datafeed]);

  useEffect(() => {
    if (datafeed) return; // custom datafeed: don't touch live global symbol state
    if (!symbol) return;
    const sourceSymbols = availableSymbols ?? availableSymbolsRef.current;
    const resolvedSymbol = buildSymbolFromFullName(symbol, sourceSymbols);
    setCurrentSymbol(resolvedSymbol);
  }, [symbol, availableSymbols, datafeed]);

  const handleChartReady = useCallback(() => {
    setIsChartReady(true);
    logger.info('TradingView chart wrapper ready');
  }, []);

  const handleRangeChanged = useCallback(
    (range?: { from: number; to: number }) => {
      logger.debug('[ScrollLoadBars] handleRangeChanged called', {
        range: range
          ? {
              from: new Date(range.from * 1000).toISOString(),
              to: new Date(range.to * 1000).toISOString(),
            }
          : null,
        isBarsReady,
        symbol,
        interval,
      });

      if (!isBarsReady) {
        setIsBarsReady(true);
      }

      if (!range) {
        logger.debug('[ScrollLoadBars] No range provided, skipping prefetch');
        return;
      }

      // The prefetcher is for the shared exchange (core) datafeed only. A
      // chart driven by a custom datafeed handles its own history loading;
      // routing through maybePrefetchHistory would hit the wrong handler.
      if (datafeed) return;

      const fallbackSymbol = availableSymbolsRef.current.length
        ? `${availableSymbolsRef.current[0].pair}@${String(availableSymbolsRef.current[0].exchange).toUpperCase()}`
        : null;

      const activeSymbolId =
        currentStateRef.current.symbol || symbol || fallbackSymbol;
      if (!activeSymbolId) {
        logger.warn('[ScrollLoadBars] No active symbol ID, skipping prefetch');
        return;
      }

      const symbolMeta = buildSymbolFromFullName(
        activeSymbolId,
        availableSymbolsRef.current
      );

      const resolutionValue =
        currentStateRef.current.interval || interval || '60';

      logger.info('[ScrollLoadBars] Calling maybePrefetchHistory', {
        symbolId: activeSymbolId,
        exchange: symbolMeta.exchange,
        resolution: resolutionValue,
      });

      void maybePrefetchHistory({
        symbolId: activeSymbolId,
        symbolMeta,
        resolution: resolutionValue,
        range,
      });
    },
    [interval, isBarsReady, symbol, datafeed]
  ); // Helpers to force re-apply props to the chart
  const reapplyOrders = useCallback(() => {
    if (!coreChartRef.current?.isReady()) return;

    if (!showOrders) {
      coreChartRef.current.clearAllOrderLines();
      orderLineIdsRef.current.clear();
      currentStateRef.current.orders = [];
      logger.info('Order overlay hidden');
      return;
    }

    const newOrders = orders || [];
    const currentOrders = currentStateRef.current.orders || [];

    // Field-level comparison matching main-dash: compare only chart-relevant
    // fields (price, side, qty, label, color) to avoid false positives from
    // extra properties spread onto the order objects.
    const orderKey = (o: ChartOrderLine) =>
      `${o.price}|${o.side}|${o.qty}|${o.label ?? ''}|${o.color ?? ''}|${o.greyLabel ?? ''}`;

    const newKeys = newOrders.map(orderKey);
    const currentKeys = currentOrders.map(orderKey);
    const hasNewOrders = newKeys.some((k) => !currentKeys.includes(k));
    const hasCancelledOrders = currentKeys.some((k) => !newKeys.includes(k));

    if (
      !hasNewOrders &&
      !hasCancelledOrders &&
      newOrders.length === currentOrders.length
    ) {
      return;
    }

    coreChartRef.current.clearAllOrderLines();
    orderLineIdsRef.current.clear();

    // Sort grey/smart orders first (lower z-index) matching main-dash:
    // grey lines render first so active BUY/SELL lines appear on top.
    const isGreyOrder = (o: ChartOrderLine) =>
      o.color != null ||
      o.side?.toUpperCase() === 'GREY' ||
      o.side?.toUpperCase() === 'NEUTRAL';

    const sorted = [...newOrders].sort((a, b) => {
      const aGrey = isGreyOrder(a);
      const bGrey = isGreyOrder(b);
      if (aGrey === bGrey) return b.price - a.price;
      return aGrey ? -1 : 1;
    });

    sorted.forEach((order) => {
      const lineId = coreChartRef.current?.addOrderLine(order);
      if (lineId) {
        const orderId = `order_${order.price}_${order.side}`;
        orderLineIdsRef.current.set(orderId, lineId);
      }
    });
    // Always store the full incoming orders so the next comparison is
    // against what we were ASKED to render, not what succeeded.
    // Lines are now registered before configuration (in createOrderLine),
    // so they can always be cleaned up.
    currentStateRef.current.orders = [...newOrders];
  }, [orders, showOrders]);

  useEffect(() => {
    reapplyOrders();
  }, [reapplyOrders]);

  // When orders / drawings / signals / avg-price lines / transactions
  // arrive BEFORE the TradingView widget finishes initializing, each
  // reapply callback bails on the `coreChartRef.current?.isReady()`
  // guard and the data is silently dropped. Without this effect the
  // first time the overlays render is whenever the prop changes again
  // (e.g. user edits the form). Re-run them all once when the chart
  // flips to ready so preloaded grid lines / orders / avg-price lines
  // appear on the initial paint.
  useEffect(() => {
    if (!isChartReady) return;
    reapplyOrders();
    reapplyOrderDrawings();
    reapplyPastEntries();
    reapplyAvgPriceLines();
    reapplyTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChartReady]);

  const reapplyOrderDrawings = useCallback(() => {
    if (!coreChartRef.current?.isReady()) return;

    if (!showPastOrders) {
      coreChartRef.current.updateOrderDrawings([]);
      currentStateRef.current.orderDrawings = [];
      logger.debug('[TradingViewChart Wrapper] Past order drawings hidden');
      return;
    }

    const drawings = ordersForDrawing || [];
    const currentDrawings = currentStateRef.current.orderDrawings || [];

    if (JSON.stringify(drawings) === JSON.stringify(currentDrawings)) {
      return;
    }

    logger.debug('[TradingViewChart Wrapper] Updating order drawings', {
      drawingsCount: drawings.length,
      drawings: drawings.map((d) => ({
        side: d.side,
        startTime: new Date(Number(d.startTime)).toISOString(),
        endTime: new Date(Number(d.endTime)).toISOString(),
        price: d.price,
      })),
    });

    coreChartRef.current.updateOrderDrawings(drawings);
    currentStateRef.current.orderDrawings = drawings;
    logger.debug(
      '[TradingViewChart Wrapper] Order drawings re-applied to chart'
    );
  }, [ordersForDrawing, showPastOrders]);

  const reapplyPastEntries = useCallback(() => {
    if (!coreChartRef.current?.isReady()) return;

    if (!showSignals) {
      coreChartRef.current.updatePastEntries([]);
      currentStateRef.current.pastEntries = [];
      logger.debug('Signal overlay hidden');
      return;
    }

    const entries = pastEntries || [];
    const currentEntries = currentStateRef.current.pastEntries || [];
    if (JSON.stringify(entries) === JSON.stringify(currentEntries)) {
      return;
    }

    coreChartRef.current.updatePastEntries(entries);
    currentStateRef.current.pastEntries = entries;
    logger.debug('Past entries re-applied to chart');
  }, [pastEntries, showSignals]);

  const reapplyAvgPriceLines = useCallback(() => {
    if (!coreChartRef.current?.isReady()) return;
    const averages = avgPrice || [];
    coreChartRef.current.updateAveragePriceLines(averages);
    currentStateRef.current.avgPrices = averages;
  }, [avgPrice]);

  const reapplyTransactions = useCallback(() => {
    if (!coreChartRef.current?.isReady()) return;

    if (!showTransactions) {
      coreChartRef.current.updateTransactions([]);
      currentStateRef.current.transactions = [];
      logger.debug('Transaction overlay hidden');
      return;
    }

    const newTransactions = transactions || [];
    const currentTransactions = currentStateRef.current.transactions || [];

    const newStringified = JSON.stringify(newTransactions);
    const currentStringified = JSON.stringify(currentTransactions);

    if (newStringified === currentStringified) {
      // Content is identical, skip reapplication
      return;
    }

    // Content changed — hand the full set to the core, which plots only the
    // transactions in the visible range (and re-filters on pan/zoom). See
    // renderTransactions in TradingViewChartCore (bug #9).
    coreChartRef.current.updateTransactions(newTransactions);
    currentStateRef.current.transactions = newTransactions;
    // Only log when actually applying, not on skipped updates
    // logger.debug('Transactions re-applied to chart', {
    //   count: newTransactions.length,
    //   changed: newStringified !== currentStringified
    // });
  }, [showTransactions, transactions]);

  // Wrap onLayoutChange to reapply all overlays after a layout is loaded/changed.
  // Loading a saved layout clears all programmatic shapes (transactions, orders, etc.)
  const handleLayoutChange = useCallback(
    (layout: { id: string; name?: string | null } | null) => {
      logger.info('[TradingViewChart] Layout changed, reapplying overlays', {
        layoutId: layout?.id,
        layoutName: layout?.name,
      });

      // Clear current state so reapply functions don't skip due to "no change" detection
      currentStateRef.current.transactions = [];
      currentStateRef.current.orders = [];
      currentStateRef.current.orderDrawings = [];
      currentStateRef.current.pastEntries = [];
      currentStateRef.current.avgPrices = [];

      // Reapply all overlays after a short delay to let the layout finish rendering
      setTimeout(() => {
        reapplyTransactions();
        reapplyOrders();
        reapplyOrderDrawings();
        reapplyPastEntries();
        reapplyAvgPriceLines();
      }, 300);

      // Forward to external handler
      onLayoutChange?.(layout);
    },
    [
      onLayoutChange,
      reapplyTransactions,
      reapplyOrders,
      reapplyOrderDrawings,
      reapplyPastEntries,
      reapplyAvgPriceLines,
    ]
  );

  // Expose high-level methods through ref
  useImperativeHandle(
    ref,
    () => ({
      getWidget: () => coreChartRef.current?.getWidget() || null,
      isReady: () => isChartReady && coreChartRef.current?.isReady() === true,
      getCoreRef: () => coreChartRef.current,
      centerAtTimestampMs: (timestampMs: number) => {
        if (coreChartRef.current?.isReady()) {
          coreChartRef.current.centerAtTimestampMs(timestampMs);
        }
      },

      updateSymbol: (newSymbol: Symbols) => {
        if (coreChartRef.current?.isReady()) {
          coreChartRef.current.updateSymbol(newSymbol.pair);
          currentStateRef.current.symbol = newSymbol.pair;
          logger.info('Symbol updated via wrapper:', newSymbol.pair);
        }
      },

      updateInterval: (interval: string) => {
        if (coreChartRef.current?.isReady()) {
          coreChartRef.current.updateInterval(interval);
          logger.info('Interval updated via wrapper:', interval);
        }
      },

      addOrder: (order: ChartOrderLine) => {
        if (coreChartRef.current?.isReady()) {
          const lineId = coreChartRef.current.addOrderLine(order);
          if (lineId) {
            // Use order price and side as stable ID since ChartOrderLine doesn't have id property
            const orderId = `order_${order.price}_${order.side}`;
            orderLineIdsRef.current.set(orderId, lineId);
            logger.info('Order added via wrapper:', { orderId, lineId });
          }
        }
      },

      removeOrder: (orderId: string) => {
        if (coreChartRef.current?.isReady()) {
          const lineId = orderLineIdsRef.current.get(orderId);
          if (lineId) {
            coreChartRef.current.removeOrderLine(lineId);
            orderLineIdsRef.current.delete(orderId);
            logger.info('Order removed via wrapper:', { orderId, lineId });
          }
        }
      },
    }),
    [isChartReady]
  );

  // Effect to handle symbol changes
  useEffect(() => {
    if (!isChartReady || !coreChartRef.current) return;

    // Validate symbol type and content
    if (!symbol || typeof symbol !== 'string' || symbol.trim() === '') {
      logger.warn('Skipping symbol update - symbol is invalid', {
        symbol,
        symbolType: typeof symbol,
        widgetId: widgetId || 'unknown',
      });
      return;
    }

    const newSymbol = symbol;
    const currentSymbol = currentStateRef.current.symbol;

    // Don't update if symbols are effectively the same. Use a loose
    // comparison so TradingView's own case/colon normalization of the
    // symbol (HIP-3 pairs like `flx:CRCL-USDH` get reported back as
    // `FLX_CRCL-USDH`) doesn't trigger another setSymbol -> resolveSymbol
    // round-trip that loops the main thread.
    const normalize = (s: string | null | undefined): string =>
      (s ?? '').replace(/:/g, '_').toLowerCase();
    if (normalize(newSymbol) === normalize(currentSymbol)) {
      return;
    }

    logger.debug('Symbol prop changed, updating chart:', {
      from: currentSymbol,
      to: newSymbol,
      widgetId: widgetId || 'unknown',
    });
    coreChartRef.current.updateSymbol(newSymbol);
    currentStateRef.current.symbol = newSymbol;
    // Changing symbol can clear drawings; reapply overlays
    reapplyOrders();
    reapplyTransactions();
    reapplyOrderDrawings();
    reapplyPastEntries();
    reapplyAvgPriceLines();
  }, [
    symbol,
    isChartReady,
    widgetId,
    reapplyOrders,
    reapplyTransactions,
    reapplyOrderDrawings,
    reapplyPastEntries,
    reapplyAvgPriceLines,
  ]);

  // Effect to handle interval changes
  useEffect(() => {
    if (!isChartReady || !coreChartRef.current) return;

    const newInterval = interval;
    const currentInterval = currentStateRef.current.interval;

    if (newInterval !== currentInterval) {
      logger.debug('Interval prop changed, updating chart:', {
        from: currentInterval,
        to: newInterval,
      });
      coreChartRef.current.updateInterval(newInterval);
      currentStateRef.current.interval = newInterval;
      // Some interval changes may refresh the pane; ensure overlays are present
      reapplyOrders();
      reapplyTransactions();
      reapplyOrderDrawings();
      reapplyPastEntries();
      reapplyAvgPriceLines();
    }
  }, [
    interval,
    isChartReady,
    reapplyOrders,
    reapplyTransactions,
    reapplyOrderDrawings,
    reapplyPastEntries,
    reapplyAvgPriceLines,
  ]);

  // Effect to handle orders toggles/data
  useEffect(() => {
    if (!isChartReady) return;
    reapplyOrders();
  }, [isChartReady, reapplyOrders]);

  // Effect to handle transactions
  useEffect(() => {
    if (!isChartReady) return;
    reapplyTransactions();
  }, [isChartReady, reapplyTransactions]);

  // Effect to handle order drawings overlays
  useEffect(() => {
    if (!isChartReady) return;
    reapplyOrderDrawings();
  }, [isChartReady, reapplyOrderDrawings]);

  // Effect to handle past entries overlays
  useEffect(() => {
    if (!isChartReady) return;
    reapplyPastEntries();
  }, [isChartReady, reapplyPastEntries]);

  // Effect to handle average price lines overlays
  useEffect(() => {
    if (!isChartReady) return;
    reapplyAvgPriceLines();
  }, [isChartReady, reapplyAvgPriceLines]);

  // Effect to handle indicators changes
  const clearScheduledIndicatorUpdate = useCallback(() => {
    if (
      indicatorUpdateFrameRef.current !== null &&
      typeof cancelAnimationFrame === 'function'
    ) {
      cancelAnimationFrame(indicatorUpdateFrameRef.current);
      indicatorUpdateFrameRef.current = null;
    }

    if (indicatorUpdateTimeoutRef.current !== null) {
      clearTimeout(indicatorUpdateTimeoutRef.current);
      indicatorUpdateTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isChartReady || !coreChartRef.current) {
      return undefined;
    }

    if (nextIndicatorHash === indicatorHashRef.current) {
      return undefined;
    }

    clearScheduledIndicatorUpdate();

    const applyIndicators = () => {
      clearScheduledIndicatorUpdate();

      if (!coreChartRef.current?.isReady()) {
        return;
      }

      logger.info('Indicators prop changed, updating chart', {
        count: chartIndicatorConfigs.length,
      });

      void coreChartRef.current.updateIndicators(chartIndicatorConfigs);
      currentStateRef.current.indicators = chartIndicatorConfigs;
      indicatorHashRef.current = nextIndicatorHash;
    };

    indicatorUpdateTimeoutRef.current = setTimeout(() => {
      indicatorUpdateTimeoutRef.current = null;

      if (typeof requestAnimationFrame === 'function') {
        indicatorUpdateFrameRef.current =
          requestAnimationFrame(applyIndicators);
      } else {
        applyIndicators();
      }
    }, INDICATOR_UPDATE_DEBOUNCE_MS);

    return () => {
      clearScheduledIndicatorUpdate();
    };
  }, [
    chartIndicatorConfigs,
    clearScheduledIndicatorUpdate,
    isChartReady,
    nextIndicatorHash,
  ]);

  useEffect(
    () => () => {
      clearScheduledIndicatorUpdate();
    },
    [clearScheduledIndicatorUpdate]
  );

  // Effect to handle position changes
  useEffect(() => {
    if (!isChartReady || !coreChartRef.current) return;

    if (
      JSON.stringify(position) !==
      JSON.stringify(currentStateRef.current.position)
    ) {
      logger.debug('Position prop changed, updating chart');
      // Implement position visualization logic here
      currentStateRef.current.position = position || null;
    }
  }, [position, isChartReady]);

  // When the chart first becomes ready, force-apply current props once
  useEffect(() => {
    if (!isBarsReady || !isChartReady || !coreChartRef.current) return;

    // Ensure symbol/interval are set (in case load_last_chart overrode)
    const newSymbol = symbol || '';

    // Validate before updating to prevent null/empty symbol errors
    if (
      newSymbol &&
      newSymbol.trim() !== '' &&
      newSymbol !== currentStateRef.current.symbol
    ) {
      logger.info('Setting initial symbol on chart ready:', {
        newSymbol,
        currentSymbol: currentStateRef.current.symbol,
        widgetId: widgetId || 'unknown',
      });
      coreChartRef.current.updateSymbol(newSymbol);
      currentStateRef.current.symbol = newSymbol;
    }

    const newInterval = interval;
    if (newInterval && newInterval !== currentStateRef.current.interval) {
      coreChartRef.current.updateInterval(newInterval);
      currentStateRef.current.interval = newInterval;
    }
    // Always reapply overlays on first ready to avoid race conditions
    reapplyOrders();
    reapplyTransactions();
    reapplyOrderDrawings();
    reapplyPastEntries();
    reapplyAvgPriceLines();
  }, [
    isChartReady,
    symbol,
    interval,
    widgetId,
    reapplyOrders,
    reapplyTransactions,
    reapplyOrderDrawings,
    reapplyPastEntries,
    reapplyAvgPriceLines,
    isBarsReady,
  ]);

  // Ensure we always have a valid symbol to pass to the renderer
  const safeInitialSymbol = useMemo(() => {
    if (symbol && typeof symbol === 'string' && symbol.trim() !== '') {
      return symbol;
    }
    return 'BTCUSDT@BINANCE';
  }, [symbol]);

  const onSymbolChange = useCallback(
    (fullSymbol: string) => {
      // A custom datafeed is self-contained; don't write the shared live
      // global symbol state when the embedded widget reports a change.
      if (datafeed) {
        const symbolObj = buildSymbolFromFullName(
          fullSymbol,
          availableSymbolsRef.current
        );
        currentStateRef.current.symbol = fullSymbol;
        if (setOnChangeSymbol) {
          setOnChangeSymbol(symbolObj);
        }
        return;
      }
      // TradingView normalizes our HIP-3 ticker (`flx:CRCL-USDH` →
      // `FLX_CRCL-USDH`) internally and reports the normalized form
      // back here. If it's just a renamed copy of what we already set,
      // skip — overwriting the global `currentSymbol` with the
      // sanitized form would corrupt the candles URL (the backend
      // wants the original `:`-bearing pair).
      const lastSentSymbol = currentStateRef.current.symbol;
      const normalize = (s: string | null | undefined): string =>
        (s ?? '').replace(/:/g, '_').toLowerCase();
      if (
        lastSentSymbol &&
        normalize(fullSymbol) === normalize(lastSentSymbol)
      ) {
        return;
      }

      const symbolObj = buildSymbolFromFullName(
        fullSymbol,
        availableSymbolsRef.current
      );

      logger.info('Symbol changed in TradingView:', {
        fullSymbol,
        symbolObj,
      });

      setCurrentSymbol(symbolObj);
      if (setOnChangeSymbol) {
        setOnChangeSymbol(symbolObj);
      }
    },
    [setOnChangeSymbol, datafeed]
  );

  return (
    <TradingViewWidgetRenderer
      ref={coreChartRef}
      initialSymbol={safeInitialSymbol}
      initialInterval={interval}
      onChartReady={handleChartReady}
      onVisibleRange={handleRangeChanged}
      enableAutoSave={enableAutoSave}
      enableLoadLastChart={enableLoadLastChart}
      enableSeparateDrawingsStorage={enableSeparateDrawingsStorage}
      initialLayoutId={initialLayoutId}
      initialLayoutName={initialLayoutName}
      toolbarDropdown={toolbarDropdown ?? null}
      initialTimeframe={initialTimeframe}
      indicatorValueCallback={indicatorValueCallback}
      {...(datafeed ? { datafeed } : {})}
      {...(widgetId ? { layoutPersistenceKey: widgetId } : {})}
      onLayoutChange={handleLayoutChange}
      onSymbolChange={onSymbolChange}
      {...(onIntervalChange && { onIntervalChange })}
    />
  );
});

TradingViewChartComponent.displayName = 'TradingViewChart';

// Wrap with React.memo to prevent unnecessary re-renders when props haven't changed
const TradingViewChart = React.memo(TradingViewChartComponent);

export default TradingViewChart;
