import { describe, expect, it } from "vitest";
import { CHOP, CMF, OBV } from "@gainium/indicators";

import {
  CHOPState,
  CMFState,
  OBVState,
  resolveChopLength,
  resolveCmfLength,
  resolveObvSettings,
} from "@/utils/indicators/volumeFlow";

// The On-Balance Volume, Chaikin Money Flow and Choppiness Index studies must
// draw what the bot engine and the backtester run (@gainium/indicators), bar
// by bar over a long random walk of candles.

type Candle = {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
};

const candles = (n: number, seed: number): Candle[] => {
  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  let price = 100;
  return Array.from({ length: n }, (_, i) => {
    const open = price;
    // some unchanged closes, flat candles and zero volume on purpose
    const r = rand();
    const close =
      r < 0.05 ? open : Math.max(1, open * (1 + (rand() - 0.5) * 0.04));
    const flat = rand() < 0.02;
    const high = flat ? open : Math.max(open, close) * (1 + rand() * 0.01);
    const low = flat ? open : Math.min(open, close) * (1 - rand() * 0.01);
    const volume = rand() < 0.03 ? 0 : Math.round(rand() * 1e6) / 100;
    price = flat ? open : close;
    return { open, high, low, close: flat ? open : close, volume, time: i };
  });
};

describe("On-Balance Volume chart copy", () => {
  for (const maType of [
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
    for (const maLength of [1, 5, 20, 50]) {
      it(`OBV + ${maType} ${maLength} equals the library`, () => {
        const data = candles(3000, maLength * 13 + maType.length);
        const lib = new OBV(maType, maLength);
        const chart = new OBVState(maType, maLength);
        data.forEach((c, i) => {
          const expected = lib.next(c);
          const actual = chart.next(c.close, c.volume);
          if (expected === null) {
            expect(actual, `bar ${i}`).toBeNull();
          } else {
            expect(actual, `bar ${i}`).toEqual(expected);
          }
        });
      });
    }
  }

  it("previews the open candle on a copy", () => {
    const data = candles(400, 9);
    const chart = new OBVState("ema", 20);
    const lib = new OBV("ema", 20);
    data.slice(0, 300).forEach((c) => {
      chart.next(c.close, c.volume);
      lib.next(c);
    });
    const open = data[300];
    expect(chart.clone().next(open.close, open.volume)).toEqual(
      lib.preview(open)
    );
    data.slice(300).forEach((c) => {
      expect(chart.next(c.close, c.volume)).toEqual(lib.next(c));
    });
  });

  it("resolves its average as the package does", () => {
    expect(resolveObvSettings(undefined, undefined)).toEqual({
      maType: "sma",
      maLength: 20,
    });
    expect(resolveObvSettings("KAMA", "30")).toEqual({
      maType: "kama",
      maLength: 30,
    });
    expect(resolveObvSettings("mcginley", 20)).toBeNull();
    expect(resolveObvSettings("vwma", 20)).toBeNull();
    expect(resolveObvSettings("sma", 0)).toBeNull();
    expect(resolveObvSettings("sma", 1001)).toBeNull();
  });
});

describe("Chaikin Money Flow chart copy", () => {
  for (const length of [1, 2, 20, 100]) {
    it(`CMF ${length} equals the library`, () => {
      const data = candles(3000, length + 41);
      const lib = new CMF(length);
      const chart = new CMFState(length);
      data.forEach((c, i) => {
        const expected = lib.next(c);
        const actual = chart.next(c.high, c.low, c.close, c.volume);
        if (expected === null) {
          expect(actual, `bar ${i}`).toBeNull();
        } else {
          expect(actual, `bar ${i}`).toBe(expected.value);
          expect(Math.abs(expected.value)).toBeLessThanOrEqual(1);
        }
      });
    });
  }

  it("is 0 on a window with no volume", () => {
    const chart = new CMFState(3);
    for (let i = 0; i < 3; i++) chart.next(11, 9, 10.5, 0);
    expect(chart.next(11, 9, 10.5, 0)).toBe(0);
  });

  it("resolves its length as the package does", () => {
    expect(resolveCmfLength(undefined)).toBe(20);
    expect(resolveCmfLength(0)).toBeNull();
    expect(resolveCmfLength(1000)).toBe(1000);
  });
});

describe("Choppiness Index chart copy", () => {
  for (const length of [2, 14, 50]) {
    it(`CHOP ${length} equals the library`, () => {
      const data = candles(3000, length + 77);
      const lib = new CHOP(length);
      const chart = new CHOPState(length);
      data.forEach((c, i) => {
        const expected = lib.next(c);
        const actual = chart.next(c.high, c.low, c.close);
        if (expected === null) {
          expect(actual, `bar ${i}`).toBeNull();
        } else {
          expect(actual, `bar ${i}`).toBe(expected.value);
        }
      });
    });
  }

  it("is 100 when the range is 0", () => {
    const chart = new CHOPState(3);
    for (let i = 0; i < 3; i++) chart.next(10, 10, 10);
    expect(chart.next(10, 10, 10)).toBe(100);
  });

  it("refuses a length of 1", () => {
    expect(resolveChopLength(1)).toBeNull();
    expect(resolveChopLength(undefined)).toBe(14);
  });
});
