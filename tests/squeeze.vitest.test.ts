import { describe, expect, it } from "vitest";
import { Squeeze } from "@gainium/indicators";

import { SqueezeState } from "@/utils/indicators/squeeze";

// The chart study's copy of Squeeze Momentum must agree with the one the bot
// engine and backtester run (@gainium/indicators), bar by bar.

const walk = (n: number, seed: number) => {
  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  let price = 100;
  let vol = 0.01;
  return Array.from({ length: n }, () => {
    // volatility regimes so squeezes form and fire
    if (rand() < 0.02) vol = 0.002 + rand() * 0.03;
    const open = price;
    price = Math.max(1, price * (1 + (rand() - 0.5) * vol));
    const close = price;
    return {
      open,
      close,
      high: Math.max(open, close) * (1 + rand() * vol * 0.3),
      low: Math.min(open, close) * (1 - rand() * vol * 0.3),
    };
  });
};

describe("Squeeze Momentum chart copy", () => {
  for (const [length, bbMult, kcLength, kcMult, seed] of [
    [20, 2, 20, 1.5, 7],
    [20, 1.5, 20, 1.5, 11],
    [10, 2.5, 30, 1.2, 23],
    [50, 1.8, 12, 2.2, 31],
  ] as const) {
    it(`matches @gainium/indicators (${length}, ${bbMult}, ${kcLength}, ${kcMult})`, () => {
      const lib = new Squeeze(length, bbMult, kcLength, kcMult);
      const chart = new SqueezeState(length, bbMult, kcLength, kcMult);
      expect(chart.warmup).toBe(lib.warmup);
      let values = 0;
      const states = new Set<number>();
      for (const c of walk(5000, seed)) {
        const want = lib.next(c);
        const got = chart.next(c.high, c.low, c.close);
        if (want === null) {
          expect(got).toBeNull();
        } else {
          values++;
          states.add(want.squeeze);
          expect(got).toEqual({ momentum: want.momentum, squeeze: want.squeeze });
        }
      }
      expect(values).toBeGreaterThan(4900);
      // squeezes form and release (0, neither, is rare with equal lengths)
      expect(states.has(1) && states.has(-1)).toBe(true);
    });
  }

  it("falls back to the library defaults for invalid settings", () => {
    const lib = new Squeeze(0, -1, NaN, 0);
    const chart = new SqueezeState("", "-1", null, "0");
    expect([chart.length, chart.bbMult, chart.kcLength, chart.kcMult]).toEqual(
      [lib.length, lib.bbMult, lib.kcLength, lib.kcMult],
    );
  });

  it("previews an open candle without moving the state", () => {
    const a = new SqueezeState();
    const b = new SqueezeState();
    walk(400, 5).forEach((c) => {
      a.clone().next(c.high * 2, c.low, c.close);
      expect(a.next(c.high, c.low, c.close)).toEqual(
        b.next(c.high, c.low, c.close),
      );
    });
  });
});
