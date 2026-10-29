import { describe, expect, it } from "vitest";
import { KDJ } from "@gainium/indicators";

import { KDJState, kdjSettleBars } from "@/utils/indicators/kdj";

// The chart study's copy of KDJ must agree with the one the bot engine and
// backtester run (@gainium/indicators), bar by bar.

const walk = (n: number, seed: number) => {
  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  let price = 100;
  return Array.from({ length: n }, () => {
    const open = price;
    // stretches of flat candles exercise the flat-range rule
    price =
      rand() < 0.03 ? price : Math.max(1, price * (1 + (rand() - 0.5) * 0.03));
    const close = price;
    const flat = open === close;
    return {
      open,
      close,
      high: flat ? close : Math.max(open, close) * (1 + rand() * 0.01),
      low: flat ? close : Math.min(open, close) * (1 - rand() * 0.01),
    };
  });
};

describe("KDJ chart copy", () => {
  for (const [n, k, d, seed] of [
    [9, 3, 3, 7],
    [14, 1, 3, 11],
    [5, 5, 2, 23],
    [30, 3, 9, 31],
  ] as const) {
    it(`matches @gainium/indicators (${n}, ${k}, ${d})`, () => {
      const lib = new KDJ(n, k, d);
      const chart = new KDJState(n, k, d);
      expect(chart.warmup).toBe(lib.warmup);
      let values = 0;
      for (const c of walk(3000, seed)) {
        const want = lib.next(c);
        const got = chart.next(c.high, c.low, c.close);
        if (want === null) {
          expect(got).toBeNull();
        } else {
          values++;
          expect(got).toEqual({ k: want.k, d: want.d, j: want.j });
        }
      }
      expect(values).toBeGreaterThan(2500);
    });
  }

  it("keeps the previous RSV on a flat range", () => {
    const state = new KDJState(1, 1, 1);
    expect(state.next(10, 10, 10)).toEqual({ k: 50, d: 50, j: 50 });
    expect(state.next(12, 10, 12)).toEqual({ k: 100, d: 100, j: 100 });
    expect(state.next(11, 11, 11)).toEqual({ k: 100, d: 100, j: 100 });
  });

  it("warms KDJ(9,3,3) up in 63 candles", () => {
    expect(9 - 1 + kdjSettleBars(3, 3)).toBe(63);
  });

  it("previews an open candle without moving the state", () => {
    const a = new KDJState(9, 3, 3);
    const b = new KDJState(9, 3, 3);
    const candles = walk(200, 5);
    candles.forEach((c) => {
      a.clone().next(c.high * 2, c.low, c.close);
      expect(a.next(c.high, c.low, c.close)).toEqual(
        b.next(c.high, c.low, c.close),
      );
    });
  });
});
