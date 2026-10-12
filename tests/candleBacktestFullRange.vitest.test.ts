import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * A backtest loads the whole period it asks for when the venue has the data,
 * and a second run over the same pair, interval and period is served from the
 * cache instead of downloading again. A venue whose history really is shorter
 * still returns only what exists, so the results header keeps reporting the
 * shortfall.
 */

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const STEP = 15 * MIN;

const venue = vi.hoisted(() => ({
  // Earliest candle the fake venue serves; null = no history limit.
  earliest: null as number | null,
  requests: 0,
}));

const store = vi.hoisted(() => new Map<number, unknown>());

vi.mock('@/utils/candles/db', () => ({
  DBCredentials: { version: 3, store: 'CandleChunks', dbName: 'Gainium' },
  readRange: vi.fn(async (_id: string, _interval: string, from = -Infinity, to = Infinity) => {
    const bars = [...store.values()]
      .filter((b) => {
        const t = (b as { time: number }).time;
        return t >= from && t <= to;
      })
      .sort((a, b) => (a as { time: number }).time - (b as { time: number }).time);
    return { bars };
  }),
  writeBars: vi.fn(async (_info: unknown, bars: { time: number }[]) => {
    for (const b of bars) store.set(b.time, b);
    return true;
  }),
}));

vi.mock('@/utils/tradingView/historyApi', () => ({
  requestCandles: vi.fn(async ({ startAt, endAt, limit }) => {
    venue.requests++;
    const out = [];
    const start = Math.max(Number(startAt), venue.earliest ?? -Infinity);
    const first = Math.ceil(start / STEP) * STEP;
    for (let t = first; t <= Number(endAt) && out.length < limit; t += STEP) {
      out.push({ time: t, open: '1', high: '2', low: '0.5', close: '1.5', volume: '10' });
    }
    return out;
  }),
}));

import { ExchangeEnum, ExchangeIntervals } from '@/types';
import Candles from '@/utils/candles';

const TO = Date.UTC(2026, 9, 12);
const FROM = TO - 1015 * DAY;

const backtest = (exchange: ExchangeEnum) =>
  new Candles(exchange).getCandles({
    symbol: 'NEARUSDT',
    interval: ExchangeIntervals.fifteenM,
    // What the backtester passes: a finite countBack, not a TradingView load.
    period: {
      from: FROM / 1000,
      to: TO / 1000,
      countBack: (TO - FROM) / STEP,
      firstDataRequest: false,
    },
    baseAsset: 'NEAR',
    quoteAsset: 'USDT',
  });

describe('backtest candle range', () => {
  beforeEach(() => {
    store.clear();
    venue.requests = 0;
    venue.earliest = null;
  });

  test('§1.1 a 1015-day run on a venue with full history starts at the requested date', async () => {
    const bars = await backtest(ExchangeEnum.binance);
    expect(bars[0].time).toBe(FROM);
    expect(bars[bars.length - 1].time).toBe(TO);
    expect(bars.length).toBe((TO - FROM) / STEP + 1);
  });

  test('§1.2 the second run over the same period makes no exchange request', async () => {
    await backtest(ExchangeEnum.binance);
    venue.requests = 0;
    const bars = await backtest(ExchangeEnum.binance);
    expect(venue.requests).toBe(0);
    expect(bars[0].time).toBe(FROM);
  });

  test('§1.3 a venue with shorter history still returns only what exists', async () => {
    venue.earliest = TO - 30 * DAY;
    const bars = await backtest(ExchangeEnum.kraken);
    expect(bars[0].time).toBe(TO - 30 * DAY);
    expect(bars[bars.length - 1].time).toBe(TO);
  });
});
