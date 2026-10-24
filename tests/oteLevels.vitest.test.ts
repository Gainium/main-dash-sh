import { describe, expect, it } from "vitest";
import { OTELevels } from "@gainium/indicators";

import {
  OTELevelsState,
  oteLevelPrice,
  parseOteLevels,
} from "@/utils/indicators/oteLevels";

// The chart study's copy of the OTE leg algorithm must agree with the one the
// bot engine and backtester run (@gainium/indicators), bar by bar.

const walk = (n: number, seed: number) => {
  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  let price = 100;
  return Array.from({ length: n }, () => {
    const open = price;
    price = Math.max(1, price * (1 + (rand() - 0.5) * 0.03));
    const close = price;
    return {
      open,
      close,
      high: Math.max(open, close) * (1 + rand() * 0.01),
      low: Math.min(open, close) * (1 - rand() * 0.01),
    };
  });
};

describe("OTE levels chart copy", () => {
  for (const [left, min, seed] of [
    [10, 1, 7],
    [3, 0.5, 11],
    [20, 3, 23],
  ] as const) {
    it(`matches @gainium/indicators (left ${left}, min ${min}%)`, () => {
      const lib = new OTELevels(left, min);
      const chart = new OTELevelsState(left, min);
      let legs = 0;
      for (const c of walk(3000, seed)) {
        const want = lib.next(c);
        const got = chart.next(c.high, c.low);
        if (!want || isNaN(want.direction)) {
          expect(got).toBeNull();
        } else {
          legs++;
          expect(got).toEqual({
            high: want.high,
            low: want.low,
            direction: want.direction,
          });
        }
      }
      expect(legs).toBeGreaterThan(100);
    });
  }

  it("prices levels as retracements from the leg end", () => {
    expect(
      oteLevelPrice({ high: 120, low: 100, direction: 1 }, 0.705),
    ).toBeCloseTo(105.9);
    expect(
      oteLevelPrice({ high: 120, low: 100, direction: -1 }, 0.705),
    ).toBeCloseTo(114.1);
  });

  it("parses the level list", () => {
    expect(parseOteLevels("1, 0.79,, x, 0")).toEqual([1, 0.79, 0]);
    expect(parseOteLevels("1,2,3,4,5,6,7,8,9,10")).toHaveLength(9);
  });
});
