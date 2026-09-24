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
import { useTradingPairsDataStore } from '@/stores/tradingPairsDataStore';

// Bitget supported resolutions
const BITGET_RESOLUTIONS = [
  '1',
  '5',
  '15',
  '30',
  '60',
  '240',
  '360',
  '720',
  '1D',
  '3D',
  '1W',
  '1M',
] as const;

// Bitget resolution mapping
const BITGET_RESOLUTION_MAP: Record<string, string> = {
  '1': '1min',
  '5': '5min',
  '15': '15min',
  '30': '30min',
  '60': '1h',
  '240': '4h',
  '360': '6Hutc',
  '720': '12Hutc',
  '1D': '1Dutc',
  '3D': '3Dutc',
  '1W': '1Wutc',
  '1M': '1Mutc',
};

// Bitget configuration
const config: ExchangeConfig = {
  name: 'bitget',
  displayName: 'Bitget',
  supportedResolutions: [...BITGET_RESOLUTIONS],
  resolutionMap: BITGET_RESOLUTION_MAP,
  maxLimit: 200,
  websocketUrls: {
    spot: 'wss://ws.bitget.com/v2/ws/public',
    linear: 'wss://ws.bitget.com/v2/ws/public', // Same URL for Bitget
  },
};

// Bitget pagination logic (ascending order - oldest first, like Binance)
const paginationLogic: PaginationLogic = {
  shouldFetchMore: (
    bars: Bar[],
    periodParams: PeriodParams,
    limit: number
  ): boolean => {
    if (bars.length === 0) return false;
    if (bars.length < limit) return false;

    // For ascending order (oldest first), the oldest bar is the first one
    const oldestBarTime = bars[0].time;
    const requestedStartTime = periodParams.from * 1000;

    // If the oldest bar we have is still newer than the requested start time, fetch more
    // If oldestBarTime <= requestedStartTime, we have enough data
    return oldestBarTime > requestedStartTime;
  },

  getNextParams: (
    bars: Bar[],
    currentParams: PeriodParams
  ): PeriodParams | null => {
    if (bars.length === 0) return null;

    // For ascending order (oldest first), the oldest bar is the first one
    const oldestBarTime = bars[0].time;
    const requestedStartTime = currentParams.from * 1000;

    // If we need older data, set 'to' to just before the oldest bar we have
    if (oldestBarTime > requestedStartTime) {
      const nextParams = {
        ...currentParams,
        to: Math.floor(oldestBarTime / 1000) - 1,
      };

      return nextParams;
    }

    return null;
  },
};

// Convert Bitget interval to WebSocket format
const convertBitgetInterval = (interval: string): string => {
  const intervalMap: Record<string, string> = {
    '1min': 'candle1m',
    '5min': 'candle5m',
    '15min': 'candle15m',
    '30min': 'candle30m',
    '1h': 'candle1H',
    '4h': 'candle4H',
    '6Hutc': 'candle6Hutc',
    '12Hutc': 'candle12Hutc',
    '1Dutc': 'candle1Dutc',
    '3Dutc': 'candle3Dutc',
    '1Wutc': 'candle1Wutc',
    '1Mutc': 'candle1Mutc',
  };
  return intervalMap[interval] || 'candle1m';
};

/*
 * The v2 `instType` of a pair, from the exchange enum the chart carries
 * upper-cased (`BITGETUSDM`, `PAPERBITGETCOINM`, ...). The USD-M line holds
 * both the USDT-margined perps and the USDC-margined ones (`BTCPERP`), which
 * Bitget files under separate product types; paper venues stream the live
 * market. A wrong instType either ticks another market's price (spot for a
 * perp) or is rejected and leaves the live bar frozen.
 */
const getBitgetInstType = (exchange: string | undefined, pair: string) => {
  const venue = (exchange ?? '').toLowerCase().replace(/^paper/, '');
  if (venue === 'bitgetcoinm') return 'COIN-FUTURES';
  if (venue === 'bitgetusdm') {
    return pair.endsWith('USDT') ? 'USDT-FUTURES' : 'USDC-FUTURES';
  }
  return 'SPOT';
};

// WebSocket subscription management
const subscriptions: Record<string, WebSocket> = {};
const keepalives: Record<string, ReturnType<typeof setInterval>> = {};

/*
 * Pairs whose candles Bitget pushes only on the v3 `kline` topic:
 *
 * - Reality stock tokens (`RAAPLUSDT`). Bitget accepts a v2 `candle*`
 *   subscription for them and then sends nothing. A pair is a Reality token
 *   when it is a Bitget SPOT pair of class `stock` — the connection lists only
 *   the rows Bitget itself flags `isReality` as spot stocks.
 * - COIN-M perpetuals (`BTCUSD`). They moved to the unified line, where they
 *   are named with a `_CM` suffix (`BTCUSD_CM`); v2 refuses them. The
 *   quarterly contracts (`BTCUSDU26`) stayed on v2 and stream there.
 *
 * v3 buckets are UTC-aligned only at 1m/5m/15m/1H/4H (its 6H, 12H and 1D open
 * on UTC+8 boundaries — 1D at 16:00 UTC, not the UTC-midnight bar the chart
 * shows — and it has no weekly). Wider widths are built here from a finer
 * stream, into the same UTC-aligned buckets the history is aggregated into by
 * the exchange connection.
 */
const V3_WS_URL = 'wss://ws.bitget.com/v3/ws/public';
const MIN = 60_000;
const V3_NATIVE: Record<string, string> = {
  '1': '1m',
  '5': '5m',
  '15': '15m',
  '60': '1H',
  '240': '4H',
};
const V3_FOLDED: Record<
  string,
  { interval: string; baseType: string; stepMs: number; weekly?: boolean }
> = {
  '30': { interval: '15m', baseType: '15min', stepMs: 30 * MIN },
  '360': { interval: '1H', baseType: '1h', stepMs: 360 * MIN },
  '720': { interval: '4H', baseType: '4h', stepMs: 720 * MIN },
  '1D': { interval: '4H', baseType: '4h', stepMs: 1440 * MIN },
  '1W': {
    interval: '4H',
    baseType: '4h',
    stepMs: 7 * 1440 * MIN,
    weekly: true,
  },
};
/** 1970-01-01 was a Thursday; weeks start on Monday, 4 days later. */
const WEEK_ALIGN_MS = 4 * 1440 * MIN;

const isRealityPair = (symbolInfo: LibrarySymbolInfo): boolean => {
  const venue = (symbolInfo.exchange || '').toLowerCase();
  if (venue.replace(/^paper/, '') !== 'bitget') return false;
  const { pairsByProvider } = useTradingPairsDataStore.getState();
  const key = Object.keys(pairsByProvider).find(
    (k) => k.toLowerCase() === venue
  );
  return (
    !!key && pairsByProvider[key]?.[symbolInfo.name]?.assetCategory === 'stock'
  );
};

type V3Feed = {
  instType: string;
  /** The venue's name for the pair on v3. */
  symbol: string;
  /** The exchange the history API serves the pair's candles under. */
  historyExchange: string;
};

const getV3Feed = (symbolInfo: LibrarySymbolInfo): V3Feed | null => {
  const venue = (symbolInfo.exchange || '').toLowerCase().replace(/^paper/, '');
  const pair = symbolInfo.name;
  if (venue === 'bitgetcoinm' && !/[A-Z]\d{2}$/.test(pair)) {
    return {
      instType: 'coin-futures',
      symbol: `${pair}_CM`,
      historyExchange: 'bitgetCoinm',
    };
  }
  if (isRealityPair(symbolInfo)) {
    return { instType: 'spot', symbol: pair, historyExchange: 'bitget' };
  }
  return null;
};

type BaseCandle = { o: number; h: number; l: number; c: number; v: number };

/** The candles of the running bucket at the base width, from the history API. */
const seedBucket = async (
  exchange: string,
  pair: string,
  baseType: string,
  bucketStart: number
): Promise<Map<number, BaseCandle>> => {
  const seeded = new Map<number, BaseCandle>();
  try {
    const url = new URL(`${import.meta.env.VITE_API_ENDPOINT}/candles`);
    url.searchParams.set('exchange', exchange);
    url.searchParams.set('symbol', pair);
    url.searchParams.set('type', baseType);
    url.searchParams.set('startAt', `${bucketStart}`);
    url.searchParams.set('endAt', `${Date.now()}`);
    const res = await (await fetch(url.toString())).json();
    for (const c of res?.data ?? []) {
      if (+c.time >= bucketStart) {
        seeded.set(+c.time, {
          o: +c.open,
          h: +c.high,
          l: +c.low,
          c: +c.close,
          v: +c.volume,
        });
      }
    }
  } catch (error) {
    console.error('Bitget v3 bucket seed failed:', error);
  }
  return seeded;
};

const subscribeV3 = (
  symbolInfo: LibrarySymbolInfo,
  feed: V3Feed,
  resolution: ResolutionString,
  onTick: SubscribeBarsCallback,
  listenerGuid: string
): boolean => {
  const native = V3_NATIVE[resolution];
  const folded = V3_FOLDED[resolution];
  if (!native && !folded) return false;
  const interval = native ?? folded.interval;
  const pair = symbolInfo.name;

  // Folded widths: the base candles of the running bucket, keyed by start.
  let bucketStart = -1;
  let base = new Map<number, BaseCandle>();
  let seeding: Promise<void> | null = null;
  const bucketOf = (t: number) => {
    const offset = folded?.weekly ? WEEK_ALIGN_MS : 0;
    return Math.floor((t - offset) / folded.stepMs) * folded.stepMs + offset;
  };
  const emitFolded = () => {
    const starts = [...base.keys()].sort((a, b) => a - b);
    if (!starts.length) return;
    const first = base.get(starts[0]) as BaseCandle;
    const last = base.get(starts[starts.length - 1]) as BaseCandle;
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;
    for (const c of base.values()) {
      high = Math.max(high, c.h);
      low = Math.min(low, c.l);
      volume += c.v;
    }
    onTick({
      time: bucketStart,
      open: first.o,
      high,
      low,
      close: last.c,
      volume,
    });
  };

  const ws = new WebSocket(V3_WS_URL);
  ws.onopen = () => {
    ws.send(
      JSON.stringify({
        op: 'subscribe',
        args: [
          {
            instType: feed.instType,
            topic: 'kline',
            symbol: feed.symbol,
            interval,
          },
        ],
      })
    );
    keepalives[listenerGuid] = setInterval(() => ws.send('ping'), 25_000);
  };
  ws.onmessage = (event) => {
    if (event.data === 'pong') return;
    try {
      const data = JSON.parse(event.data);
      if (
        data.arg?.topic !== 'kline' ||
        data.arg?.symbol !== feed.symbol ||
        data.arg?.interval !== interval ||
        !Array.isArray(data.data)
      ) {
        return;
      }
      // COIN-M perpetuals open with a snapshot of 500 candles, oldest first
      // (Reality tokens send none). Only the running candle, or the running
      // bucket's, is live; an older one taken as the first bucket seen would
      // seed that bucket's history through to now and fold months into one bar.
      const latest = Math.max(
        ...data.data.map((k: { start: string }) => +k.start)
      );
      const floor = native ? latest : bucketOf(latest);
      for (const k of data.data) {
        const start = +k.start;
        if ((native ? start : bucketOf(start)) < floor) continue;
        const candle: BaseCandle = {
          o: +k.open,
          h: +k.high,
          l: +k.low,
          c: +k.close,
          // Quote volume, as the history's volume is.
          v: +k.turnover,
        };
        if (native) {
          onTick({
            time: start,
            open: candle.o,
            high: candle.h,
            low: candle.l,
            close: candle.c,
            volume: candle.v,
          });
          continue;
        }
        const bucket = bucketOf(start);
        if (bucket < bucketStart) continue;
        if (bucket > bucketStart) {
          // A new bucket. The first one seen needs its earlier base candles
          // from history, or the bar would be rebuilt from this update alone;
          // later buckets open while subscribed, so every base candle of
          // theirs arrives here.
          const isFirst = bucketStart < 0;
          bucketStart = bucket;
          base = new Map();
          if (isFirst) {
            seeding = seedBucket(
              feed.historyExchange,
              pair,
              folded.baseType,
              bucket
            ).then((s) => {
              for (const [t, c] of s) if (!base.has(t)) base.set(t, c);
              seeding = null;
              emitFolded();
            });
          }
        }
        base.set(start, candle);
        if (!seeding) emitFolded();
      }
    } catch (error) {
      console.error('Error parsing Bitget v3 kline message:', error);
    }
  };
  ws.onerror = (error) => {
    console.error('Bitget v3 WebSocket error:', error);
  };
  subscriptions[listenerGuid] = ws;
  return true;
};

// Subscribe to Bitget WebSocket
const subscribe = async (
  symbolInfo: LibrarySymbolInfo,
  resolution: ResolutionString,
  onTick: SubscribeBarsCallback,
  listenerGuid: string
): Promise<void> => {
  try {
    const v3Feed = getV3Feed(symbolInfo);
    if (
      v3Feed &&
      subscribeV3(symbolInfo, v3Feed, resolution, onTick, listenerGuid)
    ) {
      return;
    }
    const interval = config.resolutionMap[resolution] || '1min';

    const instType = getBitgetInstType(symbolInfo.exchange, symbolInfo.name);
    const wsUrl =
      config.websocketUrls?.[instType === 'SPOT' ? 'spot' : 'linear'];
    const bitgetChannel = convertBitgetInterval(interval);

    const ws = new WebSocket(wsUrl ?? '');

    ws.onopen = () => {
      // Subscribe to the kline channel
      const subscribeMessage = {
        op: 'subscribe',
        args: [
          {
            instType: instType,
            channel: bitgetChannel,
            instId: symbolInfo.name,
          },
        ],
      };
      ws.send(JSON.stringify(subscribeMessage));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (
          data.arg?.channel === bitgetChannel &&
          data.arg?.instId === symbolInfo.name &&
          data.data
        ) {
          // The subscribe snapshot is 500 candles, oldest first; an update
          // carries one. Either way the running bar is the last.
          const klineData = data.data[data.data.length - 1];
          if (klineData && Array.isArray(klineData)) {
            const bar: Bar = {
              time: parseInt(klineData[0]), // timestamp
              open: parseFloat(klineData[1]),
              high: parseFloat(klineData[2]),
              low: parseFloat(klineData[3]),
              close: parseFloat(klineData[4]),
              volume: parseFloat(klineData[6]), // volume is at index 6 for Bitget
            };
            onTick(bar);
          }
        }
      } catch (error) {
        console.error('Error parsing Bitget WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('Bitget WebSocket error:', error);
    };

    subscriptions[listenerGuid] = ws;
  } catch (error) {
    console.error('Error creating Bitget WebSocket connection:', error);
  }
};

// Unsubscribe from WebSocket
const unsubscribe = (listenerGuid: string): void => {
  clearInterval(keepalives[listenerGuid]);
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete keepalives[listenerGuid];
  const ws = subscriptions[listenerGuid];
  if (ws) {
    ws.close();
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete subscriptions[listenerGuid];
  }
};

// Export Bitget exchange handler
export const bitgetHandler: ExchangeHandler = {
  config,
  paginationLogic,
  subscribe,
  unsubscribe,
};
