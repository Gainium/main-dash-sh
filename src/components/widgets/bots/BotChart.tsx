import type { PanelMenuConfig } from '@/components/bots/panels/PanelContainer';
import { useOptionalGridPageContext } from '@/contexts/bots/grid/GridPageProvider';
import { riskRewardRuntimeStore } from '@/contexts/bots/dca/RiskRewardRuntimeContext';
import {
  useExampleOrdersStore,
  useIndicatorStore,
} from '@/contexts/bots/form/formStoreContexts';
import { riskRewardPositionStore } from '@/stores/riskRewardPositionStore';
import { IndicatorEnum } from '@/types';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useMarketData } from '../../../hooks/useMarketData';
import {
  useWidgetSettings,
  type ChartWidgetSettings,
} from '../../../hooks/useWidgetSettings';
import {
  type AvgPrice,
  type ChartOrderDrawing,
  type ChartOrderLine,
  type ChartIndicatorsConfig,
  type IndicatorsEvents,
  type PositionChart,
  type Symbols,
  type TransactionChart,
  type DCAGrid,
} from '../../../types';
import WidgetWrapper, { type WidgetMenuActions } from '../WidgetWrapper';
import TradingViewChart, {
  type TradingViewChartRef,
} from '../shared/TradingViewChart/TradingViewChart';
import type { TradingViewToolbarDropdownConfig } from '../shared/TradingViewChart/types';
import {
  useBotChartDisplayOptions,
  type BotChartDisplayOptionsResult,
} from './hooks/useBotChartDisplayOptions';
import { isTokenizedStockPair, normalizePairKey } from '@/utils/pairs';
import { useOrderStore } from '@/stores/live';

const DEFAULT_SYMBOL = 'BTCUSDT';
const DEFAULT_EXCHANGE = 'binance';

const getString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

interface ParsedSymbolParts {
  pair?: string;
  exchange?: string;
}

// Two symbol formats coexist:
//   • TradingView: `EXCHANGE:SYMBOL`   (e.g. `BINANCE:BTCUSDT`)
//   • Internal:    `pair@exchange`     (e.g. `BTCUSDT@binance`)
// Hyperliquid HIP-3 builder-perp pairs include `:` legitimately
// (`xyz:SP500`, `flx:GOLD-USDH`); blindly splitting on `:` misreads
// the lowercase dex prefix as an exchange and breaks the chart + every
// downstream pair-keyed lookup. Disambiguate:
//   • If the input has `@`, anything before it is the pair (colons OK).
//   • If the input has `:` but no `@`, treat as TV format ONLY when the
//     prefix is fully uppercase A-Z (TV convention). Lowercase dex
//     prefixes flow through as part of the pair.
const TV_EXCHANGE_PREFIX = /^[A-Z][A-Z0-9_]*$/;

const parseSymbolParts = (input?: string): ParsedSymbolParts => {
  if (!input) {
    return {};
  }

  let working = input.trim();
  if (!working) {
    return {};
  }

  let exchange: string | undefined;

  if (working.includes('@')) {
    // Internal `pair@exchange` form. Split on the LAST `@` so a pair
    // that ever contained `@` still works; treat everything before as
    // the pair (colons inside it are part of the pair).
    const atIdx = working.lastIndexOf('@');
    const suffix = working.slice(atIdx + 1);
    const main = working.slice(0, atIdx);
    if (suffix) {
      exchange = suffix;
    }
    working = main;
  } else if (working.includes(':')) {
    // TradingView `EXCHANGE:SYMBOL` form — gate strictly on uppercase
    // prefix so `xyz:SP500` doesn't trip this branch.
    const colonIdx = working.indexOf(':');
    const maybeExchange = working.slice(0, colonIdx);
    const remaining = working.slice(colonIdx + 1);
    if (remaining && TV_EXCHANGE_PREFIX.test(maybeExchange)) {
      exchange = maybeExchange;
      working = remaining;
    }
  }

  // Preserve the pair's original case. HIP-3 dex prefixes are lowercase;
  // uppercasing here yields an ambiguous string that the round-trip
  // parser would later mistake for a TV prefix.
  const pair = working.replace(/[\s/\\]/g, '');
  const normalizedExchange = exchange?.replace(/[\s/\\]/g, '').toLowerCase();

  const result: ParsedSymbolParts = {};
  if (pair) {
    result.pair = pair;
  }
  if (normalizedExchange) {
    result.exchange = normalizedExchange;
  }

  return result;
};

// Preserve the original case for pairs that contain a `:` (HIP-3
// builder-perp prefixes like `xyz:SP500` are lowercase by upstream
// convention); uppercase regular pairs so legacy `btcusdt` inputs
// still produce `BTCUSDT`.
const normalizePairCase = (pair: string): string =>
  pair.includes(':') || isTokenizedStockPair(pair) ? pair : pair.toUpperCase();

// Symbol-string equality that ignores case AND treats `:`/`_` as
// equivalent. TradingView normalizes our HIP-3 ticker (`flx:CRCL-USDH`
// → `FLX_CRCL-USDH`) and reports the normalized form back through its
// `onSymbolChanged` listener; without this loosened comparison, the
// BotChart→TV→onSymbolChanged→setChartSymbol round-trip mutates the
// state each tick and we end up oscillating between the two cases,
// re-asking resolveSymbol indefinitely (Chrome page-unresponsive).
const chartSymbolsEquivalent = (a: string, b: string): boolean => {
  const normalize = (s: string) => s.replace(/:/g, '_').toLowerCase();
  return normalize(a) === normalize(b);
};

const buildChartSymbol = (
  input?: string,
  fallbackExchange: string = DEFAULT_EXCHANGE
): string => {
  const parts = parseSymbolParts(input);
  const resolvedPair = normalizePairCase(parts.pair ?? DEFAULT_SYMBOL);
  const resolvedExchange = (parts.exchange ?? fallbackExchange).toLowerCase();
  return `${resolvedPair}@${resolvedExchange}`;
};

const parseChartSymbol = (
  symbol: string
): { pair: string; exchange: string } => {
  const parts = parseSymbolParts(symbol);
  return {
    pair: normalizePairCase(parts.pair ?? DEFAULT_SYMBOL),
    exchange: (parts.exchange ?? DEFAULT_EXCHANGE).toLowerCase(),
  };
};

const formatSymbolFromObject = (symbol: Symbols): string => {
  const pair = symbol.pair ? normalizePairCase(symbol.pair) : DEFAULT_SYMBOL;
  const exchange = String(symbol.exchange ?? DEFAULT_EXCHANGE).toLowerCase();
  return `${pair}@${exchange}`;
};

const pickFirstArray = <T,>(...candidates: Array<unknown>): T[] => {
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate as T[];
    }
  }
  return [];
};

const isPositionChart = (value: unknown): value is PositionChart => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['entryPrice'] === 'number' &&
    typeof candidate['profitPrice'] === 'number' &&
    typeof candidate['stopPrice'] === 'number' &&
    typeof candidate['side'] === 'string'
  );
};

const formatIntervalLabel = (interval?: string): string => {
  if (!interval) {
    return '60';
  }

  const normalized = interval.toUpperCase();
  const mapping: Record<string, string> = {
    '1': '1m',
    '3': '3m',
    '5': '5m',
    '15': '15m',
    '30': '30m',
    '45': '45m',
    '60': '1h',
    '120': '2h',
    '240': '4h',
    '720': '12h',
    '1D': '1D',
    '1W': '1W',
    '1M': '1M',
  };

  return mapping[normalized] ?? interval;
};

const EMPTY_CHART_ORDER_LINES: ChartOrderLine[] = [];
const EMPTY_CHART_ORDER_DRAWINGS: ChartOrderDrawing[] = [];
const EMPTY_TRANSACTIONS: TransactionChart[] = [];
const EMPTY_INDICATOR_EVENTS: IndicatorsEvents[] = [];
const EMPTY_AVG_PRICE_LINES: AvgPrice[] = [];

export interface BotChartWidgetSettings extends ChartWidgetSettings {
  symbol: string;
  interval: string;
  showOrders: boolean;
  showTransactions: boolean;
  showPastOrders: boolean;
  showSignals: boolean;
  showDealOrders: boolean;
}

export interface BotChartProps {
  widgetId?: string;
  isEditable?: boolean;
  onCollapse?: (widgetId: string, collapsed: boolean) => void;
  onTabMove?: (
    fromTabId: string,
    toWidgetId: string,
    toTabIndex: number
  ) => void;
  menuActions?: WidgetMenuActions;
  data?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  symbol?: string;
  interval?: string;
  buyPrice?: number;
  onBuyPriceChange?: (price: number) => void;
  availableSymbols?: Symbols[];
  onSymbolChange?: (symbol: string) => void;
  variant?: 'widget' | 'panel';
  className?: string;
  onPanelMenuChange?: (menu: PanelMenuConfig | null) => void;
  displayOptions?: BotChartDisplayOptionsResult;
  ref?: React.RefObject<TradingViewChartRef | null>;
}

const BotChart: React.FC<BotChartProps> = ({
  widgetId = 'bot-chart',
  isEditable = false,
  onCollapse,
  onTabMove,
  menuActions,
  data,
  settings,
  symbol: propSymbol,
  interval: propInterval,
  buyPrice: _propBuyPrice,
  onBuyPriceChange: _onBuyPriceChange,
  availableSymbols,
  onSymbolChange,
  variant = 'widget',
  className,
  onPanelMenuChange,
  displayOptions: displayOptionsOverride,
  ref: chartRef,
}) => {
  // Use the generic widget settings hook with type safety
  const { usePersistedState } =
    useWidgetSettings<BotChartWidgetSettings>(widgetId);

  const gridPageContext = useOptionalGridPageContext();

  const fallbackExchange = useMemo(() => {
    const fromProp = parseSymbolParts(getString(propSymbol)).exchange;
    const fromData = getString(data?.['exchange'])?.toLowerCase();
    const fromSettings = getString(settings?.['exchange'])?.toLowerCase();
    return fromProp ?? fromData ?? fromSettings ?? DEFAULT_EXCHANGE;
  }, [propSymbol, data, settings]);

  // Extract chart configuration from data, settings, and props (props take precedence)
  const initialSymbolInput =
    getString(propSymbol) ??
    getString(data?.['symbol']) ??
    getString(settings?.['symbol']) ??
    DEFAULT_SYMBOL;

  const initialChartSymbol = useMemo(
    () => buildChartSymbol(initialSymbolInput, fallbackExchange),
    [initialSymbolInput, fallbackExchange]
  );

  const defaultInterval =
    getString(propInterval) ??
    getString(data?.['interval']) ??
    getString(settings?.['interval']) ??
    '60';

  const [chartSymbol, setChartSymbol] = usePersistedState(
    'symbol',
    initialChartSymbol
  );
  // Tracks the last symbol we derived from the form props. The prop
  // effect below must react only to genuine form changes — not to
  // TradingView's own re-resolution of the symbol we already applied
  // (e.g. the form's `@hyperliquid` becomes `@hyperliquidLinear` once
  // TV resolves the pair). Without this, the prop effect and TV's
  // `onSymbolChanged` listener overwrite each other every tick and lock
  // the main thread.
  const lastPropSymbolRef = useRef<string>(initialChartSymbol);
  const [interval, setInterval] = usePersistedState(
    'interval',
    defaultInterval
  );

  // The active deal's chart annotation, handed down by the bot page (see
  // useBotPageDealChart). Absent everywhere else, which keeps the terminal /
  // create-bot / grid charts on the form ladder exactly as before.
  const dealChartOrders = useMemo(
    () => pickFirstArray<DCAGrid>(data?.['dealChartOrders']),
    [data]
  );
  const dealChartTransactions = useMemo(
    () => pickFirstArray<TransactionChart>(data?.['dealChartTransactions']),
    [data]
  );
  const dealChartPair = getString(data?.['dealChartPair']);

  const internalDisplayOptions = useBotChartDisplayOptions(widgetId, {
    hasDealOrders: dealChartOrders.length > 0,
  });

  const {
    showOrders,
    showTransactions,
    showPastOrders,
    showSignals,
    showDealOrders,
    toolbarDropdownItems,
  } = displayOptionsOverride ?? internalDisplayOptions;

  const toolbarDropdownConfig =
    useMemo<TradingViewToolbarDropdownConfig | null>(() => {
      if (!toolbarDropdownItems?.length) {
        return null;
      }

      return {
        title: 'Chart',
        tooltip: 'Chart display options',
        useTradingViewStyle: true,
        items: toolbarDropdownItems,
      };
    }, [toolbarDropdownItems]);

  const [indicatorPayload, setIndicatorPayload] =
    useState<ChartIndicatorsConfig>([]);
  const [exampleOrders, setExampleOrders] = useState<DCAGrid[]>([]);
  const [riskPosition, setRiskPosition] = useState<PositionChart | null>(null);

  // Shared globals for regular bots; the leg's isolated instances when this
  // chart is mounted inside an isolateStores BotFormProvider (hedge leg).
  const indicatorStore = useIndicatorStore();
  const exampleOrdersStore = useExampleOrdersStore();

  useEffect(() => {
    const unsubscribe = indicatorStore.subscribe((incoming) => {
      setIndicatorPayload(incoming);
    });

    return () => {
      unsubscribe();
    };
  }, [indicatorStore]);

  // Keep the indicator store's chartInterval in sync with the chart's interval
  useEffect(() => {
    if (interval) {
      indicatorStore.setChartIndicatorsContext({ chartInterval: interval });
    }
  }, [interval, indicatorStore]);

  useEffect(() => {
    const unsubscribe = exampleOrdersStore.subscribe((incoming) => {
      setExampleOrders(incoming);
    });

    return () => {
      unsubscribe();
    };
  }, [exampleOrdersStore]);
  const resolvedBotId = useMemo(() => {
    const candidates = [
      getString(data?.['botId']),
      getString(data?.['bot_id']),
      getString(settings?.['botId']),
      getString(settings?.['bot_id']),
    ];
    const found = candidates.find((candidate) => !!candidate);
    return found ?? '';
  }, [data, settings]);

  useEffect(() => {
    // In terminal/new-bot flows we may not have a bot id yet.
    // In that case, listen to the global Risk:Reward payload (store normalizes empty ids).
    const unsubscribe = riskRewardPositionStore.subscribe(
      resolvedBotId ?? '',
      (position) => {
        setRiskPosition(position);
      }
    );

    return () => {
      unsubscribe();
      setRiskPosition(null);
    };
  }, [resolvedBotId]);

  useEffect(() => {
    const incomingSymbol =
      getString(propSymbol) ??
      getString(data?.['symbol']) ??
      getString(settings?.['symbol']);

    if (!incomingSymbol) {
      return;
    }

    const nextSymbol = buildChartSymbol(incomingSymbol, fallbackExchange);
    // Only react when the form actually produced a different symbol.
    // This effect re-runs whenever `chartSymbol` changes — including when
    // TV reports its own resolved form (`@hyperliquid` → `@hyperliquidLinear`)
    // back through `handleTradingViewSymbolChange`. Re-asserting the stale
    // form value here would bounce the symbol between the two exchange
    // forms forever (chartSymbolsEquivalent collapses case/`:`/`_` but not
    // `hyperliquid` vs `hyperliquidLinear`), locking the main thread.
    if (chartSymbolsEquivalent(nextSymbol, lastPropSymbolRef.current)) {
      return;
    }
    lastPropSymbolRef.current = nextSymbol;
    if (!chartSymbolsEquivalent(nextSymbol, chartSymbol)) {
      setChartSymbol(nextSymbol);
    }
  }, [
    propSymbol,
    data,
    settings,
    fallbackExchange,
    chartSymbol,
    setChartSymbol,
  ]);

  useEffect(() => {
    const incomingInterval =
      getString(propInterval) ??
      getString(data?.['interval']) ??
      getString(settings?.['interval']);

    if (!incomingInterval || incomingInterval === interval) {
      return;
    }

    setInterval(incomingInterval);
  }, [propInterval, data, settings, interval, setInterval]);

  const chartSymbolParts = useMemo(
    () => parseChartSymbol(chartSymbol),
    [chartSymbol]
  );
  const { pair: currentPair, exchange: currentExchange } = chartSymbolParts;

  const { marketData } = useMarketData(currentPair, currentExchange);

  // Draw the running deal's ladder INSTEAD of the form's, not on top of it.
  // The form ladder is projected from the current market price, so on a bot
  // that already has an open deal the two disagree by construction and drawing
  // both puts two competing sets of DCA lines on the chart. The deal's own
  // lines are the truthful answer to "where does this bot buy next"; the
  // toolbar toggle switches back to the settings preview for anyone tuning
  // parameters mid-deal.
  const dealOverlayActive =
    showDealOrders &&
    dealChartOrders.length > 0 &&
    (!dealChartPair ||
      normalizePairKey(currentPair) === normalizePairKey(dealChartPair));

  const rawOrders: ChartOrderLine[] = useMemo(
    () =>
      (dealOverlayActive ? dealChartOrders : exampleOrders)
        .filter((o) => !o.hide && !o.note)
        .map((o) => ({
          ...o,
          side: o.side.toLowerCase(),
          label: o.label ?? o.type,
          greyLabel: o.grey
            ? (o.greyLabel ?? 'Smart order')
            : undefined,
          noLabel: false,
          isDraggable: o.grey ? false : !!o.draggable,
          ...(o.grey ? { color: '#94a3b8' } : {}),
        })),
    [dealOverlayActive, dealChartOrders, exampleOrders]
  );

  const rawOrderDrawings = useMemo(
    () =>
      pickFirstArray<ChartOrderDrawing>(
        data?.['ordersForDrawing'],
        data?.['orderDrawings'],
        settings?.['ordersForDrawing'],
        settings?.['orderDrawings']
      ),
    [data, settings]
  );

  const rawTransactions = useMemo(
    () =>
      pickFirstArray<TransactionChart>(
        data?.['transactions'],
        data?.['trades'],
        settings?.['transactions'],
        settings?.['trades']
      ),
    [data, settings]
  );

  const rawPastEntries = useMemo(
    () =>
      pickFirstArray<IndicatorsEvents>(
        data?.['pastEntries'],
        data?.['signals'],
        settings?.['pastEntries'],
        settings?.['signals']
      ),
    [data, settings]
  );

  const contextBotId =
    gridPageContext?.state.bot?._id ?? gridPageContext?.state.botId ?? null;

  // Live open orders for this grid bot, straight from the socket-fed order
  // store (the `new` bucket holds NEW/PARTIALLY_FILLED orders). As the engine
  // places the grid ladder, each `data update` event adds one order here, so
  // overlaying these on the predicted grid makes real orders appear one-by-one
  // on the chart — matching the legacy dashboard. Scoped to grid pages so other
  // chart consumers (terminal, DCA/combo) are unaffected.
  const liveOrdersBotId = resolvedBotId || contextBotId || '';
  const liveOpenOrdersRecord = useOrderStore((s) =>
    gridPageContext && liveOrdersBotId
      ? s.orders.new[liveOrdersBotId]
      : undefined
  );
  const liveOrderLines: ChartOrderLine[] = useMemo(() => {
    if (!liveOpenOrdersRecord) return EMPTY_CHART_ORDER_LINES;
    const lines: ChartOrderLine[] = [];
    for (const order of Object.values(liveOpenOrdersRecord)) {
      const price = parseFloat(String(order.price));
      const qty = parseFloat(String(order.origQty));
      const side = String(order.side).toLowerCase();
      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(qty)) {
        continue;
      }
      lines.push({
        price,
        side,
        qty,
        label: side === 'buy' ? 'Buy' : 'Sell',
        noLabel: false,
        isDraggable: false,
        lineStyle: 'solid',
      });
    }
    return lines;
  }, [liveOpenOrdersRecord]);

  const contextAvgPriceLines =
    gridPageContext?.state.overlays.avgPrice.lines ?? EMPTY_AVG_PRICE_LINES;

  const shouldUseContextAvgPrice = Boolean(
    contextAvgPriceLines.length &&
    contextBotId &&
    (!resolvedBotId || contextBotId === resolvedBotId)
  );

  const avgPrice = useMemo(() => {
    if (shouldUseContextAvgPrice) {
      return contextAvgPriceLines;
    }

    return pickFirstArray<AvgPrice>(
      data?.['avgPrice'],
      data?.['avgPrices'],
      settings?.['avgPrice'],
      settings?.['avgPrices']
    );
  }, [shouldUseContextAvgPrice, contextAvgPriceLines, data, settings]);

  const dataPosition = useMemo(() => {
    const candidate = (data?.['position'] ?? settings?.['position']) as unknown;
    return isPositionChart(candidate) ? candidate : null;
  }, [data, settings]);

  const position = riskPosition ?? dataPosition ?? null;

  const orders = useMemo(
    () =>
      showOrders
        ? liveOrderLines.length
          ? [...rawOrders, ...liveOrderLines]
          : rawOrders
        : EMPTY_CHART_ORDER_LINES,
    [rawOrders, liveOrderLines, showOrders]
  );

  const orderDrawings = useMemo(
    () => (showPastOrders ? rawOrderDrawings : EMPTY_CHART_ORDER_DRAWINGS),
    [rawOrderDrawings, showPastOrders]
  );

  const transactions = useMemo(() => {
    if (!showTransactions) {
      return EMPTY_TRANSACTIONS;
    }
    // The deal's own fills, so the ladder's grey "next DCA" levels read against
    // the levels the deal has already taken.
    if (dealOverlayActive && dealChartTransactions.length) {
      return rawTransactions.length
        ? [...rawTransactions, ...dealChartTransactions]
        : dealChartTransactions;
    }
    return rawTransactions;
  }, [
    rawTransactions,
    showTransactions,
    dealOverlayActive,
    dealChartTransactions,
  ]);

  const pastEntries = useMemo(
    () => (showSignals ? rawPastEntries : EMPTY_INDICATOR_EVENTS),
    [rawPastEntries, showSignals]
  );

  useEffect(() => {
    if (!onPanelMenuChange) {
      return;
    }

    onPanelMenuChange(null);

    return () => {
      onPanelMenuChange(null);
    };
  }, [onPanelMenuChange]);

  const handleTradingViewSymbolChange = useCallback(
    (nextSymbol: Symbols) => {
      const formatted = formatSymbolFromObject(nextSymbol);
      // Ignore TV's own case/colon normalization of the symbol we
      // already set — see `chartSymbolsEquivalent` for context.
      if (!chartSymbolsEquivalent(formatted, chartSymbol)) {
        setChartSymbol(formatted);
      }
      onSymbolChange?.(nextSymbol.pair);
    },
    [chartSymbol, setChartSymbol, onSymbolChange]
  );

  const handleIntervalChange = useCallback(
    (nextInterval: string) => {
      if (!nextInterval || nextInterval === interval) {
        return;
      }
      setInterval(nextInterval);
      indicatorStore.setChartIndicatorsContext({
        chartInterval: nextInterval,
      });
    },
    [interval, setInterval, indicatorStore]
  );

  const intervalLabel = formatIntervalLabel(interval);
  const hasWidgetOptions = Boolean(
    menuActions?.optionsMenuItems?.length || menuActions?.onOptions
  );

  const containerClassName = `${variant === 'panel' ? 'flex h-full flex-col' : 'flex h-full flex-col bg-background'}${className ? ` ${className}` : ''}`;
  const as = useMemo(() => availableSymbols ?? [], [availableSymbols]);

  // Forward risk-reward indicator values from the chart into the
  // module-scoped RR runtime store so the RR engine can derive a SL
  // distance. The chart's wrapper already filters to indicators with
  // `useCallback: true`; here we additionally route ATR-family values
  // into `atrValue` (the engine multiplies by `atrMultiplier`) and
  // everything else into `stopLossPrice` (a literal price). Mirrors
  // the legacy split where `riskRewardIndicator?.type === atr` switched
  // the computation path.
  // Accumulates the latest raw ATR/ADR value per indicator uuid so the
  // dynamic-AR example-order math (scaled DCA, dynamic-AR TP/SL) can read
  // them. Without this the order engine's `dcaArValues` stays empty and the
  // TP/SL never reflect the indicator value or its Multiplier.
  const dynamicArValuesRef = useRef<Record<string, number>>({});
  const handleIndicatorValue = useCallback(
    (value: number, id: string) => {
      if (!Number.isFinite(value) || value <= 0) return;
      const match = indicatorPayload.find((i) => i.uuid === id);
      const type = match?.type;
      const isAtrFamily =
        type === IndicatorEnum.atr || type === IndicatorEnum.adr;
      riskRewardRuntimeStore.setState(
        isAtrFamily
          ? { atrValue: value, sourceId: id }
          : { stopLossPrice: value, sourceId: id }
      );
      if (isAtrFamily) {
        const prev = dynamicArValuesRef.current[id];
        if (prev !== value) {
          dynamicArValuesRef.current = {
            ...dynamicArValuesRef.current,
            [id]: value,
          };
          exampleOrdersStore.setContext({
            dcaArValues: Object.entries(dynamicArValuesRef.current).map(
              ([arId, arValue]) => ({ id: arId, value: arValue })
            ),
          });
        }
      }
    },
    [indicatorPayload, exampleOrdersStore]
  );
  const chartShell = (
    <div className={containerClassName}>
      <div className="relative flex-1">
        <TradingViewChart
          symbol={chartSymbol}
          interval={interval}
          availableSymbols={as}
          setOnChangeSymbol={handleTradingViewSymbolChange}
          onIntervalChange={handleIntervalChange}
          orders={orders}
          ordersForDrawing={orderDrawings}
          transactions={transactions}
          pastEntries={pastEntries}
          indicators={indicatorPayload}
          position={position}
          avgPrice={avgPrice}
          widgetId={widgetId}
          toolbarDropdown={toolbarDropdownConfig}
          useCb={handleIndicatorValue}
          ref={chartRef}
        />
      </div>
    </div>
  );

  if (variant === 'panel') {
    return chartShell;
  }

  return (
    <WidgetWrapper
      metadata={{
        id: widgetId,
        type: 'bot-chart',
        title: 'Chart',
        hasOptions: hasWidgetOptions,
        value: {
          primary: currentPair,
          secondary: marketData
            ? `$${marketData.currentPrice.toFixed(2)}`
            : intervalLabel,
          ...(marketData && {
            change: {
              value: `${
                marketData.priceChangePercentage24h >= 0 ? '+' : ''
              }${marketData.priceChangePercentage24h.toFixed(2)}%`,
              percentage: marketData.priceChangePercentage24h.toFixed(2),
              isPositive: marketData.priceChangePercentage24h >= 0,
            },
          }),
        },
      }}
      isEditable={isEditable}
      {...(onCollapse && { onCollapse })}
      {...(onTabMove && { onTabMove })}
      {...(menuActions ? { menuActions } : {})}
    >
      {chartShell}
    </WidgetWrapper>
  );
};

export default BotChart;
