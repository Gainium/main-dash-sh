import { describe, expect, it } from "vitest";
import { Candle } from "@gainium/indicators";

import { CandleColourState } from "@/utils/indicators/candleColour";

// The chart study's copy of Candle colour must agree with the one the bot
// engine and backtester run (@gainium/indicators), bar by bar.

const walk = (n: number, seed: number) => {
  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  let price = 100;
  return Array.from({ length: n }, () => {
    const open = price;
    // a few dojis (close = open) break the runs
    price =
      rand() < 0.04 ? price : Math.max(1, price * (1 + (rand() - 0.48) * 0.02));
    const close = price;
    return {
      open,
      close,
      high: Math.max(open, close) * (1 + rand() * 0.005),
      low: Math.min(open, close) * (1 - rand() * 0.005),
    };
  });
};

describe("Candle colour chart copy", () => {
  for (const [source, seed] of [
    ["heikinAshi", 7],
    ["regular", 11],
    ["heikinAshi", 23],
    ["regular", 31],
  ] as const) {
    it(`matches @gainium/indicators (${source}, seed ${seed})`, () => {
      const lib = new Candle(source);
      const chart = new CandleColourState(source);
      let values = 0;
      let longest = 0;
      for (const c of walk(5000, seed)) {
        const want = lib.next(c);
        const got = chart.next(c.open, c.high, c.low, c.close);
        if (want === null) {
          expect(got).toBeNull();
        } else {
          values++;
          longest = Math.max(longest, Math.abs(want.streak));
          expect(got).toEqual({ ...want });
        }
      }
      expect(values).toBeGreaterThan(4900);
      expect(longest).toBeGreaterThan(3);
    });
  }

  it("reads anything but regular as Heikin Ashi, like the library", () => {
    expect(new CandleColourState("nonsense").source).toBe("heikinAshi");
    expect(new CandleColourState(undefined).source).toBe("heikinAshi");
  });

  it("previews an open candle without moving the state", () => {
    const a = new CandleColourState("heikinAshi");
    const b = new CandleColourState("heikinAshi");
    walk(300, 5).forEach((c) => {
      a.clone().next(c.close, c.high * 2, c.low, c.open);
      expect(a.next(c.open, c.high, c.low, c.close)).toEqual(
        b.next(c.open, c.high, c.low, c.close),
      );
    });
  });
});
