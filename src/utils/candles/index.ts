import {
  ExchangeEnum,
  ExchangeIntervals,
  intervalMap,
  timeIntervalMap,
  type StoreCandles,
} from '@/types';
import { removePaperPrefix } from '@/utils/exchangeUtils';
import { handleError } from '@/utils/indexedDb';
import { requestCandles } from '@/utils/tradingView/historyApi';
import { type Bar, type PeriodParams } from '@/utils/tradingView/types';
import logger from '../../lib/loggerInstance';
import { DBCredentials, getById, save } from './db';

type GetCandlesInput = {
  symbol: string;
  interval: ExchangeIntervals;
  period: PeriodParams;
  baseAsset: string;
  quoteAsset: string;
  updateProgress?:
    | ((value: number, text: string, step?: number) => void)
    | undefined;
  index?: number | undefined;
  total?: number | undefined;
  handleErrorByCandles?: ((msg: string) => void) | undefined;
  // Aborted when the user switches exchange/pair while a slow load is still
  // in flight, so we stop paginating and cancel the pending fetch.
  signal?: AbortSignal | undefined;
};

class Candles {
  private exchangeName: ExchangeEnum;

  private _stop = false;

  constructor(exchange: ExchangeEnum) {
    this.exchangeName = removePaperPrefix(exchange);
  }

  public set stop(value: boolean) {
    this._stop = value;
  }

  private async handleError(error: string) {
    handleError(error, DBCredentials.store);
  }

  private getId(symbol: string, interval: ExchangeIntervals) {
    return `${symbol}@${interval}@${this.exchangeName}`;
  }

  private convertCandleToCSV(data: Bar[]) {
    return `${data
      .map(
        (d) => `${d.open};${d.high};${d.low};${d.close};${d.volume};${d.time}`
      )
      .join('\n')}`;
  }

  private convertCSVToCandles(data: string): Bar[] {
    const lines = data.split('\n');
    const bars: Bar[] = [];
    const setTime: Set<number> = new Set();
    lines.forEach((l) => {
      const splits = l.split(';');
      if (splits.length === 6) {
        let isNaNValues = false;
        splits.forEach((s) => {
          if (isNaN(+s)) {
            isNaNValues = true;
          }
        });
        if (!isNaNValues) {
          if (!setTime.has(+splits[5])) {
            const bar: Bar = {
              open: +splits[0],
              high: +splits[1],
              low: +splits[2],
              close: +splits[3],
              volume: +splits[4],
              time: +splits[5],
            };
            bars.push(bar);
            setTime.add(bar.time);
          }
        }
      }
    });
    return bars.sort((a, b) => a.time - b.time);
  }

  private getPeriodsInCandle(
    candles: Bar[],
    interval: ExchangeIntervals
  ): StoreCandles['periods'] {
    if (!candles.length) {
      return [];
    }
    let first = candles[0].time;
    let last = first;
    const periods: StoreCandles['periods'] = [];
    const step = timeIntervalMap[interval];
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      // Detect gaps by comparing consecutive bars instead of using
      // absolute index from array start (which breaks after the first gap)
      if (i > 0 && c.time - candles[i - 1].time > step) {
        if (first !== last) {
          periods.push({ from: first, to: last });
        }
        first = c.time;
      }
      last = c.time;
    }
    if (first !== last) {
      periods.push({ from: first, to: last });
    }
    return periods;
  }

  private async saveLocal(
    symbol: string,
    interval: ExchangeIntervals,
    candles: Bar[],
    baseAsset: string,
    quoteAsset: string,
    firstTime?: number
  ) {
    if (!candles.length) {
      return;
    }
    if (this._stop) {
      return;
    }
    try {
      const data = this.convertCandleToCSV(candles);
      const file = new File([data], 'temp.csv', {
        type: 'test/plain',
      });
      const { size } = file;
      const entry: StoreCandles = {
        symbol,
        interval,
        data,
        size,
        periods: this.getPeriodsInCandle(candles, interval),
        id: this.getId(symbol, interval),
        exchange: this.exchangeName,
        baseAsset,
        quoteAsset,
        firstTime,
      };
      await save(entry);
    } catch (e) {
      const error = (e as Error)?.message || e;
      if (error && `${error}` !== 'QuotaExceededError') {
        this.handleError(`Catch error in save candles ${error}`);
      }
    }
  }

  private async getLocal(
    symbol: string,
    interval: ExchangeIntervals
  ): Promise<{ bars: Bar[]; firstTime?: number | undefined }> {
    if (this._stop) {
      return { bars: [] };
    }
    try {
      const id = this.getId(symbol, interval);
      const value = await getById(id, true);
      if (value) {
        return {
          bars: this.convertCSVToCandles(value.data),
          firstTime: value.firstTime,
        };
      }
      return { bars: [] };
    } catch (e) {
      this.handleError(`Catch error in load candles ${(e as Error)?.message}`);
      return { bars: [] };
    }
  }

  /**
   * Get cached candles without making any API calls
   * Useful for checking if data exists locally before deciding to fetch
   */
  async getCachedCandles(
    symbol: string,
    interval: ExchangeIntervals
  ): Promise<{ bars: Bar[]; firstTime?: number | undefined }> {
    return this.getLocal(symbol, interval);
  }

  async getCandles({
    symbol,
    period,
    interval,
    baseAsset,
    quoteAsset,
    updateProgress,
    index,
    total,
    handleErrorByCandles,
    signal,
  }: GetCandlesInput): Promise<Bar[]> {
    try {
      const local = await this.getLocal(symbol, interval);
      const step = timeIntervalMap[interval];
      const from = period.from * 1000;
      const to = period.to * 1000;
      let required = local.bars.filter((l) => l.time >= from && l.time <= to);
      let missed: { from: number; to: number }[] = [];
      // Use the caller's requested range as the max gap we'll fill.
      // This respects what the caller actually needs without arbitrary limits.
      // Safety cap at 1 year to prevent truly pathological downloads.
      const ABSOLUTE_MAX_GAP_MS = 365 * 24 * 60 * 60 * 1000;
      const maxGapMs = Math.min(to - from, ABSOLUTE_MAX_GAP_MS);
      let i = 0;
      for (const r of required) {
        if (i !== 0) {
          const gapMs = r.time - required[i - 1].time;
          if (gapMs > step) {
            if (gapMs <= maxGapMs) {
              missed.push({ from: required[i - 1].time, to: r.time });
            } else {
              logger.warn(
                `[Candles.getCandles] Skipping large intra-cache gap of ${(gapMs / 86_400_000).toFixed(0)} days between cached segments for ${symbol}@${interval}. Gap exceeds requested range.`
              );
            }
          }
        }
        i++;
      }
      const requiredIndex: Set<number> = new Set();
      const durationDays = (to - from) / 1000 / 60 / 60 / 24;

      if (!required.length) {
        logger.info(
          `[Candles.getCandles] No cached data, requesting full range: from=${new Date(from).toISOString()} to=${new Date(to).toISOString()} duration=${durationDays.toFixed(1)} days`
        );

        // Warning for large requests
        if (durationDays > 30) {
          console.warn(
            `[Candles.getCandles] WARNING: Requesting ${durationDays.toFixed(1)} days of data! This will take a long time. Stack trace:`,
            new Error().stack
          );
        }

        missed.push({ from, to });
      } else {
        const first = required[0];
        const last = required[required.length - 1];
        // Only fetch earlier data if we don't have data covering the start
        if (first.time > from + step) {
          missed.push({ from, to: first.time });
        }
        // Only fetch later data if we don't have data covering the end
        if (last.time < to - step) {
          missed.push({ from: last.time, to });
        }
      }
      // Only apply firstTime filter for non-TradingView requests (e.g., backtesting).
      // For TradingView scroll-back requests (!firstDataRequest), the cached firstTime
      // may be stale/wrong (set by a countBack-limited initial load that doesn't prove
      // the exchange has no earlier data). Skipping the filter lets the API call happen;
      // if the exchange truly has no data, the API returns empty and TradingView sets noData.
      if (period.firstDataRequest) {
        missed = missed.filter(
          (m) => m.from > (local.firstTime || 0) && m.to > (local.firstTime || 0)
        );
      }

      // Cap each individual gap to maxGapMs (the caller's requested range).
      // Leading/trailing gaps also get capped so we never try to download
      // more data than the caller actually needs.
      missed = missed
        .map((m) => {
          const gapMs = m.to - m.from;
          if (gapMs > maxGapMs) {
            logger.warn(
              `[Candles.getCandles] Capping large gap from ${(gapMs / 86_400_000).toFixed(0)} days to ${(maxGapMs / 86_400_000).toFixed(0)} days for ${symbol}@${interval}`
            );
            // Keep the most recent portion of the gap (closer to `to`)
            return { from: m.to - maxGapMs, to: m.to };
          }
          return m;
        })
        .filter((m) => m.to > m.from);

      const totalSpanDays =
        missed.reduce((sum, m) => sum + (m.to - m.from), 0) /
        1000 /
        60 /
        60 /
        24;
      logger.info(
        `[Candles.getCandles] Missing ranges to fetch: ${missed.length} range(s) | Total span: ${totalSpanDays.toFixed(1)} days | Symbol: ${symbol} | Interval: ${interval}`
      );

      // Critical warning for extremely large requests
      if (totalSpanDays > 365) {
        console.error(
          `[Candles.getCandles] CRITICAL: Requesting ${totalSpanDays.toFixed(0)} days (${(totalSpanDays / 365).toFixed(1)} years) of data! Caller stack:`,
          new Error().stack
        );
      }

      missed.forEach((m, idx) => {
        const rangeDays = (m.to - m.from) / 1000 / 60 / 60 / 24;
        logger.info(
          `[Candles.getCandles] Missing range ${idx + 1}/${missed.length}: from=${new Date(m.from).toISOString()} to=${new Date(m.to).toISOString()} duration=${rangeDays.toFixed(1)} days`
        );
      });

      const toSave: Bar[] = [];

      // Background candle downloads are intentionally silent — they are a
      // normal side-effect of opening a bot form, so a toast every time
      // would be noise. Errors are logged at the caller.

      for (const int of missed) {
        if (this._stop || signal?.aborted) {
          return [];
        }
        const result = await this.getCandlesFromExchange({
          symbol,
          period: {
            from: int.from,
            to: int.to,
            countBack: Infinity,
            firstDataRequest: false,
          },
          interval,
          updateProgress,
          index,
          total,
          handleErrorByCandles,
          ...(signal ? { signal } : {}),
        });
        for (const d of result) {
          if (!requiredIndex.has(d.time)) {
            required.push(d);
            toSave.push(d);
            requiredIndex.add(d.time);
          }
        }
        if (this._stop || signal?.aborted) {
          return [];
        }
      }

      // Refill interior gaps left by partial, end-anchored responses.
      // Some exchange candle endpoints — notably Bybit — return only the
      // TAIL of a requested window when the server-side cache for that range
      // is cold: the head of each window is silently dropped. The forward
      // pagination above advances past those dropped heads without
      // re-requesting them, so a single pass can leave large interior gaps
      // (observed: ~25% coverage on a cold Bybit fine-timeframe range vs 100%
      // on Binance). That systematically starves consumers needing a full
      // series — most visibly backtests, where a sparsely-covered Bybit run
      // diverges wildly from a fully-covered Binance run for the identical
      // strategy (community #4919, "Backtests results are wrong"). Detect the
      // residual interior gaps and refill them with bounded retries; each pass
      // targets smaller ranges the endpoint honors from the start and warms
      // the server cache. When the series is already contiguous (the healthy
      // path — Binance, or a warm cache) findGaps returns nothing and this
      // loop makes no requests, so it is a no-op there.
      const findGaps = (bars: Bar[]): { from: number; to: number }[] => {
        const sorted = bars
          .filter((b) => b.time >= from && b.time <= to)
          .sort((a, b) => a.time - b.time);
        const gaps: { from: number; to: number }[] = [];
        for (let g = 1; g < sorted.length; g++) {
          if (sorted[g].time - sorted[g - 1].time > step) {
            gaps.push({ from: sorted[g - 1].time, to: sorted[g].time });
          }
        }
        return gaps;
      };
      const MAX_REFILL_PASSES = 8;
      for (let pass = 0; pass < MAX_REFILL_PASSES; pass++) {
        if (this._stop || signal?.aborted) {
          break;
        }
        const gaps = findGaps(required);
        if (!gaps.length) {
          break;
        }
        const beforeCount = required.length;
        for (const g of gaps) {
          if (this._stop || signal?.aborted) {
            break;
          }
          const refill = await this.getCandlesFromExchange({
            symbol,
            period: {
              from: g.from,
              to: g.to,
              countBack: Infinity,
              firstDataRequest: false,
            },
            interval,
            updateProgress,
            index,
            total,
            handleErrorByCandles,
            ...(signal ? { signal } : {}),
          });
          for (const d of refill) {
            if (!requiredIndex.has(d.time)) {
              required.push(d);
              toSave.push(d);
              requiredIndex.add(d.time);
            }
          }
        }
        // No new bars closed any gap → the remaining gaps are genuinely
        // absent upstream (pre-listing, exchange downtime). Stop instead of
        // spinning; this guarantees termination even when a gap can't be
        // filled.
        if (required.length <= beforeCount) {
          break;
        }
      }

      const candles = [...toSave, ...local.bars].sort(
        (a, b) => a.time - b.time
      );
      // Preserve the existing firstTime from cache if available.
      // Only set firstTime when we actually tried to fetch from a specific
      // start point AND the API confirmed there's no earlier data.
      // IMPORTANT: Do NOT set firstTime from TradingView's initial countBack-limited
      // request — a response starting at March 25 with countBack=300 does NOT mean
      // the exchange has no data before March 25, it just means we only asked for 300 bars.
      // firstTime should only be set by backtesting requests that fetch exhaustively.
      let firstTime: number | undefined = local.firstTime;
      if (
        candles.length &&
        candles[0].time > from &&
        !period.firstDataRequest &&
        period.countBack === Infinity
      ) {
        // This is an exhaustive fetch (backtesting), not a countBack-limited TV request.
        // Safe to conclude the exchange has no data before candles[0].time.
        const candidateFirstTime = candles[0].time;
        if (!firstTime || candidateFirstTime < firstTime) {
          firstTime = candidateFirstTime;
        }
      }
      await this.saveLocal(
        symbol,
        interval,
        [...toSave, ...local.bars].sort((a, b) => a.time - b.time),
        baseAsset,
        quoteAsset,
        firstTime
      );
      const map: Map<number, Bar> = new Map();
      for (const r of required) {
        map.set(r.time, r);
      }
      required = Array.from(map.values());
      return required
        .sort((a, b) => a.time - b.time)
        .filter((c) => c.time >= from && c.time <= to);
    } catch (e) {
      this.handleError(`Catch in get candles ${(e as Error)?.message}`);
      return [];
    }
  }

  private async getCandlesFromExchange({
    symbol,
    period: { from, to },
    interval,
    updateProgress,
    index,
    total,
    handleErrorByCandles,
    signal,
  }: Omit<GetCandlesInput, 'baseAsset' | 'quoteAsset'>): Promise<Bar[]> {
    try {
      const requestStep =
        this.exchangeName === ExchangeEnum.binance ||
        this.exchangeName === ExchangeEnum.binanceUS ||
        this.exchangeName === ExchangeEnum.mexc
          ? 1000
          : this.exchangeName === ExchangeEnum.bybit ||
              this.exchangeName === ExchangeEnum.bybitCoinm ||
              this.exchangeName === ExchangeEnum.bybitUsdm
            ? 999
            : this.exchangeName === ExchangeEnum.binanceUsdm ||
                this.exchangeName === ExchangeEnum.binanceCoinm ||
                this.exchangeName === ExchangeEnum.kucoin
              ? 1500
              : this.exchangeName === ExchangeEnum.okx ||
                  this.exchangeName === ExchangeEnum.okxInverse ||
                  this.exchangeName === ExchangeEnum.okxLinear
                ? 100
                : this.exchangeName === ExchangeEnum.coinbase
                  ? 300
                  : this.exchangeName === ExchangeEnum.kraken ||
                      this.exchangeName === ExchangeEnum.krakenSpot ||
                      this.exchangeName === ExchangeEnum.krakenAll ||
                      this.exchangeName === ExchangeEnum.krakenUsdm
                    ? 720
                    : 200;
      const step = timeIntervalMap[interval];
      const count = Math.max(Math.ceil((to - from) / step / requestStep), 0);
      logger.info(
        `[Candles.getCandlesFromExchange] Starting: symbol=${symbol} interval=${interval} from=${new Date(from).toISOString()} to=${new Date(to).toISOString()} expectedIterations=${count} requestStep=${requestStep}`
      );

      const data: Bar[] = [];
      const dataIndex: Set<number> = new Set();
      let prev = from - step;
      let ind = 0;
      const maxIterations = count * 2; // Safety limit to prevent infinite loops
      let actualIterations = 0;
      let consecutiveErrors = 0;
      const maxConsecutiveErrors = 3;

      for (const request of [...Array(count).keys()]) {
        if (this._stop) {
          return [];
        }
        // Selection changed mid-load — stop and hand back what we have.
        if (signal?.aborted) {
          return data;
        }

        actualIterations++;
        if (actualIterations > maxIterations) {
          console.error(
            `[Candles.getCandlesFromExchange] SAFETY BREAK: Exceeded ${maxIterations} iterations (expected ${count}) | symbol=${symbol} | Collected ${data.length} bars so far`
          );
          break;
        }

        ind++;
        const fromThis = prev / 1000;
        const toThis =
          Math.min(from + (request + 1) * step * requestStep, to) / 1000;

        logger.info(
          `[Candles.getCandlesFromExchange] Iteration ${ind}/${count}: fromThis=${new Date(fromThis * 1000).toISOString()} toThis=${new Date(toThis * 1000).toISOString()} prevMs=${prev} collectedSoFar=${data.length}`
        );
        if (updateProgress) {
          const add = (index ?? 0) / (total ?? 1);
          const mult = 1 / (total ?? 1);
          updateProgress(
            (ind / count) * mult + add,
            `Loading ${symbol}@${intervalMap[interval]} period from ${new Date(
              fromThis * 1000
            ).toUTCString()} to ${new Date(toThis * 1000).toUTCString()}`
          );
        }
        // IMPORTANT: historyApi expects startAt/endAt in milliseconds.
        // Previously we sent seconds, which caused API to ignore the range and return most recent candles.
        let candles: Bar[] = [];
        try {
          const result = await requestCandles({
            symbol,
            endAt: `${toThis * 1000}`,
            startAt: `${fromThis * 1000}`,
            type: interval, // Use raw interval value (e.g., '1h') instead of display string (e.g., '1 hour')
            exchange: this.exchangeName,
            limit: requestStep,
            ...(signal ? { signal } : {}),
          });

          // Convert CandleResponse[] to Bar[]
          candles = result.map((c) => ({
            open: +c.open,
            high: +c.high,
            low: +c.low,
            close: +c.close,
            volume: +c.volume,
            time: c.time,
          }));

          // Reset error counter on successful API call
          consecutiveErrors = 0;
        } catch (error) {
          consecutiveErrors++;
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          console.error(
            `[Candles.getCandlesFromExchange] API error at iteration ${ind}/${count} (consecutive: ${consecutiveErrors}/${maxConsecutiveErrors}): ${errorMsg}`
          );

          if (consecutiveErrors >= maxConsecutiveErrors) {
            const failureMsg = `Failed to fetch candles after ${maxConsecutiveErrors} consecutive errors. Last error: ${errorMsg}`;
            console.error(
              `[Candles.getCandlesFromExchange] STOPPING: ${failureMsg}`
            );
            if (handleErrorByCandles) {
              handleErrorByCandles(failureMsg);
            }
            // Return what we have collected so far rather than empty array
            return data;
          }

          // Skip this iteration and continue with next
          console.warn(
            `[Candles.getCandlesFromExchange] Skipping iteration ${ind}, will retry next range`
          );
          continue;
        }

        logger.info(
          `[Candles.getCandlesFromExchange] Iteration ${ind}/${count}: Received ${candles.length} candles | First: ${candles.length > 0 ? new Date(candles[0].time).toISOString() : 'N/A'} | Last: ${candles.length > 0 ? new Date(candles[candles.length - 1].time).toISOString() : 'N/A'}`
        );

        // An empty chunk means one of two very different things, and they must
        // not be treated alike.
        if (candles.length === 0) {
          if (data.length > 0) {
            // We already have bars and the exchange stopped serving: this is
            // the END of available history. Stop (also prevents an infinite
            // loop, since `prev` only advances off the last received candle).
            console.warn(
              `[Candles.getCandlesFromExchange] No candles returned at iteration ${ind}/${count} - stopping loop | Collected ${data.length} bars total`
            );
            break;
          }
          // Nothing collected yet: the requested window simply BEGINS BEFORE
          // this market existed (newly listed pair / young contract). Breaking
          // here aborted the whole load and rendered "No data here" even though
          // recent candles exist. Skip the leading pre-listing gap instead —
          // `prev` is advanced past the probed chunk so the loop still makes
          // real progress, and it stays bounded by the existing count /
          // maxIterations guards.
          logger.info(
            `[Candles.getCandlesFromExchange] Empty leading chunk at iteration ${ind}/${count} - skipping pre-listing gap up to ${new Date(toThis * 1000).toISOString()}`
          );
          prev = toThis * 1000;
          continue;
        }

        // CRITICAL FIX: Update prev based on ACTUAL last candle received, not requested range
        // This ensures we make real progress and don't re-request the same data
        const lastCandleTime = candles[candles.length - 1].time;
        const oldPrev = prev;
        prev = lastCandleTime + step; // Start next request AFTER the last candle we got

        logger.info(
          `[Candles.getCandlesFromExchange] Iteration ${ind}/${count}: Updated prev from ${new Date(oldPrev).toISOString()} to ${new Date(prev).toISOString()} | Advancement: ${((prev - oldPrev) / 1000 / 60).toFixed(0)}min`
        );

        // Check if we're stuck (prev not advancing)
        if (prev <= oldPrev && data.length) {
          console.error(
            `[Candles.getCandlesFromExchange] STUCK: prev not advancing! iteration=${ind} oldPrev=${new Date(oldPrev).toISOString()} newPrev=${new Date(prev).toISOString()} - BREAKING to prevent infinite loop`
          );
          break;
        }

        // Check if we've reached the target end time
        if (lastCandleTime >= to) {
          logger.info(
            `[Candles.getCandlesFromExchange] Reached target end time at iteration ${ind}/${count} | lastCandle=${new Date(lastCandleTime).toISOString()} target=${new Date(to).toISOString()} | Collected ${data.length} bars`
          );
          // Continue processing this batch but may stop after
        }

        let i = 0;
        for (const d of candles) {
          const obj = [d];
          if (i !== 0) {
            const prevCandle = candles[i - 1];
            if (d.time - prevCandle.time > step) {
              const missed = Math.ceil((d.time - prevCandle.time) / step);
              for (const m of [...Array(missed).keys()]) {
                const time = prevCandle.time + step * (m + 1);
                if (!obj.find((o) => o.time === time)) {
                  obj.push({
                    open: prevCandle.close,
                    high: prevCandle.close,
                    low: prevCandle.close,
                    close: prevCandle.close,
                    volume: 0,
                    time,
                  });
                }
              }
            }
          }
          for (const o of obj) {
            if (!dataIndex.has(o.time)) {
              data.push({
                open: +o.open,
                high: +o.high,
                low: +o.low,
                close: +o.close,
                volume: +o.volume,
                time: o.time,
              });
              dataIndex.add(o.time);
            }
          }
          i++;
        }

        // After processing candles, check if we should continue
        if (prev >= to) {
          logger.info(
            `[Candles.getCandlesFromExchange] Stopping: prev (${new Date(prev).toISOString()}) reached target (${new Date(to).toISOString()}) at iteration ${ind}/${count} | Total bars: ${data.length}`
          );
          break;
        }
      }

      logger.info(
        `[Candles.getCandlesFromExchange] Completed: symbol=${symbol} interval=${interval} iterations=${ind}/${count} actualIterations=${actualIterations} totalBars=${data.length} uniqueBars=${dataIndex.size}`
      );
      return data;
    } catch (e) {
      if (handleErrorByCandles) {
        handleErrorByCandles((e as Error)?.message || (e as string));
      }
      return [];
    }
  }
}

export default Candles;
