import { describe, expect, it } from "vitest";
import { McGinley } from "@gainium/indicators";

import { mcginleyNext } from "@/utils/indicators/mcginley";

// The chart study's McGinley Dynamic (one `mcginleyNext` per bar, seeded with
// the study's SMA of the closes) must draw the line the bot engine and the
// backtester run (@gainium/indicators), bar by bar.

const walk = (n: number, seed: number) => {
  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  let price = 100;
  return Array.from({ length: n }, () => {
    price = Math.max(1, price * (1 + (rand() - 0.5) * 0.04));
    return price;
  });
};

// What the study computes: r.Std.sma is NaN until `length` closes, and the
// line's previous value is NaN on the first bar.
const chartLine = (closes: number[], length: number) => {
  let prev = NaN;
  return closes.map((close, i) => {
    const window = closes.slice(Math.max(0, i - length + 1), i + 1);
    const seed =
      window.length < length
        ? NaN
        : window.reduce((a, b) => a + b, 0) / length;
    prev = mcginleyNext(prev, close, seed, length);
    return prev;
  });
};

describe("McGinley Dynamic chart copy", () => {
  for (const [length, seed] of [
    [14, 7],
    [3, 11],
    [50, 23],
  ] as const) {
    it(`matches @gainium/indicators (length ${length})`, () => {
      const closes = walk(2000, seed);
      const lib = new McGinley(length);
      const chart = chartLine(closes, length);
      closes.forEach((close, i) => {
        const expected = lib.next(close);
        if (expected === null) {
          expect(chart[i], `bar ${i}`).toBeNaN();
        } else {
          expect(chart[i], `bar ${i}`).toBeCloseTo(expected, 9);
        }
      });
    });
  }

  it("treats a non-positive close as a gap", () => {
    expect(mcginleyNext(100, 0, 100, 14)).toBeNaN();
    expect(mcginleyNext(NaN, 100, NaN, 14)).toBeNaN();
    expect(mcginleyNext(NaN, 100, 95, 14)).toBe(95);
  });
});
