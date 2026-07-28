import { ExchangeEnum } from '@/types';
import { toExchangeCandleSymbol } from '@/utils/exchangeUtils';
import {
  type ExchangeHandler,
  type Bar,
  type PeriodParams,
  type LibrarySymbolInfo,
  type ResolutionString,
  type SubscribeBarsCallback,
} from '../types';

interface WSTokenResponseToUse {
  url: string;
  server: {
    pingInterval: number;
  };
}

interface WSKlinesUpdate {
  type: string;
  topic: string;
  subject: string;
  data: {
    symbol: string;
    candles: string[];
    time: number;
  };
}

// KuCoin WebSocket connection interface
interface KucoinWebSocketConnection {
  ws: WebSocket;
  pingInterval?: NodeJS.Timeout;
  close: () => void;
}

// Global WebSocket connections storage
const kucoinConnections: Record<string, KucoinWebSocketConnection> = {};

// Convert KuCoin candle data to Bar format
const convertCandleKucoin = (c: string[]): Bar => {
  const [time, open, close, high, low, volume] = c;
  return {
    time: parseFloat(time) * 1000,
    open: parseFloat(open),
    high: parseFloat(high),
    low: parseFloat(low),
    close: parseFloat(close),
    volume: parseFloat(volume),
  };
};

// This handler is registered for the whole KuCoin family (spot, futures and
// the `*All`/`*Spot` pseudo-exchanges), but `/market/candles:` is the KuCoin
// **spot** public WS channel, whose topic uses the dashed native symbol
// ("BTC-USDT"). The app carries pairs concatenated ("BTCUSDT"), so the raw
// name subscribed to a topic KuCoin never publishes and the chart never
// live-ticked. Futures use contract ids (`XBTUSDTM`) on a different channel
// entirely — that path is left exactly as it was rather than half-fixed here.
const isKucoinFutures = (symbolInfoExchange?: string): boolean => {
  const normalized = (symbolInfoExchange ?? '').toLowerCase();
  return normalized.includes('linear') || normalized.includes('inverse');
};

const toKucoinWireSymbol = (symbolInfo: LibrarySymbolInfo): string =>
  isKucoinFutures(symbolInfo.exchange)
    ? symbolInfo.name
    : toExchangeCandleSymbol(ExchangeEnum.kucoin, symbolInfo.name);

// Create KuCoin WebSocket connection
const createKucoinWebSocket = async (
  symbolInfo: LibrarySymbolInfo,
  resolution: ResolutionString,
  onTick: SubscribeBarsCallback
): Promise<KucoinWebSocketConnection> => {
  // Get WS token and server info
  const tokenData = await getKucoinWSToken();

  const wsUrl = tokenData.url;

  const ws = new WebSocket(wsUrl);

  // Converted once so the subscribe topic and the message filter can never
  // disagree.
  const wireSymbol = toKucoinWireSymbol(symbolInfo);

  // Set up ping interval variable
  let pingInterval: NodeJS.Timeout | undefined;

  ws.onopen = () => {
    // Start ping interval
    pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            id: Date.now().toString(),
            type: 'ping',
          })
        );
      }
    }, tokenData.server.pingInterval);
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);

      if (message.type === 'welcome') {
        // Map resolution to KuCoin format
        const kucoinResolution = kucoinHandler.config.resolutionMap[resolution];
        if (!kucoinResolution) {
          console.error('Unsupported resolution for KuCoin:', resolution);
          return;
        }

        // Subscribe to kline data
        const subscribeMessage = {
          id: Date.now().toString(),
          type: 'subscribe',
          topic: `/market/candles:${wireSymbol}_${kucoinResolution}`,
          privateChannel: false,
          response: true,
        };

        ws.send(JSON.stringify(subscribeMessage));
      } else if (
        message.type === 'message' &&
        message.topic?.includes('/market/candles:')
      ) {
        // Handle kline updates
        const data = message.data as WSKlinesUpdate['data'];
        if (data && data.candles && data.symbol === wireSymbol) {
          const bar = convertCandleKucoin(data.candles);
          onTick(bar);
        }
      }
    } catch (error) {
      console.error('Error parsing KuCoin WebSocket message:', error);
    }
  };

  ws.onerror = (error) => {
    console.error('KuCoin WebSocket error:', error);
  };

  ws.onclose = () => {
    if (pingInterval) {
      clearInterval(pingInterval);
    }
  };

  return {
    ws,
    ...(pingInterval && { pingInterval }),
    close: () => {
      if (pingInterval) {
        clearInterval(pingInterval);
      }
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    },
  };
};

// Request WS token from your server
const getKucoinWSToken = async (): Promise<WSTokenResponseToUse> => {
  const response = await fetch(
    `${import.meta.env['VITE_API_ENDPOINT']}/datafeed_ws`,
    {
      method: 'GET',
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get KuCoin WS token: ${response.statusText}`);
  }

  return response.json() as Promise<WSTokenResponseToUse>;
};

export const kucoinHandler: ExchangeHandler = {
  config: {
    name: 'kucoin',
    displayName: 'KuCoin',
    supportedResolutions: [
      '1',
      '3',
      '5',
      '15',
      '30',
      '60',
      '120',
      '240',
      '360',
      '480',
      '720',
      'D',
      'W',
    ],
    resolutionMap: {
      '1': '1min',
      '3': '3min',
      '5': '5min',
      '15': '15min',
      '30': '30min',
      '60': '1hour',
      '120': '2hour',
      '240': '4hour',
      '360': '6hour',
      '480': '8hour',
      '720': '12hour',
      D: '1day',
      '1D': '1day',
      W: '1week',
      '1W': '1week',
    },
    maxLimit: 1500, // KuCoin's max limit
  },

  paginationLogic: {
    shouldFetchMore: (
      bars: Bar[],
      periodParams: PeriodParams,
      limit: number
    ): boolean => {
      if (bars.length === 0) return false;

      // Continue fetching if we got exactly the limit (means there might be more)
      // and we haven't reached the requested 'from' time
      const oldestBar = bars[0];
      const reachedFromTime = oldestBar.time <= periodParams.from * 1000;

      return bars.length >= limit && !reachedFromTime;
    },

    getNextParams: (
      bars: Bar[],
      currentParams: PeriodParams
    ): PeriodParams | null => {
      if (bars.length === 0) return null;

      // For KuCoin, data comes in descending time order, so we want to fetch earlier data
      const oldestBar = bars[0];
      const nextParams = {
        ...currentParams,
        to: Math.floor(oldestBar.time / 1000) - 1,
      };

      return nextParams;
    },
  },

  subscribe: async (
    symbolInfo: LibrarySymbolInfo,
    resolution: ResolutionString,
    onTick: SubscribeBarsCallback,
    listenerGuid: string
  ): Promise<void> => {
    try {
      // Create WebSocket connection
      const connection = await createKucoinWebSocket(
        symbolInfo,
        resolution,
        onTick
      );

      // Store the connection for later cleanup
      kucoinConnections[listenerGuid] = connection;
    } catch (error) {
      console.error('Error subscribing to KuCoin:', error);
    }
  },

  unsubscribe: (listenerGuid: string): void => {
    try {
      const connection = kucoinConnections[listenerGuid];
      if (connection) {
        connection.close();
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete kucoinConnections[listenerGuid];
      }
    } catch (error) {
      console.error('Error unsubscribing from KuCoin:', error);
    }
  },
};
