import { logger } from '@/lib/loggerInstance';
import { ExchangeEnum, ExchangeIntervals, timeIntervalMap } from '@/types';
import Candles from '../candles';
import { removePaperPrefix, toExchangeCandleSymbol } from '../exchangeUtils';
import { mapStringToExchange } from './factory';
import {
  type Bar,
  type CandleResponse,
  type ExchangeHandler,
  type LibrarySymbolInfo,
  type PeriodParams,
  type ResolutionString,
} from './types';

// Store reset callbacks keyed by symbol@interval
/* const resetCallbacks = new Map<string, () => void>();

export const registerResetCallback = (
  symbol: string,
  interval: string,
  callback: () => void
) => {
  const key = `${symbol}@${interval}`;
  resetCallbacks.set(key, callback);
  logger.debugCategory(
    'tradingview:historyapi:cache',
    '[registerResetCallback] Registered reset callback',
    { key }
  );
};

export const unregisterResetCallback = (symbol: string, interval: string) => {
  const key = `${symbol}@${interval}`;
  resetCallbacks.delete(key);
  logger.debugCategory(
    'tradingview:historyapi:cache',
    '[unregisterResetCallback] Unregistered reset callback',
    { key }
  );
}; */

/* const triggerChartReset = (symbol: string, interval: string) => {
  const key = `${symbol}@${interval}`;
  const callback = resetCallbacks.get(key);
  if (callback) {
    logger.infoCategory(
      'tradingview:historyapi:cache',
      '[triggerChartReset] Triggering chart reset',
      { key }
    );
    callback();
  } else {
    logger.warnCategory(
      'tradingview:historyapi:cache',
      '[triggerChartReset] No reset callback found',
      { key, availableKeys: Array.from(resetCallbacks.keys()) }
    );
  }
}; */

// Convert unified candle response to Bar format
const convertCandle = (candle: CandleResponse): Bar => ({
  time: candle.time,
  open: parseFloat(candle.open),
  high: parseFloat(candle.high),
  low: parseFloat(candle.low),
  close: parseFloat(candle.close),
  volume: parseFloat(candle.volume),
});

// Base return type from your API
interface BaseReturn<T> {
  status: 'OK' | 'NOTOK';
  data: T | null;
  reason: string;
}

// Request candles from your unified API
export const requestCandles = async ({
  symbol,
  endAt,
  startAt,
  type,
  exchange,
  limit,
  signal,
}: {
  symbol: string;
  endAt: string;
  startAt: string;
  type: string;
  exchange: ExchangeEnum;
  limit?: number;
  signal?: AbortSignal | undefined;
}): Promise<CandleResponse[]> => {
  // Selection already changed before this request even started — don't fire.
  if (signal?.aborted) {
    return [];
  }
  try {
    const effectiveExchange = exchange;
    const url = new URL(`${import.meta.env.VITE_API_ENDPOINT}/candles`);
    url.searchParams.set('exchange', effectiveExchange);
    // KuCoin spot's candle API needs the dashed native symbol (BTC-USDT); the
    // app stores pairs concatenated (BTCUSDT). Normalize here — the one place
    // every candle fetch (chart, backtest, market-stats) funnels through.
    url.searchParams.set(
      'symbol',
      toExchangeCandleSymbol(effectiveExchange, symbol)
    );
    url.searchParams.set('type', type);
    url.searchParams.set('startAt', startAt);
    url.searchParams.set('endAt', endAt);
    if (limit) {
      url.searchParams.set('limit', limit.toString());
    }

    logger.debugCategory(
      'tradingview:api:request',
      `[RequestCandles] API call: ${url.toString()} | Range: ${new Date(Number(startAt)).toISOString()} to ${new Date(Number(endAt)).toISOString()} | Duration: ${((Number(endAt) - Number(startAt)) / 1000 / 60 / 60).toFixed(2)}h | Type: ${type}`
    );

    // Create an AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    // Bridge the caller's abort signal (fired when the user switches
    // exchange/pair) onto our controller so a slow, still-pending request —
    // notably Hyperliquid, whose candle endpoint can hang for the full 30s
    // on some pairs — is cancelled the instant the selection changes,
    // instead of freezing the chart until the timeout fires.
    const onExternalAbort = () => controller.abort();
    if (signal) {
      signal.addEventListener('abort', onExternalAbort, { once: true });
    }

    try {
      const response = await fetch(url.toString(), {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: BaseReturn<CandleResponse[]> = await response.json();

      if (result.status === 'NOTOK') {
        logger.errorCategory(
          'tradingview',
          `[RequestCandles] API error: ${result.reason} | URL: ${url.toString()}`
        );
        throw new Error(result.reason);
      }

      const dataLength = result.data?.length || 0;
      const firstCandle =
        dataLength > 0 && result.data
          ? new Date(result.data[0].time).toISOString()
          : 'N/A';
      const lastCandle =
        dataLength > 0 && result.data
          ? new Date(result.data[dataLength - 1].time).toISOString()
          : 'N/A';
      logger.debugCategory(
        'tradingview:api:response',
        `[RequestCandles] Response: ${dataLength} candles | Requested: ${new Date(Number(startAt)).toISOString()} to ${new Date(Number(endAt)).toISOString()} | Actual: ${firstCandle} to ${lastCandle}`
      );

      return result.data || [];
    } catch (fetchError) {
      clearTimeout(timeoutId);

      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        // Caller-initiated cancellation (selection changed) vs. the 30s
        // timeout. The former is expected and quiet; the latter is an error.
        if (signal?.aborted) {
          logger.debugCategory(
            'tradingview:api:request',
            '[RequestCandles] Aborted — selection changed before response'
          );
          return [];
        }
        logger.errorCategory(
          'tradingview',
          'Error fetching candles: Request timeout after 30 seconds'
        );
        throw new Error('Request timeout after 30 seconds');
      }

      throw fetchError;
    } finally {
      if (signal) {
        signal.removeEventListener('abort', onExternalAbort);
      }
    }
  } catch (error) {
    logger.errorCategory(
      'tradingview:api:error',
      'Error fetching candles:',
      error
    );
    return [];
  }
};

// Remove paper prefix from exchange name

export const RESOLUTION_MAP: Record<string, string> = {
  '1': '1m',
  '3': '3m',
  '5': '5m',
  '15': '15m',
  '30': '30m',
  '60': '1h',
  '120': '2h',
  '240': '4h',
  '360': '6h',
  '480': '8h',
  '720': '12h',
  '1D': '1d',
  '3D': '3d',
  '1W': '1w',
  '1M': '1M',
};

// Map resolution to ExchangeIntervals enum for caching
export const RESOLUTION_TO_INTERVAL_MAP: Record<
  string,
  ExchangeIntervals | undefined
> = {
  '1': ExchangeIntervals.oneM,
  '3': ExchangeIntervals.threeM,
  '5': ExchangeIntervals.fiveM,
  '15': ExchangeIntervals.fifteenM,
  '30': ExchangeIntervals.thirtyM,
  '60': ExchangeIntervals.oneH,
  '120': ExchangeIntervals.twoH,
  '240': ExchangeIntervals.fourH,
  '480': ExchangeIntervals.eightH,
  '1D': ExchangeIntervals.oneD,
  '1W': ExchangeIntervals.oneW,
};

const MAX_SYNC_CHUNK_BARS = 1000;

/**
 * Given a sorted array of bars and the expected interval step (ms),
 * return the longest contiguous run that includes the LAST bar.
 *
 * "Contiguous" means no gap > 2x step between consecutive bars.
 * The 2x tolerance handles exchange maintenance windows and minor
 * timestamp jitter without breaking real data.
 *
 * Why anchor at the end (most recent)?
 * - For live charts: the user always needs "now" first; older data loads on scroll.
 * - For historical requests: TradingView's `to` is the anchor; `from` is flexible.
 */
function ensureContiguous(bars: Bar[], stepMs: number): Bar[] {
  if (bars.length <= 1) return bars;

  const tolerance = stepMs * 2;

  // Walk backwards from the last bar
  let cutIndex = 0;
  for (let i = bars.length - 1; i > 0; i--) {
    if (bars[i].time - bars[i - 1].time > tolerance) {
      cutIndex = i;
      break;
    }
  }

  return bars.slice(cutIndex);
}

// Main function to get candles with exchange-specific pagination
export const getCandles = async (
  symbolInfo: LibrarySymbolInfo,
  resolution: ResolutionString,
  periodParams: PeriodParams,
  exchangeHandler: ExchangeHandler,
  signal?: AbortSignal
): Promise<Bar[]> => {
  if (signal?.aborted) {
    return [];
  }
  const { config, paginationLogic } = exchangeHandler;
  const exchange =
    mapStringToExchange(symbolInfo?.exchange.toLowerCase()) ||
    ExchangeEnum.binance;
  const cleanExchange = removePaperPrefix(exchange);

  // Get the exchange-specific interval format
  const interval = RESOLUTION_MAP[resolution] || RESOLUTION_MAP['1'];
  const exchangeInterval = RESOLUTION_TO_INTERVAL_MAP[resolution];
  const intervalMs =
    (exchangeInterval && timeIntervalMap[exchangeInterval]) || 60 * 1000;
  const maxSpanSeconds = Math.ceil((MAX_SYNC_CHUNK_BARS * intervalMs) / 1000);

  let allBars: Bar[] = [];
  let currentParams = { ...periodParams };

  // Handle edge cases
  if (currentParams.to < 0) {
    return [];
  }

  if (currentParams.from < 0) {
    currentParams.from = 0;
  }

  // Clamp synchronous range to avoid blocking fetches with very large requests
  const originalSpanSeconds = Math.max(
    0,
    currentParams.to - currentParams.from
  );
  const originalCountBack = currentParams.countBack ?? 0;
  const spanClampNeeded = originalSpanSeconds > maxSpanSeconds;
  const countClampNeeded = originalCountBack > MAX_SYNC_CHUNK_BARS;

  if (spanClampNeeded) {
    currentParams.from = Math.max(currentParams.to - maxSpanSeconds, 0);
  }

  if (countClampNeeded || currentParams.countBack == null) {
    currentParams.countBack = Math.min(
      Math.max(currentParams.countBack ?? MAX_SYNC_CHUNK_BARS, 0),
      MAX_SYNC_CHUNK_BARS
    );
  }

  if (spanClampNeeded || countClampNeeded) {
    logger.infoCategory(
      'tradingview:api:chunk',
      '[HistoryAPI] Limiting synchronous candle request window',
      {
        symbol: symbolInfo.name,
        resolution,
        originalCountBack,
        appliedCountBack: currentParams.countBack,
        originalSpanSeconds,
        appliedSpanSeconds: currentParams.to - currentParams.from,
        maxSpanSeconds,
      }
    );
  }

  // Try to use the Candles cache system if we have a valid interval mapping
  // This checks the cache WITHOUT making any API calls
  if (exchangeInterval) {
    try {
      logger.info('[JournalEntryChart] Checking IndexedDB cache', {
        symbol: symbolInfo.name,
        interval: exchangeInterval,
        from: new Date(periodParams.from * 1000).toISOString(),
        to: new Date(periodParams.to * 1000).toISOString(),
        exchange: cleanExchange,
        countBack: periodParams.countBack,
      });

      const candlesProvider = new Candles(cleanExchange);

      /* // Get cached data directly without fetching missing data
      const cached = await candlesProvider.getCachedCandles(
        symbolInfo.name,
        exchangeInterval
      );

      logger.info('[JournalEntryChart] Cache query result', {
        totalCachedBars: cached.bars.length,
        cachedFirstBar:
          cached.bars.length > 0
            ? new Date(cached.bars[0].time).toISOString()
            : null,
        cachedLastBar:
          cached.bars.length > 0
            ? new Date(cached.bars[cached.bars.length - 1].time).toISOString()
            : null,
        firstTime: cached.firstTime
          ? new Date(cached.firstTime).toISOString()
          : null,
      });

      if (cached.bars.length > 0) {
        const from = periodParams.from * 1000;
        const to = periodParams.to * 1000;

        // Filter cached bars to the requested range
        const filteredBars = cached.bars.filter(
          (bar) => bar.time >= from && bar.time <= to
        );

        // Check if we have good coverage (at least 80% of expected bars)
        const step = timeIntervalMap[exchangeInterval];
        const expectedBars = Math.ceil((to - from) / step);
        const coverage = filteredBars.length / expectedBars;

        logger.info('[JournalEntryChart] Cache coverage analysis', {
          filteredBars: filteredBars.length,
          expectedBars,
          coverage: (coverage * 100).toFixed(1) + '%',
          requestedFrom: new Date(from).toISOString(),
          requestedTo: new Date(to).toISOString(),
          filteredFirstBar:
            filteredBars.length > 0
              ? new Date(filteredBars[0].time).toISOString()
              : null,
          filteredLastBar:
            filteredBars.length > 0
              ? new Date(
                  filteredBars[filteredBars.length - 1].time
                ).toISOString()
              : null,
        });

        // If we have good coverage (>50%), use cached data immediately
        if (coverage > 0.5 && filteredBars.length > 0) {
          logger.infoCategory(
            'tradingview:historyapi:cache',
            '[JournalEntryChart] Using cached data - sufficient coverage'
          );

          // Return cached data immediately for fast UI
          // IMPORTANT: We don't fetch fresh data in the background here because:
          // 1. It can interfere with TradingView's internal request tracking
          // 2. The prefetcher will handle background updates when user scrolls
          // 3. TradingView's onVisibleRangeChanged callback will trigger prefetches
          // This prevents "getBars callback is already called before" errors on initial load
          return filteredBars;
        } else if (filteredBars.length > 0) {
          logger.infoCategory(
            'tradingview:historyapi:cache',
            '[JournalEntryChart] Insufficient cache coverage - fetching via Candles provider',
            {
              reason: 'coverage_too_low',
              threshold: '50%',
            }
          );
        }
      } else {
        logger.infoCategory(
          'tradingview:historyapi:cache',
          '[JournalEntryChart] No cached data found - fetching via Candles provider'
        );
      } */

      // Use the Candles provider to fetch and cache the data
      try {
        const [baseAsset, quoteAsset] = symbolInfo.name.split('/');
        const rawBars = await candlesProvider.getCandles({
          symbol: symbolInfo.name,
          interval: exchangeInterval,
          period: periodParams,
          baseAsset: baseAsset || symbolInfo.name,
          quoteAsset: quoteAsset || 'USDT',
          ...(signal ? { signal } : {}),
        });

        // Ensure TradingView only sees contiguous data on the initial load.
        // The cache may have gaps from different sessions - that's fine for storage,
        // but TradingView interprets gaps as "no data exists."
        // IMPORTANT: Only apply on firstDataRequest. For scroll-back (historical)
        // requests, the Candles provider fetches data for the specific range —
        // stripping it prevents historical bars from loading.
        const bars = periodParams.firstDataRequest
          ? ensureContiguous(rawBars, intervalMs)
          : rawBars;

        logger.infoCategory(
          'tradingview:historyapi:cache',
          '[JournalEntryChart] Fetched and cached data via Candles provider',
          {
            bars: bars.length,
            firstBar:
              bars.length > 0 ? new Date(bars[0].time).toISOString() : null,
            lastBar:
              bars.length > 0
                ? new Date(bars[bars.length - 1].time).toISOString()
                : null,
          }
        );

        return bars;
      } catch (error) {
        logger.error(
          '[JournalEntryChart] Failed to fetch via Candles provider:',
          error
        );
        // Fall through to direct API call as fallback
      }
    } catch (error) {
      logger.warnCategory(
        'tradingview:api:cache',
        '[HistoryAPI] Failed to use Candles provider:',
        error
      );
      // Fall through to direct API call if Candles provider fails
    }
  } else {
    logger.debugCategory(
      'tradingview:api:cache',
      '[HistoryAPI] No interval mapping for resolution:',
      resolution
    );
  }

  // Fetch initial batch
  const initialCandles = await requestCandles({
    symbol: symbolInfo.name,
    type: interval,
    startAt: (currentParams.from * 1000).toString(),
    endAt: (currentParams.to * 1000).toString(),
    exchange: cleanExchange,
    limit: config.maxLimit,
    ...(signal ? { signal } : {}),
  });

  if (initialCandles.length === 0) {
    return [];
  }

  // Convert to bars
  const initialBars = initialCandles
    .map(convertCandle)
    .sort((a, b) => a.time - b.time);

  allBars = [...initialBars];
  let limit = config.maxLimit;
  let i = 1;

  // Check if we need more data using exchange-specific pagination logic
  while (
    allBars.length < config.maxLimit &&
    paginationLogic.shouldFetchMore(allBars, periodParams, limit)
  ) {
    if (signal?.aborted) {
      break; // Selection changed — stop paginating.
    }
    i = i + 1;
    limit = config.maxLimit * i;
    const nextParams = paginationLogic.getNextParams(allBars, currentParams);

    if (!nextParams) {
      break; // No more data to fetch
    }

    const nextCandles = await requestCandles({
      symbol: symbolInfo.name,
      type: interval,
      startAt: (nextParams.from * 1000).toString(),
      endAt: (nextParams.to * 1000).toString(),
      exchange: cleanExchange,
      limit: config.maxLimit,
      ...(signal ? { signal } : {}),
    });

    if (nextCandles.length === 0) {
      break; // No more data available
    }

    const nextBars = nextCandles
      .map(convertCandle)
      .sort((a, b) => a.time - b.time);

    // For exchanges that return data in ascending order (oldest first),
    // when fetching older data, prepend to the beginning
    // For exchanges that return data in descending order (newest first),
    // when fetching older data, prepend older data to maintain chronological order
    if (config.name === 'binance' || config.name === 'bitget') {
      // Ascending order exchanges - prepend older data
      allBars = [...nextBars, ...allBars];
    } else {
      // OKX/Bybit: prepend older data (like original: current + older)
      allBars = [...nextBars, ...allBars];
    }
    currentParams = nextParams;
  }

  // Remove duplicates and sort
  const uniqueBars = allBars.filter(
    (bar, index, arr) => index === 0 || bar.time !== arr[index - 1].time
  );

  const sortedBars = uniqueBars.sort((a, b) => a.time - b.time);
  const limitedBars =
    sortedBars.length > MAX_SYNC_CHUNK_BARS
      ? sortedBars.slice(sortedBars.length - MAX_SYNC_CHUNK_BARS)
      : sortedBars;

  if (sortedBars.length > MAX_SYNC_CHUNK_BARS) {
    logger.debugCategory(
      'tradingview:api:chunk',
      '[HistoryAPI] Returning capped chunk of candles',
      {
        symbol: symbolInfo.name,
        resolution,
        returnedBars: limitedBars.length,
        totalFetched: sortedBars.length,
        maxSyncBars: MAX_SYNC_CHUNK_BARS,
      }
    );
  }

  return limitedBars;
};
