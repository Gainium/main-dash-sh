import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * TradingView fires `onChartReady` only after the main series' `getBars`
 * calls have been answered, and every line the app draws waits for that. A
 * `getBars` that never calls back therefore leaves the chart on "Loading
 * chart..." for good, with nothing thrown. The fetch behind it has unbounded
 * steps (IndexedDB cache I/O, several 30s-capped requests), so the datafeed
 * itself must guarantee an answer.
 */

const pendingCandles: Array<{
  resolve: (bars: unknown[]) => void;
}> = [];

vi.mock('@/utils/tradingView/historyApi', () => ({
  getCandles: vi.fn(
    () =>
      new Promise((resolve) => {
        pendingCandles.push({ resolve });
      })
  ),
  requestCandles: vi.fn(),
}));

import { getPendingBarRequests } from '@/utils/tradingView/barRequestTracker';
import { createDatafeed } from '@/utils/tradingView/factory';
import type { LibrarySymbolInfo } from '@/utils/tradingView/types';

const symbolInfo = {
  name: 'SOLEUR',
  ticker: 'SOLEUR@KRAKEN',
  exchange: 'KRAKEN',
} as unknown as LibrarySymbolInfo;

const HOUR = 3600;
const TO = Date.UTC(2026, 8, 23, 12) / 1000;
const period = {
  from: TO - 300 * HOUR,
  to: TO,
  countBack: 300,
  firstDataRequest: true,
};

const A_MINUTE = 60_000;

describe('shared datafeed getBars', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    pendingCandles.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('answers with an error when the fetch never settles', async () => {
    const onResult = vi.fn();
    const onError = vi.fn();
    void createDatafeed().getBars(symbolInfo, '60', period, onResult, onError);

    await vi.advanceTimersByTimeAsync(A_MINUTE);

    expect(onResult).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  test('drops a result that arrives after the deadline answered', async () => {
    const onResult = vi.fn();
    const onError = vi.fn();
    void createDatafeed().getBars(symbolInfo, '60', period, onResult, onError);

    await vi.advanceTimersByTimeAsync(A_MINUTE);
    pendingCandles[0]?.resolve([
      { time: TO * 1000, open: 1, high: 1, low: 1, close: 1 },
    ]);
    await vi.advanceTimersByTimeAsync(0);

    // TradingView throws on a second callback for the same request.
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onResult).not.toHaveBeenCalled();
  });

  test('a timely answer is delivered once and the deadline never fires', async () => {
    const onResult = vi.fn();
    const onError = vi.fn();
    void createDatafeed().getBars(symbolInfo, '60', period, onResult, onError);
    await vi.advanceTimersByTimeAsync(0);

    pendingCandles[0]?.resolve([
      { time: TO * 1000, open: 1, high: 1, low: 1, close: 1 },
    ]);
    await vi.advanceTimersByTimeAsync(A_MINUTE);

    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  test('lists the request as pending until it is answered', async () => {
    void createDatafeed().getBars(symbolInfo, '60', period, vi.fn(), vi.fn());
    await vi.advanceTimersByTimeAsync(0);

    expect(getPendingBarRequests()).toEqual([
      expect.objectContaining({
        ticker: 'SOLEUR@KRAKEN',
        resolution: '60',
        from: period.from,
        to: period.to,
        firstDataRequest: true,
      }),
    ]);

    pendingCandles[0]?.resolve([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(getPendingBarRequests()).toEqual([]);
  });
});
