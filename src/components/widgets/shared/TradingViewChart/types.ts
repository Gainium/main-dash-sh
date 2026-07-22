// Shared type definitions for the refactored TradingView chart components
import type {
  AvgPrice,
  ChartIndicatorConfig,
  ChartOrderDrawing,
  ChartOrderLine,
  IndicatorsEvents,
  PositionChart,
  TransactionChart,
} from '@/types';

export interface TradingViewDropdownItem {
  title: string;
  /** Optional flag to disable the entry while keeping it visible */
  isDisabled?: boolean;
  onSelect: () => void;
}

export interface TradingViewDropdownHandle {
  remove?: () => void;
  setTitle?: (title: string) => void;
}

export interface TradingViewToolbarDropdownConfig {
  title: string;
  tooltip?: string;
  useTradingViewStyle?: boolean;
  items: TradingViewDropdownItem[];
}

export interface TradingViewWidgetInstance {
  onChartReady: (callback: () => void) => void;
  remove: () => void;
  save: (callback: (state: object) => void) => void;
  load: (state: object) => void;
  headerReady?: () => Promise<void>;
  createDropdown?: (config: {
    title: string;
    tooltip?: string;
    useTradingViewStyle?: boolean;
    items: TradingViewDropdownItem[];
  }) => TradingViewDropdownHandle | undefined;
  loadChartFromServer?: (chartRecord: {
    id: string | number;
    name?: string;
    timestamp?: number;
    symbol?: string;
    resolution?: string;
  }) => Promise<void>;
  onAutoSaveNeeded: (callback: () => void) => void;
  saveChartToServer: (
    onComplete?: (chartId: string) => void,
    onFail?: (error: string) => void,
    saveAsSnapshot?: boolean,
    options?: object
  ) => void;
  customThemes: () => Promise<{
    resetCustomThemes?: () => Promise<void>;
    applyCustomThemes?: (themes: unknown) => Promise<void>;
  }>;
  [key: string]: unknown;
}

export interface TradingViewChartCoreProps {
  initialSymbol?: string;
  initialInterval?: string;
  onChartReady?: () => void;
  onVisibleRange?: (range?: { from: number; to: number }) => void;
  onSymbolChange?: (symbolPair: string) => void;
  onIntervalChange?: (interval: string) => void;
  // Behavior control flags forwarded to widget initializer
  enableAutoSave?: boolean;
  enableLoadLastChart?: boolean;
  enableSeparateDrawingsStorage?: boolean;
  initialLayoutId?: string | null;
  initialLayoutName?: string | null;
  layoutPersistenceKey?: string | undefined;
  onLayoutChange?: (
    layout: { id: string; name?: string | null } | null
  ) => void;
  toolbarDropdown?: TradingViewToolbarDropdownConfig | null;
  // Initial timeframe to show when chart first loads (UNIX timestamps in seconds)
  initialTimeframe?: { from: number; to: number };
  /**
   * Stable callback invoked by custom indicators with `(value, id)` when
   * the source indicator was configured with `useCallback: true`. The
   * callback wired here must be stable (ref-backed) — TradingView's
   * widget closes over it during init and won't pick up new references.
   */
  indicatorValueCallback?: (value: number, id: string) => void;
  /**
   * Optional custom datafeed. Defaults to the shared live createDatafeed()
   * when omitted, so all existing (live) consumers are unaffected.
   */
  datafeed?: import('@/utils/tradingView/types').IBasicDataFeed;
}

export interface OrderLineInstance {
  remove?: () => void;
  setText?: (text: string) => OrderLineInstance;
  setPrice?: (price: number) => OrderLineInstance;
  setQuantity?: (qty: string | number) => OrderLineInstance;
  setLineStyle?: (style: number) => OrderLineInstance;
  setLineLength?: (length: number) => OrderLineInstance;
  setBodyBackgroundColor?: (color: string) => OrderLineInstance;
  setBodyBorderColor?: (color: string) => OrderLineInstance;
  setBodyTextColor?: (color: string) => OrderLineInstance;
  setQuantityTextColor?: (color: string) => OrderLineInstance;
  setQuantityBackgroundColor?: (color: string) => OrderLineInstance;
  setQuantityBorderColor?: (color: string) => OrderLineInstance;
  setTooltip?: (tooltip: string) => OrderLineInstance;
  setModifyTooltip?: (tooltip: string) => OrderLineInstance;
  setCancelTooltip?: (tooltip: string) => OrderLineInstance;
  setModifiable?: (modifiable: boolean) => OrderLineInstance;
  setEditable?: (editable: boolean) => OrderLineInstance;
  setDraggable?: (draggable: boolean) => OrderLineInstance;
  onMove?: (callback: () => void) => OrderLineInstance;
  onModify?: (callback: () => void) => OrderLineInstance;
  onMoving?: (callback: () => void) => OrderLineInstance;
  getPrice?: () => number;
  [key: string]: unknown;
}

export interface TradingViewChartCoreRef {
  getWidget: () => TradingViewWidgetInstance | null;
  getContainerElement: () => HTMLElement | null;
  isReady: () => boolean;
  updateSymbol: (symbolPair: string) => void;
  updateInterval: (interval: string) => void;
  addOrderLine: (order: ChartOrderLine) => string | null;
  removeOrderLine: (lineId: string) => void;
  clearAllOrderLines: () => void;
  addTransaction: (transaction: unknown) => void;
  clearTransactions: () => void;
  updateTransactions: (transactions: unknown[] | null) => void;
  updateIndicators: (
    indicators: ChartIndicatorConfig[] | null | undefined
  ) => Promise<void> | void;
  centerAtTimestampMs: (timestampMs: number, endTimestampMs?: number) => void;
  updateOrderDrawings: (orders: ChartOrderDrawing[] | null) => void;
  updatePastEntries: (entries: IndicatorsEvents[] | null) => void;
  updateAveragePriceLines: (avgPrices: AvgPrice[] | null) => void;
  updatePositionOverlay: (
    position: PositionChart | null,
    options?: { pricePrecision?: number }
  ) => void;
  subscribeClick: (
    callback: (params: { time?: number; price?: number }) => void
  ) => (() => void) | null;
}

export interface ChartInstance {
  createShape?: (point: unknown, options: unknown) => unknown;
  removeEntity?: (entity: unknown) => void;
  [key: string]: unknown;
}

export interface TransactionExtended extends TransactionChart {
  entity?: unknown;
  isCompletedTrade?: boolean;
  entryTime?: number;
  entryPrice?: number;
  exitTime?: number;
  exitPrice?: number;
  takeProfit?: number | undefined;
  stopLoss?: number | undefined;
  originalTakeProfit?: number | undefined;
  originalStopLoss?: number | undefined;
  takeProfitTargets?: Array<{ price: number; percentage: number }>;
  tradeNumber?: number;
  rrRatio?: number;
  pnlPercent?: number;
}
