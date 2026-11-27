import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * A tokenized stock does not trade around the clock, so an hourly backtest
 * series has a closure every weekend. Pages used to start one bar after the
 * last bar held, which left each closure that fell on a page boundary
 * unbridged; the gap refill then walked the pair a second time, one request
 * per closure, while the progress bar already showed the pair as loaded.
 * Pages now overlap the last bar held, so a closure is bridged in-page and
 * needs no refill — and a page whose head the venue dropped is still refilled.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const venue = vi.hoisted(() => ({
  requests: [] as { startAt: number; endAt: number }[],
  // a window the venue answers without its head on the first ask only
  coldHole: null as null | { from: number; to: number; served: boolean },
}));

const store = vi.hoisted(() => new Map<number, unknown>());

vi.mock('@/utils/candles/db', () => ({
  DBCredentials: { version: 3, store: 'CandleChunks', dbName: 'Gainium' },
  readRange: vi.fn(
    async (_id: string, _interval: string, from = -Infinity, to = Infinity) => {
      const bars = [...store.values()]
        .filter((b) => {
          const t = (b as { time: number }).time;
          return t >= from && t <= to;
        })
        .sort(
          (a, b) => (a as { time: number }).time - (b as { time: number }).time
        );
      return { bars };
    }
  ),
  writeBars: vi.fn(async (_info: unknown, bars: { time: number }[]) => {
    for (const b of bars) store.set(b.time, b);
    return true;
  }),
}));

const closed = (t: number) => {
  const d = new Date(t).getUTCDay();
  return d === 0 || d === 6;
};

vi.mock('@/utils/tradingView/historyApi', () => ({
  requestCandles: vi.fn(async ({ startAt, endAt, limit }) => {
    const s = Number(startAt);
    const e = Number(endAt);
    venue.requests.push({ startAt: s, endAt: e });
    const hole = venue.coldHole;
    // a cold answer: the head of the window, up to the hole's end, is missing
    const drop = !!hole && !hole.served && s < hole.from && e >= hole.to;
    if (drop && hole) hole.served = true;
    const out = [];
    for (
      let t = Math.ceil(s / HOUR) * HOUR;
      t <= e && out.length < limit;
      t += HOUR
    ) {
      if (closed(t)) continue;
      if (drop && hole && t < hole.to) continue;
      out.push({ time: t, open: '1', high: '2', low: '0.5', close: '1.5', volume: '10' });
    }
    return out;
  }),
}));

import { ExchangeEnum, ExchangeIntervals } from '@/types';
import Candles from '@/utils/candles';

const TO = Date.UTC(2026, 10, 20, 12); // a Friday
const FROM = Date.UTC(2025, 10, 24); // a Monday, ~a year back

const load = () =>
  new Candles(ExchangeEnum.bitget).getCandles({
    symbol: 'RAAPLUSDT',
    interval: ExchangeIntervals.oneH,
    period: {
      from: FROM / 1000,
      to: TO / 1000,
      countBack: (TO - FROM) / HOUR,
      firstDataRequest: false,
    },
    baseAsset: 'rAAPL',
    quoteAsset: 'USDT',
  });

const pages = Math.ceil((TO - FROM) / HOUR / 200);

const contiguous = (bars: { time: number }[]) =>
  bars.every((b, i) => i === 0 || b.time - bars[i - 1].time === HOUR);

describe('closed-market pages in backtest candles', () => {
  beforeEach(() => {
    store.clear();
    venue.requests = [];
    venue.coldHole = null;
  });

  test('§1 weekend closures are bridged without a second walk of the pair', async () => {
    const bars = await load();
    expect(bars[0].time).toBe(FROM);
    expect(contiguous(bars)).toBe(true);
    // pages only (a closure may cost one extra page), never one per weekend
    expect(venue.requests.length).toBeLessThanOrEqual(pages + 2);
  });

  test('§2 a page whose head the venue dropped is still refilled', async () => {
    // a Wednesday the venue drops on its first answer
    const wed = FROM + 23 * DAY;
    venue.coldHole = { from: wed, to: wed + 6 * HOUR, served: false };
    const bars = await load();
    const real = bars.filter((b) => (b as { volume: number }).volume > 0);
    const times = new Set(real.map((b) => b.time));
    for (let t = wed; t < wed + 6 * HOUR; t += HOUR) {
      expect(times.has(t)).toBe(true);
    }
  });
});
