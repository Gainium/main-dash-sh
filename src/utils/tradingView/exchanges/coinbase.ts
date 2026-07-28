import { ExchangeEnum } from '@/types';
import { toExchangeCandleSymbol } from '@/utils/exchangeUtils';
import type {
  ExchangeHandler,
  ExchangeConfig,
  PaginationLogic,
  LibrarySymbolInfo,
  ResolutionString,
  SubscribeBarsCallback,
  Bar,
  PeriodParams,
} from '../types';

// Coinbase supported resolutions
const COINBASE_RESOLUTIONS = [
  '1',
  '5',
  '15',
  '30',
  '60',
  '120',
  '360',
  '1D',
] as const;

// Coinbase resolution mapping
const COINBASE_RESOLUTION_MAP: Record<string, string> = {
  '1': '1m',
  '5': '5m',
  '15': '15m',
  '30': '30m',
  '60': '1h',
  '120': '2h',
  '360': '6h',
  '1D': '1d',
};

// Coinbase configuration
const config: ExchangeConfig = {
  name: 'coinbase',
  displayName: 'Coinbase',
  supportedResolutions: [...COINBASE_RESOLUTIONS],
  resolutionMap: COINBASE_RESOLUTION_MAP,
  maxLimit: 300,
  // Coinbase doesn't have public WebSocket for klines, we'll use polling
};

// Coinbase pagination logic (ascending order)
const paginationLogic: PaginationLogic = {
  shouldFetchMore: (
    bars: Bar[],
    periodParams: PeriodParams,
    limit: number
  ): boolean => {
    if (bars.length === 0) return false;
    if (bars.length < limit) return false;

    const lastBarTime = bars[bars.length - 1].time;
    const requestedEndTime = periodParams.to * 1000;

    // Coinbase returns data in ascending order, so check if we need more recent data
    if (lastBarTime < requestedEndTime) {
      return true;
    }

    return false;
  },

  getNextParams: (
    bars: Bar[],
    currentParams: PeriodParams
  ): PeriodParams | null => {
    if (bars.length === 0) return null;

    const lastBarTime = bars[bars.length - 1].time;
    const requestedEndTime = currentParams.to * 1000;

    // If we need more recent data
    if (lastBarTime < requestedEndTime) {
      return {
        ...currentParams,
        from: lastBarTime / 1000 + 1,
      };
    }

    return null;
  },
};

// Time interval mapping for polling
const timeIntervalMap: Record<string, number> = {
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '2h': 2 * 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

// Polling subscription management
const pollingTimers: Record<string, NodeJS.Timeout> = {};

// Subscribe using polling (since Coinbase doesn't have public WebSocket for klines)
const subscribe = async (
  symbolInfo: LibrarySymbolInfo,
  resolution: ResolutionString,
  onTick: SubscribeBarsCallback,
  listenerGuid: string
): Promise<void> => {
  try {
    const interval = config.resolutionMap[resolution] || '1m';
    const timerInterval = timeIntervalMap[interval] || 30000; // Default to 30 seconds

    // Clear any existing timer
    if (pollingTimers[listenerGuid]) {
      clearInterval(pollingTimers[listenerGuid]);
    }

    // Set up polling timer
    pollingTimers[listenerGuid] = setInterval(async () => {
      try {
        // Make a request to get the latest candles
        const url = new URL(`${import.meta.env.VITE_API_ENDPOINT}/candles`);
        // Candles are public market data, so the poll deliberately keeps
        // asking the real venue even for paper accounts (paperCoinbase and
        // coinbase are conversion-identical anyway).
        url.searchParams.set('exchange', ExchangeEnum.coinbase);
        // Same dashed-native conversion the `requestCandles` chokepoint
        // applies — Coinbase product ids are dashed ("BTC-USD") and the raw
        // concatenated name comes back "ProductID is invalid", so every 30s
        // poll silently failed and the chart never live-updated.
        url.searchParams.set(
          'symbol',
          toExchangeCandleSymbol(ExchangeEnum.coinbase, symbolInfo.name)
        );
        url.searchParams.set('type', interval);
        url.searchParams.set(
          'startAt',
          (Date.now() - timerInterval).toString()
        );
        url.searchParams.set('endAt', Date.now().toString());
        url.searchParams.set('limit', '1');

        const response = await fetch(url.toString());
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        if (result.status === 'OK' && result.data && result.data.length > 0) {
          const candle = result.data[result.data.length - 1]; // Get the latest candle
          const bar: Bar = {
            time: candle.time,
            open: parseFloat(candle.open),
            high: parseFloat(candle.high),
            low: parseFloat(candle.low),
            close: parseFloat(candle.close),
            volume: parseFloat(candle.volume),
          };
          onTick(bar);
        }
      } catch (error) {
        console.error('Error polling Coinbase data:', error);
      }
    }, 30000); // Poll every 30 seconds
  } catch (error) {
    console.error('Error setting up Coinbase polling:', error);
  }
};

// Unsubscribe from polling
const unsubscribe = (listenerGuid: string): void => {
  const timer = pollingTimers[listenerGuid];
  if (timer) {
    clearInterval(timer);
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete pollingTimers[listenerGuid];
  }
};

// Export Coinbase exchange handler
export const coinbaseHandler: ExchangeHandler = {
  config,
  paginationLogic,
  subscribe,
  unsubscribe,
};
