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

// OKX supported resolutions
const OKX_RESOLUTIONS = [
  '1',
  '3',
  '5',
  '15',
  '30',
  '60',
  '120',
  '240',
  '360',
  '720',
  '1D',
  '1W',
] as const;

// OKX resolution mapping
const OKX_RESOLUTION_MAP: Record<string, string> = {
  '1': '1m',
  '3': '3m',
  '5': '5m',
  '15': '15m',
  '30': '30m',
  '60': '1H',
  '120': '2H',
  '240': '4H',
  '360': '6H',
  '720': '12H',
  '1D': '1Dutc',
  '1W': '1Wutc',
};

// OKX configuration
const config: ExchangeConfig = {
  name: 'okx',
  displayName: 'OKX',
  supportedResolutions: [...OKX_RESOLUTIONS],
  resolutionMap: OKX_RESOLUTION_MAP,
  maxLimit: 100,
  websocketUrls: {
    spot: 'wss://ws.okx.com:8443/ws/v5/business',
    linear: 'wss://ws.okx.com:8443/ws/v5/business', // Same URL for OKX
  },
};

// OKX pagination logic (based on original working implementation)
const paginationLogic: PaginationLogic = {
  shouldFetchMore: (
    bars: Bar[],
    periodParams: PeriodParams,
    limit: number
  ): boolean => {
    if (bars.length === 0) return false;

    // Use the original logic: if we got exactly 100 bars AND the first bar is newer than requested start
    const hasFullBatch = bars.length >= limit;
    const firstBarTime = bars[0].time;
    const requestedStartTime = periodParams.from * 1000;

    const shouldFetch = hasFullBatch && firstBarTime > requestedStartTime;

    return shouldFetch;
  },
  getNextParams: (
    bars: Bar[],
    currentParams: PeriodParams
  ): PeriodParams | null => {
    if (bars.length === 0) return null;

    // The issue: bars contains ALL accumulated data, but we need the oldest bar from current batch
    // For OKX, since we know it returns data in time order, the oldest bar from the current batch
    // would be the one that's 100 bars from the end (if we got exactly 100 new bars)

    // Get the oldest bar from what should be the current batch
    const oldestFromCurrentBatch = bars[0];

    const nextParams = {
      ...currentParams,
      to: Math.floor(oldestFromCurrentBatch.time / 1000) - 1,
    };

    return nextParams;
  },
};

// Convert OKX interval to WebSocket format
const convertOKXInterval = (interval: string): string => {
  const intervalMap: Record<string, string> = {
    '1m': 'candle1m',
    '3m': 'candle3m',
    '5m': 'candle5m',
    '15m': 'candle15m',
    '30m': 'candle30m',
    '1H': 'candle1H',
    '2H': 'candle2H',
    '4H': 'candle4H',
    '6H': 'candle6H',
    '12H': 'candle12H',
    '1Dutc': 'candle1Dutc',
    '1Wutc': 'candle1Wutc',
  };
  return intervalMap[interval] || 'candle1m';
};

// Market type detection for OKX. `symbolInfo.exchange` arrives UPPER-CASED
// ("OKXLINEAR"), so the check must be case-insensitive — the old
// `exchange.includes('linear')` never matched and every perp chart was
// treated as spot.
const getOKXMarketType = (exchange?: string): 'spot' | 'linear' => {
  const normalized = (exchange ?? '').toLowerCase();
  if (normalized.includes('linear') || normalized.includes('inverse')) {
    return 'linear';
  }
  return 'spot';
};

// `symbolInfo.exchange` carries the upper-cased enum value (e.g. "OKXLINEAR",
// "PAPEROKX"); map it back to the real enum so the symbol is converted for the
// right market. Local instead of the factory's `mapStringToExchange` to avoid a
// module cycle (factory imports handlers). Mirrors hyperliquid.ts.
const toExchangeParam = (symbolInfoExchange?: string): ExchangeEnum => {
  const normalized = (symbolInfoExchange ?? '').toLowerCase();
  const paper = normalized.startsWith('paper');
  if (normalized.includes('inverse')) {
    return paper ? ExchangeEnum.paperOkxInverse : ExchangeEnum.okxInverse;
  }
  if (normalized.includes('linear')) {
    return paper ? ExchangeEnum.paperOkxLinear : ExchangeEnum.okxLinear;
  }
  return paper ? ExchangeEnum.paperOkx : ExchangeEnum.okx;
};

// WebSocket subscription management
const subscriptions: Record<string, WebSocket> = {};

// Subscribe to OKX WebSocket
const subscribe = async (
  symbolInfo: LibrarySymbolInfo,
  resolution: ResolutionString,
  onTick: SubscribeBarsCallback,
  listenerGuid: string
): Promise<void> => {
  try {
    const interval = config.resolutionMap[resolution] || '1m';

    // Detect market type from exchange
    const marketType = getOKXMarketType(symbolInfo.exchange);
    const wsUrl = config.websocketUrls?.[marketType];
    const okxChannel = convertOKXInterval(interval);
    // OKX instIds are dashed ("BTC-USDT") but the app carries pairs
    // concatenated ("BTCUSDT"), so the raw name subscribed to an instrument
    // OKX doesn't know and the chart never live-ticked. Same dashed-native
    // conversion the `requestCandles` chokepoint applies; converted once so
    // the subscribe arg and the message filter can never disagree.
    //
    // Perpetuals: OKX's WS candle channel identifies perps as
    // "BTC-USDT-SWAP" — subscribing the bare "BTC-USDT" on an okxLinear /
    // okxInverse chart would tick with SPOT prices. Our pair form omits the
    // suffix, so append it for perp markets (skip dated futures and ids that
    // already carry a segment, e.g. "BTC-USD_UM_XPERP" or "…-SWAP").
    const exchangeEnum = toExchangeParam(symbolInfo.exchange);
    const dashedId = toExchangeCandleSymbol(exchangeEnum, symbolInfo.name);
    const isPerpMarket =
      exchangeEnum === ExchangeEnum.okxLinear ||
      exchangeEnum === ExchangeEnum.paperOkxLinear ||
      exchangeEnum === ExchangeEnum.okxInverse ||
      exchangeEnum === ExchangeEnum.paperOkxInverse;
    const instId =
      isPerpMarket && !dashedId.includes('-SWAP') && !dashedId.includes('_')
        ? `${dashedId}-SWAP`
        : dashedId;

    const ws = new WebSocket(wsUrl ?? '');

    ws.onopen = () => {
      // Subscribe to the kline channel
      const subscribeMessage = {
        op: 'subscribe',
        args: [
          {
            channel: okxChannel,
            instId,
          },
        ],
      };
      ws.send(JSON.stringify(subscribeMessage));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (
          data.arg?.channel === okxChannel &&
          data.arg?.instId === instId &&
          data.data
        ) {
          const klineData = data.data[0];
          if (klineData && Array.isArray(klineData)) {
            const bar: Bar = {
              time: parseInt(klineData[0]), // timestamp
              open: parseFloat(klineData[1]),
              high: parseFloat(klineData[2]),
              low: parseFloat(klineData[3]),
              close: parseFloat(klineData[4]),
              volume: parseFloat(klineData[5]),
            };
            onTick(bar);
          }
        }
      } catch (error) {
        console.error('Error parsing OKX WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('OKX WebSocket error:', error);
    };

    subscriptions[listenerGuid] = ws;
  } catch (error) {
    console.error('Error creating OKX WebSocket connection:', error);
  }
};

// Unsubscribe from WebSocket
const unsubscribe = (listenerGuid: string): void => {
  const ws = subscriptions[listenerGuid];
  if (ws) {
    ws.close();
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete subscriptions[listenerGuid];
  }
};

// Export OKX exchange handler
export const okxHandler: ExchangeHandler = {
  config,
  paginationLogic,
  subscribe,
  unsubscribe,
};
