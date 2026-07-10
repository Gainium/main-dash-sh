// Common types for TradingView datafeed
// These replicate the necessary types from the TradingView charting library

import type { ExchangeEnum } from '@/types';

export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface LibrarySymbolInfo {
  ticker: string;
  name: string;
  full_name: string;
  description: string;
  exchange: string;
  listed_exchange: string;
  type: string;
  currency_code: string;
  session: string;
  timezone: string;
  minmov: number;
  pricescale: number;
  supported_resolutions: ResolutionString[];
  has_intraday: boolean;
  has_daily: boolean;
  has_weekly_and_monthly: boolean;
  data_status: string;
  format: string;
  // Exchange-native symbol identifiers threaded from the resolved `Symbol`
  // (see `Symbol.code` / `Symbol.wsCode`). The WS streamers need these for
  // markets whose realtime feed keys on a non-`pair` id — Kraken spot's
  // `BASE/QUOTE`, Kraken/Hyperliquid futures' `PI_*`/`PF_*` product ids.
  // `resolveSymbol` copies them across; absent for dynamically-built symbols.
  code?: string;
  wsCode?: string;
}

export interface DatafeedConfiguration {
  exchanges: Array<{
    value: string;
    name: string;
    desc: string;
  }>;
  symbols_types: Array<{
    name: string;
    value: string;
  }>;
  supported_resolutions: ResolutionString[];
  supports_marks: boolean;
  supports_timescale_marks: boolean;
  supports_time?: boolean;
}

export interface PeriodParams {
  from: number;
  to: number;
  countBack: number;
  firstDataRequest: boolean;
}

export interface SearchSymbolResultItem {
  symbol: string;
  full_name: string;
  description: string;
  exchange: string;
  ticker: string;
  type: string;
}

export type ResolutionString = string;

export type SearchSymbolsCallback = (symbols: SearchSymbolResultItem[]) => void;
export type ResolveCallback = (symbolInfo: LibrarySymbolInfo) => void;
export type HistoryCallback = (bars: Bar[], meta: { noData: boolean }) => void;
export type ErrorCallback = (reason: string) => void;
export type SubscribeBarsCallback = (bar: Bar) => void;

export interface IBasicDataFeed {
  onReady: (callback: (config: DatafeedConfiguration) => void) => void;
  searchSymbols: (
    userInput: string,
    exchange: string,
    symbolType: string,
    onResult: SearchSymbolsCallback
  ) => void;
  resolveSymbol: (symbolName: string, onResolve: ResolveCallback) => void;
  getBars: (
    symbolInfo: LibrarySymbolInfo,
    resolution: ResolutionString,
    periodParams: PeriodParams,
    onResult: HistoryCallback,
    onError: ErrorCallback
  ) => void;
  subscribeBars: (
    symbolInfo: LibrarySymbolInfo,
    resolution: ResolutionString,
    onTick: SubscribeBarsCallback,
    listenerGuid: string,
    onResetCacheNeededCallback: () => void
  ) => void;
  unsubscribeBars: (listenerGuid: string) => void;
}

// Symbol interface
export interface Symbol {
  symbol?: string; // Optional for backward compatibility
  pair: string;
  exchange: ExchangeEnum;
  baseAsset: {
    minAmount: number;
    maxAmount: number;
    step: number;
    name: string;
  };
  quoteAsset: {
    minAmount: number;
    name: string;
  };
  maxOrders: number;
  priceAssetPrecision: number;
  crossAvailable?: boolean;
  // Exchange-native symbol identifiers — see `TradingPair` for shape.
  // Used by WebSocket streamers that need a non-`pair` symbol form
  // (Kraken spot's `BTC/USDT`, Kraken/Hyperliquid futures `PI_*`).
  code?: string;
  wsCode?: string;
}

// Unified candle response from your API
export interface CandleResponse {
  open: string;
  high: string;
  low: string;
  close: string;
  time: number;
  volume: string;
}

// Exchange configuration interface
export interface ExchangeConfig {
  name: string;
  displayName: string;
  supportedResolutions: ResolutionString[];
  resolutionMap: Record<string, string>;
  maxLimit: number;
  websocketUrl?: string;
  websocketUrls?: {
    spot?: string;
    usdm?: string; // USDT-M futures
    coinm?: string; // COIN-M futures
    linear?: string; // Linear futures
    inverse?: string; // Inverse futures
  };
}

// Pagination logic interface
export interface PaginationLogic {
  shouldFetchMore: (
    bars: Bar[],
    periodParams: PeriodParams,
    limit: number
  ) => boolean;
  getNextParams: (
    bars: Bar[],
    periodParams: PeriodParams
  ) => PeriodParams | null;
}

// Exchange handler interface
export interface ExchangeHandler {
  config: ExchangeConfig;
  paginationLogic: PaginationLogic;
  subscribe: (
    symbolInfo: LibrarySymbolInfo,
    resolution: ResolutionString,
    onTick: SubscribeBarsCallback,
    listenerGuid: string
  ) => Promise<void>;
  unsubscribe: (listenerGuid: string) => void;
}
