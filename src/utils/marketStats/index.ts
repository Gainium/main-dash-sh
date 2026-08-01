import { ExchangeEnum, ExchangeIntervals, timeIntervalMap } from '@/types';
import { removePaperPrefix } from '@/utils/exchangeUtils';
import { requestCandles } from '@/utils/tradingView/historyApi';
import type { CandleResponse } from '@/utils/tradingView/types';

import {
  computeMarketStats,
  type Candle,
  type MarketStats,
} from './indicators';

export type { Candle, MarketStats, RollingDrawdownStats } from './indicators';
export {
  computeATR,
  computeATRPercent,
  computeDrawdownEpisodes,
  computeMarketStats,
  computeMaxDrawdownPercent,
  computeRollingMaxDrawdowns,
  FULL_YEAR_CANDLES,
  MONTH_WINDOW_CANDLES,
  percentile,
} from './indicators';

/**
 * Trim + uppercase, but keep separators. Different exchanges store
 * symbols differently (Binance: BTCUSDT, Hyperliquid: AAPL-USDC) and
 * the backend forwards the raw symbol to the venue, so we must not
 * strip separators here.
 */
export const normalizeSymbol = (raw: string | undefined | null): string =>
  // `String(...)` rather than a bare `?? ''`: callers feed this straight from
  // `formData.pair`, which is typed `string | string[]` but is seeded from
  // untyped channels (sessionStorage `botConfig`, URL hints). A numeric pair
  // slipped through and `(raw ?? '').trim()` threw during QuickBotForm's
  // render. Matches the `String(x ?? '').trim()` idiom used elsewhere.
  String(raw ?? '')
    .trim()
    .toUpperCase();

const TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  fetchedAt: number;
  stats: MarketStats | null;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<MarketStats | null>>();

const cacheKey = (
  symbol: string,
  exchange: ExchangeEnum,
  interval: ExchangeIntervals,
  count: number
) => `${exchange}::${symbol}::${interval}::${count}`;

const toCandle = (c: CandleResponse): Candle => ({
  open: parseFloat(c.open),
  high: parseFloat(c.high),
  low: parseFloat(c.low),
  close: parseFloat(c.close),
  time: c.time,
});

export interface FetchMarketStatsArgs {
  symbol: string;
  exchange: ExchangeEnum;
  interval?: ExchangeIntervals;
  /**
   * Number of candles to fetch. Defaults to 380 — enough for a full
   * year of dailies plus a small buffer, which is what the calibrated
   * preset logic needs to be honest about drawdown percentiles.
   */
  count?: number;
}

/**
 * Fetches recent candles and returns derived market statistics
 * (latest price, ATR%, 30-bar drawdown). Cached in-memory for 5
 * minutes per (exchange, symbol, interval, count) key.
 *
 * Returns `null` if the API returned nothing or the data was too
 * sparse to compute ATR. Errors are caught and surfaced as `null` —
 * callers should treat absence as "fall back to defaults".
 */
export const fetchMarketStats = async ({
  symbol,
  exchange,
  interval = ExchangeIntervals.oneD,
  count = 380,
}: FetchMarketStatsArgs): Promise<MarketStats | null> => {
  const normalized = normalizeSymbol(symbol);
  if (!normalized || !exchange) return null;

  // The candles endpoint expects the underlying (non-paper) exchange.
  const effectiveExchange = removePaperPrefix(exchange);

  const key = cacheKey(normalized, effectiveExchange, interval, count);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return cached.stats;
  }
  const existing = inflight.get(key);
  if (existing) return existing;

  const intervalMs = timeIntervalMap[interval];
  const now = Date.now();
  const startAt = String(now - intervalMs * (count + 5));
  const endAt = String(now);

  const promise = (async () => {
    try {
      const raw = await requestCandles({
        symbol: normalized,
        exchange: effectiveExchange,
        type: interval,
        startAt,
        endAt,
        limit: count + 5,
      });
      const candles = raw.map(toCandle).sort((a, b) => a.time - b.time);
      const stats = computeMarketStats(candles);
      cache.set(key, { fetchedAt: Date.now(), stats });
      return stats;
    } catch {
      cache.set(key, { fetchedAt: Date.now(), stats: null });
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
};

/** Test helper — drops the in-memory cache. */
export const __resetMarketStatsCache = () => {
  cache.clear();
  inflight.clear();
};

/**
 * Element-wise max of drawdown depths and ATR across multiple pairs.
 * Use this to size a multi-pair DCA bot for the worst coin in the set
 * — the safety ladder must survive the deepest drawdown of any pair
 * it might enter on, otherwise that pair's deals would blow through
 * the bottom of the ladder.
 *
 * `hasFullYear` requires *all* pairs to have full history; otherwise
 * the calibration callers fall back to static defaults.
 */
export const mergeMarketStats = (
  statsList: MarketStats[]
): MarketStats | null => {
  if (!Array.isArray(statsList) || statsList.length === 0) return null;
  const finite = statsList.filter((s): s is MarketStats => s !== null);
  if (finite.length === 0) return null;
  const max = (sel: (s: MarketStats) => number) =>
    finite.reduce((m, s) => Math.max(m, sel(s)), 0);
  const min = (sel: (s: MarketStats) => number) =>
    finite.reduce((m, s) => Math.min(m, sel(s)), Number.POSITIVE_INFINITY);
  return {
    // latestPrice loses meaning across pairs — pick any (the first's).
    latestPrice: finite[0].latestPrice,
    candleCount: min((s) => s.candleCount),
    hasFullYear: finite.every((s) => s.hasFullYear),
    atr: max((s) => s.atr),
    atrPct: max((s) => s.atrPct),
    drawdowns: {
      month: {
        p50: max((s) => s.drawdowns.month.p50),
        p80: max((s) => s.drawdowns.month.p80),
        p100: max((s) => s.drawdowns.month.p100),
        // Sample count — pick the *min* so the gate ("≥1 sample") is
        // honest about the worst-covered pair.
        sampleCount: min((s) => s.drawdowns.month.sampleCount),
      },
      fullPeriodMax: max((s) => s.drawdowns.fullPeriodMax),
    },
  };
};

export interface MultiPairStatsResult {
  /** Merged worst-of stats. Null when no pair had usable history. */
  stats: MarketStats | null;
  /** Total pairs requested. */
  total: number;
  /** Symbols of the pairs that contributed to the merge (full year of data). */
  included: string[];
  /** Symbols of the pairs that were skipped (failed fetch or <1y). */
  skipped: string[];
}

/**
 * Fetches MarketStats for every pair in parallel and merges them via
 * `mergeMarketStats`. Pairs without enough history (or that failed to
 * fetch) are skipped — their symbols are reported back so the UI can
 * surface "N pairs skipped due to insufficient data".
 */
export const fetchMarketStatsForPairs = async (args: {
  symbols: string[];
  exchange: ExchangeEnum;
  interval?: ExchangeIntervals;
  count?: number;
}): Promise<MultiPairStatsResult> => {
  const { symbols, exchange, interval, count } = args;
  if (!Array.isArray(symbols) || symbols.length === 0 || !exchange) {
    return { stats: null, total: 0, included: [], skipped: [] };
  }
  const results = await Promise.all(
    symbols.map((symbol) =>
      fetchMarketStats({
        symbol,
        exchange,
        ...(interval ? { interval } : {}),
        ...(count ? { count } : {}),
      })
    )
  );
  const usable: MarketStats[] = [];
  const included: string[] = [];
  const skipped: string[] = [];
  results.forEach((r, i) => {
    if (r && r.hasFullYear) {
      usable.push(r);
      included.push(symbols[i]);
    } else {
      skipped.push(symbols[i]);
    }
  });
  return {
    stats: mergeMarketStats(usable),
    total: symbols.length,
    included,
    skipped,
  };
};
