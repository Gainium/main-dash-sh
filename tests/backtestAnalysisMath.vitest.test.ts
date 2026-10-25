import { describe, expect, test } from 'vitest';

import {
  dealSeasonality,
  edgeSeries,
  priceBehavior,
  priceSeasonality,
} from '@/components/widgets/bots/backtest/analysis/analysisMath';
import type { PreparedDeal } from '@/types';
import type { Bar } from '@/utils/tradingView/types';

/**
 * Backtest Analysis tab — Price behaviour (move after each deal entry vs a
 * random-entry control) and Seasonality (weekday / month, UTC).
 */

const HOUR = 3_600_000;
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 5); // a Monday

const bars = (closes: number[], step = HOUR, from = T0): Bar[] =>
  closes.map((c, i) => ({
    time: from + i * step,
    open: i ? closes[i - 1] : c,
    high: c,
    low: c,
    close: c,
    volume: 0,
  }));

const deal = (p: Partial<PreparedDeal> & { pair?: string }): PreparedDeal =>
  ({
    symbol: { pair: p.pair ?? 'BTCUSDT', exchange: 'binance' },
    status: 'closed',
    startTime: T0,
    startPrice: 100,
    profit: { total: 0, totalUsd: 0, perc: 0 },
    ...p,
  }) as unknown as PreparedDeal;

describe('priceBehavior', () => {
  test('§1.1/§1.2 per-step mean, median and share positive from the entry price', () => {
    const series = new Map([
      ['BTCUSDT', bars([100, 110, 90, 100, 100, 100])],
      ['ETHUSDT', bars([100, 90, 120, 100, 100, 100])],
    ]);
    const out = priceBehavior(
      series,
      [deal({ pair: 'BTCUSDT' }), deal({ pair: 'ETHUSDT' })],
      2,
      1
    );
    expect(out).toHaveLength(2);
    expect(out[0].mean).toBeCloseTo(0); // +10% and -10%
    expect(out[0].positive).toBe(50);
    expect(out[1].mean).toBeCloseTo(5); // -10% and +20%
    expect(out[1].median).toBeCloseTo(5);
    expect(out[1].entries).toBe(2);
  });

  test('§1.3 control is the mean move from every bar of the window', () => {
    // +1 per bar from 100: a k-bar move from bar j is k/(100+j)
    const closes = Array.from({ length: 50 }, (_, i) => 100 + i);
    const out = priceBehavior(
      new Map([['BTCUSDT', bars(closes)]]),
      [deal({})],
      1,
      1
    );
    const expected =
      (closes.slice(0, -1).reduce((a, c) => a + 1 / c, 0) / 49) * 100;
    expect(out[0].control).toBeCloseTo(expected, 6);
  });

  test('§1.4 a short bot flips both the deal moves and the control', () => {
    const series = new Map([['BTCUSDT', bars([100, 110, 121])]]);
    const long = priceBehavior(series, [deal({})], 1, 1);
    const short = priceBehavior(series, [deal({})], 1, -1);
    expect(short[0].mean).toBeCloseTo(-long[0].mean);
    expect(short[0].control).toBeCloseTo(-long[0].control);
    expect(short[0].positive).toBe(0);
  });

  test('§1.6 a deal without N bars after entry is left out of every step', () => {
    const series = new Map([['BTCUSDT', bars([100, 110, 120, 130, 140])]]);
    const out = priceBehavior(
      series,
      [deal({}), deal({ startTime: T0 + 3 * HOUR, startPrice: 130 })],
      2,
      1
    );
    expect(out.every((p) => p.entries === 1)).toBe(true);
  });

  test('§1.1 a mid-bar fill is measured from its bar close, like random entries', () => {
    // filled at 67.5 inside a bar that closed at 100: still 0% after a flat bar
    const series = new Map([['BTCUSDT', bars([100, 100, 100, 100])]]);
    const out = priceBehavior(series, [deal({ startPrice: 67.5 })], 2, 1);
    expect(out[0].mean).toBeCloseTo(0);
    expect(out[1].mean).toBeCloseTo(0);
  });

  test('§1.3a entries before the only move beat random; flat ones do not', () => {
    // flat at 100, one +10% jump after bar 30
    const closes = Array.from({ length: 80 }, (_, i) => (i <= 30 ? 100 : 110));
    const series = new Map([['BTCUSDT', bars(closes)]]);
    const good = priceBehavior(
      series,
      [deal({ startTime: T0 + 30 * HOUR })],
      3,
      1
    );
    expect(good[0].mean).toBeCloseTo(10);
    // a few random draws land on the jump bar too and tie
    expect(good[0].beats).toBeGreaterThan(95);
    const flat = priceBehavior(
      series,
      [deal({ startTime: T0 + 50 * HOUR })],
      3,
      1
    );
    expect(flat[0].mean).toBeCloseTo(0);
    expect(flat[0].beats).toBe(0);
  });

  test('§1.3a the band narrows with more deals and is stable between runs', () => {
    const closes = Array.from(
      { length: 400 },
      (_, i) => 100 + 5 * Math.sin(i * 1.7) + 3 * Math.sin(i * 0.31)
    );
    const series = new Map([['BTCUSDT', bars(closes)]]);
    const one = priceBehavior(series, [deal({ startPrice: closes[0] })], 5, 1);
    const many = priceBehavior(
      series,
      Array.from({ length: 20 }, (_, i) =>
        deal({ startTime: T0 + i * 10 * HOUR, startPrice: closes[i * 10] })
      ),
      5,
      1
    );
    const width = (p: (typeof one)[number]) => p.randomHi - p.randomLo;
    expect(width(many[4])).toBeLessThan(width(one[4]));
    expect(many[4].randomLo).toBeLessThan(many[4].control);
    expect(many[4].randomHi).toBeGreaterThan(many[4].control);
    // seeded: the same input draws the same band
    const again = priceBehavior(
      series,
      Array.from({ length: 20 }, (_, i) =>
        deal({ startTime: T0 + i * 10 * HOUR, startPrice: closes[i * 10] })
      ),
      5,
      1
    );
    expect(again[4].randomLo).toBe(many[4].randomLo);
    expect(again[4].beats).toBe(many[4].beats);
  });

  test('§1.3a back-to-back entries count as one event: a wider zone than spread ones', () => {
    const closes = Array.from(
      { length: 600 },
      (_, i) => 100 + 6 * Math.sin(i * 0.05) + 2 * Math.sin(i * 1.9)
    );
    const series = new Map([['BTCUSDT', bars(closes)]]);
    const at = (i: number) => deal({ startTime: T0 + i * HOUR });
    const clustered = priceBehavior(
      series,
      Array.from({ length: 10 }, (_, i) => at(100 + i)),
      10,
      1
    );
    const spread = priceBehavior(
      series,
      Array.from({ length: 10 }, (_, i) => at(20 + i * 55)),
      10,
      1
    );
    const width = (p: (typeof spread)[number]) => p.randomHi - p.randomLo;
    expect(width(clustered[9])).toBeGreaterThan(2 * width(spread[9]));
  });

  test('§1.8 no usable deal → no points', () => {
    expect(
      priceBehavior(new Map([['BTCUSDT', bars([1, 2])]]), [deal({})], 5, 1)
    ).toEqual([]);
  });
});

describe('edgeSeries', () => {
  const pt = (step: number, mean: number, lo: number, hi: number, control = 1) =>
    ({
      step,
      mean,
      median: mean,
      control,
      randomLo: lo,
      randomHi: hi,
      randomBand: [lo, hi],
      beats: 50,
      p10: 0,
      p90: 0,
      positive: 0,
      entries: 10,
      upBand: [0, 0],
      downBand: [0, 0],
    }) as Parameters<typeof edgeSeries>[0][number];

  test('§1.3b subtracts random and re-centres the chance zone on zero', () => {
    const [p] = edgeSeries([pt(1, 1.5, 0.8, 1.2)]);
    expect(p.edge).toBeCloseTo(0.5);
    expect(p.chance[0]).toBeCloseTo(-0.2);
    expect(p.chance[1]).toBeCloseTo(0.2);
    expect(p.state).toBe('edge');
  });

  test('§1.3b states: inside the zone is chance, below it is worse', () => {
    const out = edgeSeries([
      pt(1, 1.1, 0.8, 1.2),
      pt(2, 0.5, 0.8, 1.2),
    ]);
    expect(out.map((p) => p.state)).toEqual(['chance', 'worse']);
  });

  test('§1.3b a coloured stretch includes its neighbours, nothing else', () => {
    const out = edgeSeries([
      pt(1, 1.0, 0.8, 1.2), // chance
      pt(2, 1.0, 0.8, 1.2), // chance, next to edge
      pt(3, 2.0, 0.8, 1.2), // edge
      pt(4, 1.0, 0.8, 1.2), // chance, next to edge
      pt(5, 1.0, 0.8, 1.2), // chance
    ]);
    expect(out.map((p) => p.above !== null)).toEqual([
      false,
      true,
      true,
      true,
      false,
    ]);
    expect(out.every((p) => p.below === null)).toBe(true);
  });
});

describe('seasonality', () => {
  test('§2.2 weekday buckets are Monday-first, UTC, open→close', () => {
    // 14 days from Monday: every Monday +10%, every other day 0%
    const daily: Bar[] = Array.from({ length: 14 }, (_, i) => ({
      time: T0 + i * DAY,
      open: 100,
      high: 110,
      low: 100,
      close: i % 7 === 0 ? 110 : 100,
      volume: 0,
    }));
    const out = priceSeasonality(daily, 'weekday');
    expect(out[0].label).toBe('Mon');
    expect(out[0].positive).toBe(100);
    expect(out[0].mean).toBeCloseTo(10);
    expect(out[0].count).toBe(2);
    expect(out[6].label).toBe('Sun');
    expect(out[6].positive).toBe(0);
  });

  test('§2.2 month buckets drop partial edge months', () => {
    // Jan 15 → Apr 10: Jan and Apr are partial, Feb and Mar whole
    const from = Date.UTC(2026, 0, 15);
    const days = (Date.UTC(2026, 3, 10) - from) / DAY + 1;
    const daily: Bar[] = Array.from({ length: days }, (_, i) => ({
      time: from + i * DAY,
      open: 100 + i,
      high: 101 + i,
      low: 100 + i,
      close: 101 + i,
      volume: 0,
    }));
    const out = priceSeasonality(daily, 'month');
    expect(out[0].count).toBe(0); // Jan
    expect(out[1].count).toBe(1); // Feb
    expect(out[2].count).toBe(1); // Mar
    expect(out[3].count).toBe(0); // Apr
    expect(out[1].positive).toBe(100);
  });

  test('§2.3 deal seasonality counts closed deals by their open time', () => {
    const out = dealSeasonality(
      [
        deal({ startTime: T0, profit: { total: 1, totalUsd: 1, perc: 2 } }),
        deal({ startTime: T0, profit: { total: -1, totalUsd: -1, perc: -1 } }),
        deal({
          startTime: T0,
          status: 'open',
          profit: { total: 5, totalUsd: 5, perc: 5 },
        }),
        deal({
          startTime: T0 + DAY,
          profit: { total: 1, totalUsd: 1, perc: 4 },
        }),
      ],
      'weekday'
    );
    expect(out[0].count).toBe(2);
    expect(out[0].positive).toBe(50);
    expect(out[0].mean).toBeCloseTo(0.5);
    expect(out[1].count).toBe(1);
    expect(Number.isNaN(out[2].positive)).toBe(true);
  });
});
