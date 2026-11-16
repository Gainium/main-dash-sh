import { describe, expect, it } from "vitest";
import {
  ALMA,
  DEMA,
  EMA,
  HMA,
  KAMA,
  LSMA,
  RMA,
  SMA,
  TEMA,
  WMA,
} from "@gainium/indicators";

import {
  almaValue,
  almaWeights,
  createMovingAverageStream,
  kamaNext,
  lsmaValue,
} from "@/utils/indicators/movingAverages";

// The chart's moving averages must draw the lines the bot engine and the
// backtester run (@gainium/indicators), bar by bar: the KAMA / ALMA / LSMA
// window functions the MA and MA Ratio studies call, and the streams the
// On-Balance Volume study averages its line with.

const walk = (n: number, seed: number, start = 100) => {
  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  let price = start;
  return Array.from({ length: n }, () => {
    price = Math.max(1, price * (1 + (rand() - 0.5) * 0.04));
    return price;
  });
};

// A series that crosses zero and spans millions, like an OBV line.
const signedWalk = (n: number, seed: number) => {
  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  let v = 0;
  return Array.from({ length: n }, () => {
    v += (rand() - 0.5) * 2e6;
    return v;
  });
};

const close = (actual: number, expected: number, label: string) => {
  const scale = Math.max(1, Math.abs(expected));
  expect(Math.abs(actual - expected) / scale, label).toBeLessThan(1e-12);
};

// What the studies compute per bar: the window is NaN-padded while the chart
// has fewer bars than the length (r.Std series read NaN before the first bar).
const windowAt = (values: number[], i: number, size: number) =>
  Array.from({ length: size }, (_, k) => {
    const j = i - size + 1 + k;
    return j < 0 ? NaN : values[j];
  });

describe("KAMA / ALMA / LSMA chart copies", () => {
  for (const [length, seed] of [
    [14, 7],
    [2, 11],
    [50, 23],
    [1, 5],
  ] as const) {
    it(`KAMA matches @gainium/indicators (length ${length})`, () => {
      const closes = walk(3000, seed);
      const lib = new KAMA(length);
      let prev = NaN;
      closes.forEach((c, i) => {
        const expected = lib.next(c);
        prev = kamaNext(prev, windowAt(closes, i, length + 1));
        if (expected === null) {
          expect(prev, `bar ${i}`).toBeNaN();
        } else {
          close(prev, expected, `bar ${i}`);
        }
      });
    });

    it(`ALMA and LSMA match @gainium/indicators (length ${length})`, () => {
      const closes = walk(3000, seed + 1);
      const alma = new ALMA(length);
      const lsma = new LSMA(length);
      const weights = almaWeights(length);
      closes.forEach((c, i) => {
        const window = windowAt(closes, i, length);
        const a = alma.next(c);
        const l = lsma.next(c);
        if (a === null) {
          expect(almaValue(window, weights), `alma bar ${i}`).toBeNaN();
        } else {
          close(almaValue(window, weights), a, `alma bar ${i}`);
        }
        if (l === null) {
          expect(lsmaValue(window), `lsma bar ${i}`).toBeNaN();
        } else {
          close(lsmaValue(window), l, `lsma bar ${i}`);
        }
      });
    });
  }
});

describe("moving-average streams (the OBV line's average)", () => {
  const libFor = (type: string, length: number) => {
    switch (type) {
      case "ema":
        return new EMA(length);
      case "wma":
        return new WMA(length);
      case "dema":
        return new DEMA(length);
      case "tema":
        return new TEMA(length);
      case "hma":
        return new HMA(length);
      case "rma":
        return new RMA(length);
      case "kama":
        return new KAMA(length);
      case "alma":
        return new ALMA(length);
      case "lsma":
        return new LSMA(length);
      default:
        return new SMA(length);
    }
  };

  for (const type of [
    "sma",
    "ema",
    "wma",
    "dema",
    "tema",
    "hma",
    "rma",
    "kama",
    "alma",
    "lsma",
  ]) {
    for (const length of [1, 2, 5, 20, 50]) {
      it(`${type} ${length} equals the library bar by bar`, () => {
        const series = signedWalk(2500, length * 31 + type.length);
        const lib = libFor(type, length);
        const stream = createMovingAverageStream(type, length);
        series.forEach((v, i) => {
          const expected = lib.next(v);
          const actual = stream.next(v);
          if (expected === null || actual === null) {
            expect(actual, `${type} bar ${i}`).toBe(expected);
          } else {
            // the same arithmetic in the same order: exactly equal
            expect(actual, `${type} bar ${i}`).toBe(expected);
          }
        });
      });
    }
  }

  it("a clone previews without touching the original", () => {
    const series = signedWalk(300, 3);
    const stream = createMovingAverageStream("tema", 10);
    const lib = new TEMA(10);
    series.slice(0, 200).forEach((v) => {
      stream.next(v);
      lib.next(v);
    });
    const preview = stream.clone().next(123456);
    expect(preview).toBe(lib.preview(123456));
    series.slice(200).forEach((v) => {
      expect(stream.next(v)).toBe(lib.next(v));
    });
  });
});
