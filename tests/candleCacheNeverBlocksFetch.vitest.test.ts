import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * The chart's getBars awaits the whole Candles path, including the IndexedDB
 * cache read before the fetch and the cache write after it. An IndexedDB open
 * or transaction that never settles (a blocked upgrade, a wedged browser
 * store) must not stop the fetched candles from being returned.
 */

const db = vi.hoisted(() => ({
  readRange: vi.fn(),
  writeBars: vi.fn(),
}));

vi.mock('@/utils/candles/db', () => ({
  DBCredentials: { version: 3, store: 'CandleChunks', dbName: 'Gainium' },
  readRange: db.readRange,
  writeBars: db.writeBars,
}));

vi.mock('@/utils/tradingView/historyApi', () => ({
  requestCandles: vi.fn(async ({ startAt, endAt }) => {
    const out = [];
    for (let t = Number(startAt); t <= Number(endAt); t += 3_600_000) {
      out.push({
        time: t,
        open: '1',
        high: '2',
        low: '0.5',
        close: '1.5',
        volume: '10',
      });
    }
    return out;
  }),
}));

import { ExchangeEnum, ExchangeIntervals } from '@/types';
import Candles from '@/utils/candles';

const HOUR = 3_600_000;
const TO = Date.UTC(2026, 8, 23, 12);
const FROM = TO - 24 * HOUR;

const load = () =>
  new Candles(ExchangeEnum.kraken).getCandles({
    symbol: 'SOLEUR',
    interval: ExchangeIntervals.oneH,
    period: {
      from: FROM / 1000,
      to: TO / 1000,
      countBack: 24,
      firstDataRequest: true,
    },
    baseAsset: 'SOL',
    quoteAsset: 'EUR',
  });

const never = () => new Promise(() => undefined);

describe('Candles cache I/O', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    db.readRange.mockReset();
    db.writeBars.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('a cache read that never settles counts as a miss', async () => {
    db.readRange.mockImplementation(never);
    db.writeBars.mockResolvedValue(true);

    let bars: unknown[] | undefined;
    void load().then((b) => (bars = b));
    await vi.advanceTimersByTimeAsync(10_000);

    expect(bars?.length).toBe(25);
    // The unread entry is not overwritten with this window alone.
    expect(db.writeBars).not.toHaveBeenCalled();
  });

  test('a cache write that never settles does not hold the candles back', async () => {
    db.readRange.mockResolvedValue({ bars: [] });
    db.writeBars.mockImplementation(never);

    let bars: unknown[] | undefined;
    void load().then((b) => (bars = b));
    await vi.advanceTimersByTimeAsync(10_000);

    expect(db.writeBars).toHaveBeenCalledTimes(1);
    expect(bars?.length).toBe(25);
  });
});
