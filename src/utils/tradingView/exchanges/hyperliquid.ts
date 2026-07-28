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

// Hyperliquid supported resolutions — the intersection of Hyperliquid's
// candleSnapshot intervals and our backend's `ExchangeIntervals` (no 6h/12h).
const HYPERLIQUID_RESOLUTIONS = [
  '1',
  '3',
  '5',
  '15',
  '30',
  '60',
  '120',
  '240',
  '480',
  '1D',
  '1W',
] as const;

const HYPERLIQUID_RESOLUTION_MAP: Record<string, string> = {
  '1': '1m',
  '3': '3m',
  '5': '5m',
  '15': '15m',
  '30': '30m',
  '60': '1h',
  '120': '2h',
  '240': '4h',
  '480': '8h',
  '1D': '1d',
  '1W': '1w',
};

// Hyperliquid configuration. Before this handler existed the factory fell
// back to `binanceHandler`, whose subscribe opened a BINANCE kline WebSocket
// for the Hyperliquid symbol — and since e.g. BTCUSDC is a real Binance pair,
// a Hyperliquid chart could silently tick with Binance prices. History goes
// through our own `/candles` backend either way; live updates poll the same
// backend (like Coinbase) so the data source is always Hyperliquid itself.
const config: ExchangeConfig = {
  name: 'hyperliquid',
  displayName: 'Hyperliquid',
  supportedResolutions: [...HYPERLIQUID_RESOLUTIONS],
  resolutionMap: HYPERLIQUID_RESOLUTION_MAP,
  maxLimit: 500,
  // No public-WS kline subscription here — polling via our backend.
};

// Ascending-order pagination (same shape as Coinbase).
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

    return lastBarTime < requestedEndTime;
  },

  getNextParams: (
    bars: Bar[],
    currentParams: PeriodParams
  ): PeriodParams | null => {
    if (bars.length === 0) return null;

    const lastBarTime = bars[bars.length - 1].time;
    const requestedEndTime = currentParams.to * 1000;

    if (lastBarTime < requestedEndTime) {
      return {
        ...currentParams,
        from: lastBarTime / 1000 + 1,
      };
    }

    return null;
  },
};

// `symbolInfo.exchange` carries the upper-cased enum value (e.g.
// "HYPERLIQUIDLINEAR", "PAPERHYPERLIQUID"); map it back to the real enum so
// the poll hits the right market. Local instead of the factory's
// `mapStringToExchange` to avoid a module cycle (factory imports handlers).
const toExchangeParam = (symbolInfoExchange: string): ExchangeEnum => {
  const normalized = symbolInfoExchange.toLowerCase();
  return normalized.includes('linear')
    ? ExchangeEnum.hyperliquidLinear
    : ExchangeEnum.hyperliquid;
};

const timeIntervalMap: Record<string, number> = {
  '1m': 60 * 1000,
  '3m': 3 * 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '2h': 2 * 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '8h': 8 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
};

const pollingTimers: Record<string, NodeJS.Timeout> = {};

// Subscribe using polling against our own backend.
const subscribe = async (
  symbolInfo: LibrarySymbolInfo,
  resolution: ResolutionString,
  onTick: SubscribeBarsCallback,
  listenerGuid: string
): Promise<void> => {
  try {
    const interval = config.resolutionMap[resolution] || '1m';
    const lookbackMs = timeIntervalMap[interval] || 60 * 1000;
    const exchange = toExchangeParam(symbolInfo.exchange);

    if (pollingTimers[listenerGuid]) {
      clearInterval(pollingTimers[listenerGuid]);
    }

    pollingTimers[listenerGuid] = setInterval(async () => {
      try {
        const url = new URL(`${import.meta.env.VITE_API_ENDPOINT}/candles`);
        url.searchParams.set('exchange', exchange);
        // Same dashed-native conversion the `requestCandles` chokepoint
        // applies — the connector can't resolve the concatenated form.
        url.searchParams.set(
          'symbol',
          toExchangeCandleSymbol(exchange, symbolInfo.name)
        );
        url.searchParams.set('type', interval);
        url.searchParams.set('startAt', (Date.now() - lookbackMs).toString());
        url.searchParams.set('endAt', Date.now().toString());
        url.searchParams.set('limit', '1');

        const response = await fetch(url.toString());
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        if (result.status === 'OK' && result.data && result.data.length > 0) {
          const candle = result.data[result.data.length - 1];
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
        console.error('Error polling Hyperliquid data:', error);
      }
    }, 30000); // Poll every 30 seconds
  } catch (error) {
    console.error('Error setting up Hyperliquid polling:', error);
  }
};

const unsubscribe = (listenerGuid: string): void => {
  const timer = pollingTimers[listenerGuid];
  if (timer) {
    clearInterval(timer);
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete pollingTimers[listenerGuid];
  }
};

// Export Hyperliquid exchange handler
export const hyperliquidHandler: ExchangeHandler = {
  config,
  paginationLogic,
  subscribe,
  unsubscribe,
};
