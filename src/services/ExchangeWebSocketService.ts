/* eslint-disable @typescript-eslint/no-explicit-any */
import { logger } from '@/lib/loggerInstance';
import { ExchangeEnum } from '@/types';
import {
  isCoinmExchange,
  isFuturesExchange,
  removePaperPrefix,
} from '@/utils/exchangeUtils';

/**
 * A public market-data socket we know how to speak to.
 *
 * The pair picker offers every exchange the backend lists (25 distinct
 * `ExchangeEnum` values today, e.g. `bybitLinear`, `binanceUsdm`, `mexc`),
 * NOT just the three legacy spot enums this service used to switch on. Those
 * market-scoped enums are separate venues with their own endpoints, so the
 * exchange has to be resolved to a (family, market) venue before we can pick a
 * URL, a subscribe frame, or a parser.
 *
 * `key` identifies the SOCKET: every enum that maps to the same venue (e.g.
 * `binance`, `binanceSpot`, `binanceAll`, `paperBinance`) shares one
 * connection, while `binance` and `binanceUsdm` correctly get their own.
 */
type StreamFamily = 'binance' | 'bybit';

interface StreamVenue {
  family: StreamFamily;
  key: string;
  url: string;
}

/**
 * Map an exchange onto its public stream, or `null` when we have no
 * implementation for that venue (okx, kucoin, mexc, kraken, coinbase, bitget,
 * hyperliquid...). Callers must treat `null` as terminal — the old code let
 * those fall through to a connection that never opened, which is what left
 * rows on "Connecting..." forever.
 */
export const resolveStreamVenue = (
  exchange: ExchangeEnum | string | null | undefined
): StreamVenue | null => {
  if (!exchange) return null;
  // Paper accounts mirror the real venue's market data.
  const id = removePaperPrefix(exchange as ExchangeEnum)
    .toString()
    .toLowerCase();
  if (!id) return null;

  if (id.includes('binance')) {
    // Check the market BEFORE the US venue: "binanceusdm" also contains "us".
    if (isCoinmExchange(exchange)) {
      return {
        family: 'binance',
        key: 'binance:coinm',
        url: 'wss://dstream.binance.com/ws',
      };
    }
    if (isFuturesExchange(exchange)) {
      return {
        family: 'binance',
        key: 'binance:usdm',
        url: 'wss://fstream.binance.com/ws',
      };
    }
    if (id === 'binanceus') {
      return {
        family: 'binance',
        key: 'binance:us',
        url: 'wss://stream.binance.us:443/ws',
      };
    }
    return {
      family: 'binance',
      key: 'binance:spot',
      url: 'wss://data-stream.binance.vision/ws',
    };
  }

  if (id.includes('bybit')) {
    if (isCoinmExchange(exchange)) {
      return {
        family: 'bybit',
        key: 'bybit:inverse',
        url: 'wss://stream.bybit.com/v5/public/inverse',
      };
    }
    if (isFuturesExchange(exchange)) {
      return {
        family: 'bybit',
        key: 'bybit:linear',
        url: 'wss://stream.bybit.com/v5/public/linear',
      };
    }
    return {
      family: 'bybit',
      key: 'bybit:spot',
      url: 'wss://stream.bybit.com/v5/public/spot',
    };
  }

  return null;
};

/**
 * Whether a live price can ever arrive for this exchange. The UI uses this to
 * show a terminal "Price unavailable" instead of a permanent "Connecting...".
 */
export const isPriceStreamSupported = (
  exchange: ExchangeEnum | string | null | undefined
): boolean => resolveStreamVenue(exchange) !== null;

export interface PriceUpdate {
  symbol: string;
  price: number;
  exchange: string;
  change24h?: number;
  changePercent24h?: number;
  volume24h?: number;
  timestamp: number;
}

export interface TradingPair {
  pair: string;
  exchange: string;
  baseAsset: {
    name: string;
    minAmount: number;
    maxAmount: number;
    step: number;
  };
  quoteAsset: {
    name: string;
    minAmount: number;
  };
  priceAssetPrecision: number;
  crossAvailable: boolean;
}

type PriceUpdateCallback = (update: PriceUpdate) => void;

interface SubscriptionInfo {
  symbol: string;
  /** The exchange the caller subscribed with, reported back on every update. */
  exchange: string;
  venueKey: string;
  callback: PriceUpdateCallback;
}

/** Last ticker seen per `${venueKey}_${symbol}`, for merging Bybit deltas. */
interface TickerState {
  price?: number;
  changePercent24h?: number;
  volume24h?: number;
}

export class ExchangeWebSocketService {
  private static instance: ExchangeWebSocketService;
  private connections: Map<string, WebSocket> = new Map();
  private subscriptions: Map<string, SubscriptionInfo[]> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private pingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private tickerState: Map<string, TickerState> = new Map();
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second

  private constructor() {}

  public static getInstance(): ExchangeWebSocketService {
    if (!ExchangeWebSocketService.instance) {
      ExchangeWebSocketService.instance = new ExchangeWebSocketService();
    }
    return ExchangeWebSocketService.instance;
  }

  public subscribe(
    pair: TradingPair,
    callback: PriceUpdateCallback
  ): () => void {
    const venue = resolveStreamVenue(pair.exchange);

    if (!venue) {
      // No public stream for this venue. Say so once and hand back a no-op
      // instead of leaving the caller waiting on a connection that can never
      // happen — the UI renders a terminal state off `isPriceStreamSupported`.
      logger.warn(
        '[ExchangeWebSocketService] No price stream implemented for exchange:',
        pair.exchange
      );
      return () => {};
    }

    const key = `${venue.key}_${pair.pair}`;

    logger.debug('[ExchangeWebSocketService] Subscribe called:', {
      pair: pair.pair,
      exchange: pair.exchange,
      venue: venue.key,
      key,
    });

    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, []);
    }

    const subscriptions = this.subscriptions.get(key) ?? [];
    subscriptions.push({
      symbol: pair.pair,
      exchange: pair.exchange,
      venueKey: venue.key,
      callback,
    });

    const existing = this.connections.get(venue.key);
    if (existing && existing.readyState === WebSocket.OPEN) {
      // The socket is already up, so `onopen` will not fire again. Without an
      // incremental subscribe here a pair added to a live watchlist never gets
      // a subscription and sits on "Connecting..." forever.
      this.sendSubscribe(venue, existing, [pair.pair]);
    } else if (!existing) {
      this.connectToVenue(venue);
    }
    // A CONNECTING socket needs nothing: its `onopen` subscribes the full map.

    // Return unsubscribe function
    return () => {
      const subs = this.subscriptions.get(key);
      if (subs) {
        const index = subs.findIndex((s) => s.callback === callback);
        if (index >= 0) {
          subs.splice(index, 1);

          // If no more subscriptions for this symbol, we could optionally close the connection
          if (subs.length === 0) {
            this.subscriptions.delete(key);
            this.tickerState.delete(key);
            logger.debug(
              '[ExchangeWebSocketService] No more subscriptions for:',
              key
            );
          }
        }
      }
    };
  }

  private connectToVenue(venue: StreamVenue): void {
    if (this.connections.has(venue.key)) {
      logger.debug(
        '[ExchangeWebSocketService] Already connected to:',
        venue.key
      );
      return; // Already connected
    }

    logger.debug('[ExchangeWebSocketService] Connecting to:', {
      venue: venue.key,
      url: venue.url,
    });

    const ws = new WebSocket(venue.url);
    this.connections.set(venue.key, ws);

    // Add a timeout to detect if connection never opens
    const connectionTimeout = setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) {
        console.error(
          '[ExchangeWebSocketService] Connection timeout for:',
          venue.key
        );
        logger.error('[ExchangeWebSocketService] Connection timeout');
        ws.close();
      }
    }, 15000); // Increased timeout to 15 seconds for Bybit

    ws.onopen = () => {
      clearTimeout(connectionTimeout);
      logger.info(
        '[ExchangeWebSocketService] *** WebSocket OPENED for:',
        venue.key
      );
      this.reconnectAttempts.set(venue.key, 0);

      // Bybit closes an idle socket, so its documented 20s app-level ping is
      // required. Binance has no such frame: `{"method":"PING"}` is not a
      // valid request there and the server answers "unknown variant `PING`"
      // and closes with 1008, which was tearing the price feed down every
      // 30s. Binance sends protocol-level pings the browser auto-pongs.
      if (venue.family === 'bybit') {
        const sendPing = () => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ op: 'ping' }));
          }
        };
        setTimeout(sendPing, 1000);
        const pingInterval = setInterval(sendPing, 20000);
        this.pingIntervals.set(venue.key, pingInterval);
      }

      this.subscribeToSymbols(venue, ws);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Handle PONG responses from Binance
        if (data.result === null && data.id) {
          return; // Don't process PONG responses further
        }

        this.handlePriceUpdate(venue, data);
      } catch (error) {
        logger.error(
          '[ExchangeWebSocketService] Error parsing message:',
          error
        );
      }
    };

    ws.onclose = (event) => {
      clearTimeout(connectionTimeout);

      // Clear ping interval if it exists
      const pingInterval = this.pingIntervals.get(venue.key);
      if (pingInterval) {
        clearInterval(pingInterval);
        this.pingIntervals.delete(venue.key);
      }

      console.warn(
        '[ExchangeWebSocketService] *** WebSocket CLOSED for:',
        venue.key,
        'Code:',
        event.code,
        'Reason:',
        event.reason
      );

      // Provide more specific error messages for common Bybit issues
      if (venue.family === 'bybit') {
        if (event.code === 1006) {
          console.warn(
            '[ExchangeWebSocketService] Bybit connection closed abnormally (1006). This often indicates network issues or server problems.'
          );
        } else if (event.code === 1002) {
          console.warn(
            '[ExchangeWebSocketService] Bybit connection closed due to protocol error.'
          );
        } else if (event.code === 1003) {
          console.warn(
            '[ExchangeWebSocketService] Bybit connection closed due to unsupported data.'
          );
        }
      }

      logger.warn('[ExchangeWebSocketService] Connection closed:', {
        venue: venue.key,
        code: event.code,
        reason: event.reason,
      });
      this.connections.delete(venue.key);
      this.handleReconnect(venue);
    };

    ws.onerror = (error) => {
      clearTimeout(connectionTimeout);
      console.error(
        '[ExchangeWebSocketService] *** WebSocket ERROR for:',
        venue.key,
        error
      );
      logger.error('[ExchangeWebSocketService] WebSocket error:', {
        venue: venue.key,
        error,
      });
    };
  }

  private subscribeToSymbols(venue: StreamVenue, ws: WebSocket): void {
    logger.debug(
      '[ExchangeWebSocketService] subscribeToSymbols called for:',
      venue.key
    );

    // Every symbol registered against THIS venue. Matching on the resolved
    // venue rather than an exchange-name prefix keeps `bybit` (spot) from
    // swallowing `bybitLinear`'s symbols, which used to send perpetual
    // symbols to the spot socket.
    const symbols: string[] = [];

    for (const subscriptions of this.subscriptions.values()) {
      subscriptions.forEach((sub) => {
        if (sub.venueKey === venue.key && !symbols.includes(sub.symbol)) {
          symbols.push(sub.symbol);
        }
      });
    }

    if (symbols.length === 0) {
      logger.warn(
        '[ExchangeWebSocketService] No symbols to subscribe for venue:',
        venue.key
      );
      return;
    }

    this.sendSubscribe(venue, ws, symbols);
  }

  /** Send a subscribe frame for `symbols` in the venue family's own dialect. */
  private sendSubscribe(
    venue: StreamVenue,
    ws: WebSocket,
    symbols: string[]
  ): void {
    if (symbols.length === 0) return;

    logger.debug('[ExchangeWebSocketService] Subscribing to symbols:', {
      venue: venue.key,
      symbols,
    });

    switch (venue.family) {
      case 'binance':
        this.subscribeBinance(ws, symbols);
        break;
      case 'bybit':
        this.subscribeBybit(ws, symbols);
        break;
    }
  }

  private subscribeBinance(ws: WebSocket, symbols: string[]): void {
    logger.debug(
      '[ExchangeWebSocketService] Subscribing to Binance symbols:',
      symbols
    );

    // Subscribe to individual symbol ticker streams using 24hrTicker format
    const streams = symbols.map((symbol) => `${symbol.toLowerCase()}@ticker`);

    const subscribeMessage = {
      method: 'SUBSCRIBE',
      params: streams,
      id: Date.now(),
    };

    try {
      ws.send(JSON.stringify(subscribeMessage));
      logger.debug(
        '[ExchangeWebSocketService] Sent Binance subscription:',
        streams
      );
    } catch (error) {
      logger.error(
        '[ExchangeWebSocketService] Error sending Binance subscription:',
        error
      );
    }
  }

  private subscribeBybit(ws: WebSocket, symbols: string[]): void {
    logger.debug(
      '[ExchangeWebSocketService] Subscribing to Bybit symbols:',
      symbols
    );

    // Bybit V5 subscription format for ticker data
    const subscribeMessage = {
      op: 'subscribe',
      args: symbols.map((symbol) => `tickers.${symbol}`),
    };

    logger.info(
      '[ExchangeWebSocketService] Bybit subscription message:',
      subscribeMessage
    );

    try {
      ws.send(JSON.stringify(subscribeMessage));
      logger.debug(
        '[ExchangeWebSocketService] Sent Bybit subscription:',
        symbols
      );
    } catch (error) {
      logger.error(
        '[ExchangeWebSocketService] Error sending Bybit subscription:',
        error
      );
    }
  }

  private handlePriceUpdate(venue: StreamVenue, data: any): void {
    switch (venue.family) {
      case 'binance':
        this.parseBinanceUpdate(venue, data);
        break;
      case 'bybit':
        this.parseBybitUpdate(venue, data);
        break;
    }
  }

  private parseBinanceUpdate(venue: StreamVenue, data: any): void {
    // Binance 24hrTicker stream format. Spot, USD-M and COIN-M all emit the
    // same event shape, so one parser serves the whole family.
    if (data.e !== '24hrTicker') return;

    this.notifySubscribers(venue, data.s, {
      price: parseFloat(data.c),
      changePercent24h: parseFloat(data.P),
      volume24h: parseFloat(data.v),
    });
  }

  private parseBybitUpdate(venue: StreamVenue, data: any): void {
    if (data.topic && data.topic.startsWith('tickers.') && data.data) {
      const ticker = data.data;
      const symbol = ticker.symbol;
      if (!symbol) return;

      // Spot pushes a full snapshot every time, but linear/inverse push one
      // snapshot then DELTAS carrying only the fields that changed — a delta
      // frequently has no `lastPrice` at all. Parsing each frame standalone
      // produced NaN, so merge deltas onto the last known ticker instead.
      const stateKey = `${venue.key}_${symbol}`;
      const previous =
        data.type === 'delta' ? (this.tickerState.get(stateKey) ?? {}) : {};

      const next: TickerState = { ...previous };

      if (ticker.lastPrice !== undefined) {
        next.price = parseFloat(ticker.lastPrice);
      }
      if (ticker.price24hPcnt !== undefined) {
        // Bybit sends a RATIO ("0.0112" = +1.12%), not a percentage.
        next.changePercent24h = parseFloat(ticker.price24hPcnt) * 100;
      }
      if (ticker.volume24h !== undefined) {
        next.volume24h = parseFloat(ticker.volume24h);
      }

      this.tickerState.set(stateKey, next);

      // Nothing to render until a price has arrived at least once.
      if (next.price === undefined || Number.isNaN(next.price)) return;

      this.notifySubscribers(venue, symbol, next);
      return;
    }

    // Handle subscription confirmation
    if (data.success && data.op === 'subscribe') {
      logger.debug(
        '[ExchangeWebSocketService] Bybit subscription confirmed:',
        data
      );
      return;
    }

    // Handle connection pong responses
    if (data.op === 'pong' || data.ret_msg === 'pong') {
      logger.debug('[ExchangeWebSocketService] Bybit pong received');
      return;
    }

    logger.debug(
      '[ExchangeWebSocketService] Unknown Bybit message format:',
      data
    );
  }

  private notifySubscribers(
    venue: StreamVenue,
    symbol: string,
    ticker: TickerState
  ): void {
    const subscriptions = this.subscriptions.get(`${venue.key}_${symbol}`);
    if (!subscriptions) return;

    const price = ticker.price ?? 0;
    const changePercent24h = ticker.changePercent24h;

    subscriptions.forEach((sub) => {
      try {
        // Report the exchange the caller subscribed with (which may be the
        // paper variant, or any enum sharing this venue) so each row keeps
        // its own identity.
        sub.callback({
          symbol,
          price,
          exchange: sub.exchange,
          ...(changePercent24h !== undefined && {
            change24h: (price * changePercent24h) / 100,
            changePercent24h,
          }),
          ...(ticker.volume24h !== undefined && {
            volume24h: ticker.volume24h,
          }),
          timestamp: Date.now(),
        });
      } catch (error) {
        logger.error('[ExchangeWebSocketService] Error in callback:', error);
      }
    });
  }

  private handleReconnect(venue: StreamVenue): void {
    // Don't reconnect a venue nobody is watching any more.
    const stillWanted = [...this.subscriptions.values()].some((subs) =>
      subs.some((sub) => sub.venueKey === venue.key)
    );
    if (!stillWanted) return;

    const attempts = this.reconnectAttempts.get(venue.key) || 0;

    if (attempts >= this.maxReconnectAttempts) {
      logger.error(
        '[ExchangeWebSocketService] Max reconnection attempts reached for:',
        venue.key
      );

      // Back off hard rather than giving up entirely — the feed is the whole
      // point of the widget, and the venue may just be briefly unreachable.
      this.reconnectAttempts.set(venue.key, 0);
      setTimeout(() => {
        this.connectToVenue(venue);
      }, 30000);
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, attempts);
    this.reconnectAttempts.set(venue.key, attempts + 1);

    logger.debug('[ExchangeWebSocketService] Reconnecting in:', {
      venue: venue.key,
      delay,
      attempt: attempts + 1,
    });

    setTimeout(() => {
      this.connectToVenue(venue);
    }, delay);
  }

  public disconnect(): void {
    this.connections.forEach((ws, venueKey) => {
      ws.close();
      logger.debug('[ExchangeWebSocketService] Disconnected from:', venueKey);
    });

    // Clear all ping intervals
    this.pingIntervals.forEach((interval) => {
      clearInterval(interval);
    });

    this.connections.clear();
    this.subscriptions.clear();
    this.reconnectAttempts.clear();
    this.pingIntervals.clear();
    this.tickerState.clear();
  }

  public getConnectionStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    this.connections.forEach((ws, exchange) => {
      status[exchange] = ws.readyState === WebSocket.OPEN;
    });
    return status;
  }
}
