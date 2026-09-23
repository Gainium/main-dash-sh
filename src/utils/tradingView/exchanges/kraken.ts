import { extractPairAssets } from '@/utils/pairs';
import type {
  Bar,
  ExchangeConfig,
  ExchangeHandler,
  LibrarySymbolInfo,
  PaginationLogic,
  PeriodParams,
  ResolutionString,
  SubscribeBarsCallback,
} from '../types';

// Kraken — minimal raw-WebSocket handler matching the conventions of
// the other exchange streamers under this folder (binance.ts, bybit.ts,
// etc). The legacy dashboard uses `@siebly/kraken-api` for the same job;
// we deliberately avoid the dep here. Spot uses Kraken's v2 public
// `ohlc` channel, futures uses the v1 public `candles_trade_<interval>`
// feed. Both endpoints are public — no auth required for OHLC.
//
// Caveats kept on purpose ("simple implementation" — owner will iterate):
//   • Spot symbol form: `BASE/QUOTE`. We try `symbol.wsCode` first (the
//     backend-provided id) and otherwise infer from `pair` via
//     `extractPairAssets`. Pairs that the splitter can't break (rare
//     alt/alt combos) will fail to subscribe — same as legacy when
//     wsCode is missing.
//   • Futures product id: read from `symbol.code` only. We do NOT try
//     to synthesise it (BTC → XBT, prefix detection, etc) — that's a
//     known hard problem and legacy depends on the backend too.
//   • No automatic reconnect / heartbeat — TradingView calls subscribe
//     on (re)open and unsubscribe on teardown; if the socket dies the
//     chart stops updating until the user navigates. Matches the other
//     exchange handlers in this folder.

const SPOT_WS_URL = 'wss://ws.kraken.com/v2';
const FUTURES_WS_URL = 'wss://futures.kraken.com/ws/v1';

const KRAKEN_RESOLUTIONS = [
  '1',
  '5',
  '15',
  '30',
  '60',
  '240',
  '1D',
  '1W',
] as const;

// TradingView resolution → Kraken interval (minutes for spot, label for
// futures `candles_trade_*` feeds). Spot accepts numeric minutes;
// futures publishes feeds like `candles_trade_1m` / `candles_trade_1h`.
const RESOLUTION_TO_SPOT_MINUTES: Record<string, number> = {
  '1': 1,
  '5': 5,
  '15': 15,
  '30': 30,
  '60': 60,
  '240': 240,
  '1D': 1440,
  '1W': 10080,
};

const RESOLUTION_TO_FUTURES_LABEL: Record<string, string> = {
  '1': '1m',
  '5': '5m',
  '15': '15m',
  '30': '30m',
  '60': '1h',
  '240': '4h',
  '1D': '1d',
  '1W': '1w',
};

const config: ExchangeConfig = {
  name: 'kraken',
  displayName: 'Kraken',
  supportedResolutions: [...KRAKEN_RESOLUTIONS],
  resolutionMap: {}, // Resolution mapping handled per market type below
  maxLimit: 720, // Kraken REST OHLC tops out at 720 candles
};

// Standard time-based pagination. Spot/futures both use forward time
// windows on the REST side, so the same logic the other handlers use
// is fine here.
const paginationLogic: PaginationLogic = {
  shouldFetchMore: (bars, periodParams, limit) => {
    if (bars.length === 0) return false;
    if (bars.length < limit) return false;
    const lastBarTime = bars[bars.length - 1].time;
    const firstBarTime = bars[0].time;
    const requestedEndTime = periodParams.to * 1000;
    const requestedStartTime = periodParams.from * 1000;
    if (lastBarTime < requestedEndTime) return true;
    if (firstBarTime > requestedStartTime) return true;
    return false;
  },
  getNextParams: (
    bars: Bar[],
    currentParams: PeriodParams
  ): PeriodParams | null => {
    if (bars.length === 0) return null;
    const lastBarTime = bars[bars.length - 1].time;
    const firstBarTime = bars[0].time;
    const requestedEndTime = currentParams.to * 1000;
    const requestedStartTime = currentParams.from * 1000;
    if (lastBarTime < requestedEndTime) {
      return { ...currentParams, from: lastBarTime / 1000 + 1 };
    }
    if (firstBarTime > requestedStartTime) {
      return { ...currentParams, to: firstBarTime / 1000 - 1 };
    }
    return null;
  },
};

const isFuturesExchange = (exchange: string): boolean =>
  exchange.toLowerCase().includes('usdm') ||
  exchange.toLowerCase().includes('linear');

// Build Kraken's spot WS symbol form. Prefer the backend-provided
// `wsCode` (already `BASE/QUOTE`); otherwise split the legacy
// `BASEQUOTE` string. Returns null when we can't safely produce one —
// the caller will skip the subscribe in that case (rather than fire a
// malformed request).
const buildSpotSymbol = (symbolInfo: LibrarySymbolInfo): string | null => {
  // Prefer the backend-provided `wsCode` (already `BASE/QUOTE`), which
  // `resolveSymbol` now threads onto `symbolInfo`. Fall back to deriving
  // from `name` (the pair string) for symbols that lack it (e.g. the
  // dynamically-built ones).
  if (symbolInfo.wsCode?.includes('/')) return symbolInfo.wsCode;
  const pair = symbolInfo.name;
  if (pair.includes('/')) return pair;
  const { baseAsset, quoteAsset } = extractPairAssets(pair);
  if (baseAsset && quoteAsset) return `${baseAsset}/${quoteAsset}`;
  return null;
};

// Persistent WS connections — TradingView calls subscribe / unsubscribe
// for many symbols against the same chart and rebuilding the socket every
// time is wasteful. Each socket is created lazily on first subscribe and
// torn down when its last listener is removed.
//
// Spot gets one socket PER INTERVAL. Kraken's v2 `ohlc` channel accepts a
// single interval per symbol per connection ("Already subscribed to one
// ohlc interval on this symbol"), and TradingView subscribes a new
// resolution before it unsubscribes the old one (lazily, ~10s later). On a
// shared socket the new interval was rejected and never retried, so the
// chart stopped updating live after a timeframe change.
//
// Exchange subscriptions ("streams") are ref-counted: listeners on the same
// stream share one subscription, so one of them leaving does not cut the
// others off, and a second subscribe (which Kraken rejects) is never sent.
type Connection = {
  ws: WebSocket;
  ready: Promise<void>;
  // listenerGuid → handler attached to `ws.onmessage`
  listeners: Map<string, (data: unknown) => void>;
  // listenerGuid → cleanup that releases its stream
  cleanups: Map<string, () => void>;
  // stream key → number of listeners that want it
  wanted: Map<string, number>;
  // stream keys whose subscribe frame has been sent
  live: Set<string>;
};

type StreamFrames = { subscribe: string; unsubscribe: string };

const connections = new Map<string, Connection>();

const ensureConnection = (key: string, url: string): Connection => {
  const existing = connections.get(key);
  if (existing) return existing;
  const ws = new WebSocket(url);
  const conn: Connection = {
    ws,
    // Settles on open, or on close when torn down before it ever opened.
    ready: new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve(), { once: true });
      ws.addEventListener('error', (e) => reject(e), { once: true });
      ws.addEventListener('close', () => resolve(), { once: true });
    }),
    listeners: new Map(),
    cleanups: new Map(),
    wanted: new Map(),
    live: new Set(),
  };
  ws.addEventListener('message', (event) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(event.data);
    } catch {
      return;
    }
    for (const listener of conn.listeners.values()) {
      listener(parsed);
    }
  });
  ws.addEventListener('close', () => {
    if (connections.get(key) === conn) connections.delete(key);
  });
  connections.set(key, conn);
  return conn;
};

const closeIfIdle = (key: string) => {
  const conn = connections.get(key);
  if (!conn) return;
  if (conn.listeners.size === 0) {
    try {
      conn.ws.close();
    } catch {
      // ignore — socket may already be closing
    }
    connections.delete(key);
  }
};

// Bring the exchange-side subscription in line with whether any listener
// still wants the stream. Idempotent; a no-op until the socket is open.
const syncStream = (conn: Connection, key: string, frames: StreamFrames) => {
  if (conn.ws.readyState !== WebSocket.OPEN) return;
  const wanted = (conn.wanted.get(key) ?? 0) > 0;
  const live = conn.live.has(key);
  try {
    if (wanted && !live) {
      conn.ws.send(frames.subscribe);
      conn.live.add(key);
    } else if (!wanted && live) {
      conn.ws.send(frames.unsubscribe);
      conn.live.delete(key);
    }
  } catch {
    // socket closing — nothing to keep in sync any more
  }
};

// Register the listener synchronously (so a concurrent unsubscribe of
// another listener can't see the socket as idle and close it under us),
// then subscribe once the socket is open.
const attachListener = async (
  conn: Connection,
  listenerGuid: string,
  handler: (data: unknown) => void,
  streamKey: string,
  frames: StreamFrames
): Promise<void> => {
  conn.listeners.set(listenerGuid, handler);
  conn.wanted.set(streamKey, (conn.wanted.get(streamKey) ?? 0) + 1);
  conn.cleanups.set(listenerGuid, () => {
    const left = (conn.wanted.get(streamKey) ?? 1) - 1;
    if (left > 0) conn.wanted.set(streamKey, left);
    else conn.wanted.delete(streamKey);
    syncStream(conn, streamKey, frames);
  });
  try {
    await conn.ready;
  } catch (err) {
    // A socket closed while connecting (its last listener left) reports an
    // error too — only a listener that is still attached cares.
    if (conn.listeners.has(listenerGuid)) throw err;
    return;
  }
  syncStream(conn, streamKey, frames);
};

const subscribeSpot = async (
  symbolInfo: LibrarySymbolInfo,
  resolution: ResolutionString,
  onTick: SubscribeBarsCallback,
  listenerGuid: string
): Promise<void> => {
  const symbol = buildSpotSymbol(symbolInfo);
  if (!symbol) {
    console.error(
      '[Kraken] Cannot derive WS symbol from pair:',
      symbolInfo.name
    );
    return;
  }
  const intervalMin = RESOLUTION_TO_SPOT_MINUTES[resolution];
  if (!intervalMin) {
    console.error('[Kraken] Unsupported spot resolution:', resolution);
    return;
  }
  const conn = ensureConnection(`spot:${intervalMin}`, SPOT_WS_URL);

  const handler = (msg: unknown) => {
    const m = msg as {
      channel?: string;
      type?: string;
      data?: Array<{
        symbol?: string;
        open?: string | number;
        high?: string | number;
        low?: string | number;
        close?: string | number;
        volume?: string | number;
        interval_begin?: string;
        interval?: number;
        timestamp?: string;
      }>;
    };
    if (m.channel !== 'ohlc' || !Array.isArray(m.data)) return;
    const bars: Bar[] = [];
    for (const c of m.data) {
      if (c.symbol !== symbol) continue;
      if (c.interval !== undefined && c.interval !== intervalMin) continue;
      // Kraken v2 ohlc gives a candle close timestamp; `interval_begin`
      // is the open time, which is what TradingView wants.
      const time = c.interval_begin
        ? +new Date(c.interval_begin)
        : c.timestamp
          ? +new Date(c.timestamp) - intervalMin * 60_000
          : Date.now();
      bars.push({
        time,
        open: parseFloat(String(c.open ?? 0)),
        high: parseFloat(String(c.high ?? 0)),
        low: parseFloat(String(c.low ?? 0)),
        close: parseFloat(String(c.close ?? 0)),
        volume: parseFloat(String(c.volume ?? 0)),
      });
    }
    if (bars.length === 0) return;
    // Every subscribe is answered with a `snapshot` of the day's candles,
    // oldest first. getBars already loaded that history, and TradingView
    // rejects a realtime bar older than the newest one it holds — so only
    // the forming candle (the newest) is live data here.
    if (m.type === 'snapshot') {
      onTick(bars.reduce((a, b) => (b.time > a.time ? b : a)));
      return;
    }
    bars.forEach(onTick);
  };

  const params = { channel: 'ohlc', symbol: [symbol], interval: intervalMin };
  await attachListener(conn, listenerGuid, handler, symbol, {
    subscribe: JSON.stringify({ method: 'subscribe', params }),
    unsubscribe: JSON.stringify({ method: 'unsubscribe', params }),
  });
};

const subscribeFutures = async (
  symbolInfo: LibrarySymbolInfo,
  resolution: ResolutionString,
  onTick: SubscribeBarsCallback,
  listenerGuid: string
): Promise<void> => {
  // Futures needs the Kraken-native product id (PI_*, PF_*, FI_*).
  // `resolveSymbol` copies `code` from the GraphQL `Symbol` onto
  // `LibrarySymbolInfo`. If it's still missing the backend didn't populate
  // `code` for this pair — no-op rather than subscribe to the wrong product.
  const productId = symbolInfo.code ?? null;
  if (!productId) {
    console.error(
      '[Kraken] Futures product id missing for symbol; backend must populate `code`:',
      symbolInfo.name
    );
    return;
  }
  const label = RESOLUTION_TO_FUTURES_LABEL[resolution];
  if (!label) {
    console.error('[Kraken] Unsupported futures resolution:', resolution);
    return;
  }
  const feed = `candles_trade_${label}`;
  const conn = ensureConnection('futures', FUTURES_WS_URL);

  const handler = (msg: unknown) => {
    const m = msg as {
      feed?: string;
      product_id?: string;
      candle?: {
        time?: number | string;
        open?: string | number;
        high?: string | number;
        low?: string | number;
        close?: string | number;
        volume?: string | number;
      };
    };
    if (m.feed !== feed || !m.candle || m.product_id !== productId) return;
    const c = m.candle;
    onTick({
      time:
        typeof c.time === 'number' ? c.time : +new Date(c.time ?? Date.now()),
      open: parseFloat(String(c.open ?? 0)),
      high: parseFloat(String(c.high ?? 0)),
      low: parseFloat(String(c.low ?? 0)),
      close: parseFloat(String(c.close ?? 0)),
      volume: parseFloat(String(c.volume ?? 0)),
    });
  };

  const request = { feed, product_ids: [productId] };
  await attachListener(conn, listenerGuid, handler, `${feed}|${productId}`, {
    subscribe: JSON.stringify({ event: 'subscribe', ...request }),
    unsubscribe: JSON.stringify({ event: 'unsubscribe', ...request }),
  });
};

const subscribe = async (
  symbolInfo: LibrarySymbolInfo,
  resolution: ResolutionString,
  onTick: SubscribeBarsCallback,
  listenerGuid: string
): Promise<void> => {
  try {
    if (isFuturesExchange(symbolInfo.exchange)) {
      await subscribeFutures(symbolInfo, resolution, onTick, listenerGuid);
    } else {
      await subscribeSpot(symbolInfo, resolution, onTick, listenerGuid);
    }
  } catch (err) {
    console.error('[Kraken] subscribe failed:', err);
  }
};

const unsubscribe = (listenerGuid: string): void => {
  for (const [key, conn] of [...connections]) {
    const cleanup = conn.cleanups.get(listenerGuid);
    if (cleanup) {
      conn.cleanups.delete(listenerGuid);
      cleanup();
    }
    if (conn.listeners.delete(listenerGuid)) {
      closeIfIdle(key);
    }
  }
};

export const krakenHandler: ExchangeHandler = {
  config,
  paginationLogic,
  subscribe,
  unsubscribe,
};
