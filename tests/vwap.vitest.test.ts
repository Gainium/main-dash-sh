import { describe, expect, it } from "vitest";
import { VWAP } from "@gainium/indicators";

import { VWAPState, vwapPeriodStart } from "@/utils/indicators/vwap";

// The chart study's copy of anchored VWAP must agree with the one the bot
// engine and backtester run (@gainium/indicators), bar by bar.

const MIN = 60_000;

const walk = (n: number, seed: number, stepMs: number, startMs: number) => {
  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  let price = 100;
  let time = startMs;
  return Array.from({ length: n }, (_, i) => {
    const open = price;
    price = Math.max(1, price * (1 + (rand() - 0.5) * 0.02));
    const close = price;
    // gaps in the feed, candles with no volume and a few without a time
    time += stepMs * (rand() < 0.02 ? 1 + Math.floor(rand() * 50) : 1);
    const volume = rand() < 0.05 ? 0 : rand() * 1000;
    return {
      open,
      close,
      high: Math.max(open, close) * (1 + rand() * 0.005),
      low: Math.min(open, close) * (1 - rand() * 0.005),
      volume,
      time: i > 0 && rand() < 0.01 ? NaN : time,
    };
  });
};

describe("VWAP chart copy", () => {
  for (const [anchor, multiplier, stepMs, seed] of [
    ["day", 1, 15 * MIN, 7],
    ["day", 2.5, 5 * MIN, 11],
    ["week", 1, 60 * MIN, 23],
    ["month", 1.5, 4 * 60 * MIN, 31],
  ] as const) {
    it(`matches @gainium/indicators (${anchor}, ×${multiplier})`, () => {
      // starts mid-period, so the first period is skipped by both
      const start = Date.UTC(2025, 0, 15, 7, 30);
      const lib = new VWAP(anchor, multiplier);
      const chart = new VWAPState(anchor, multiplier);
      let values = 0;
      for (const c of walk(6000, seed, stepMs, start)) {
        const want = lib.next(c);
        const got = chart.next(c.time, c.high, c.low, c.close, c.volume);
        if (want === null) {
          expect(got).toBeNull();
        } else {
          values++;
          expect(got).toEqual({
            vwap: want.vwap,
            stdev: want.stdev,
            upper: want.upper,
            lower: want.lower,
            price: want.price,
            periodStart: want.periodStart,
          });
        }
      }
      expect(values).toBeGreaterThan(3000);
    });
  }

  it("reports the first period only when it starts on its anchor", () => {
    const day = Date.UTC(2025, 2, 3);
    const aligned = new VWAPState("day");
    expect(aligned.next(day, 11, 9, 10, 5)?.vwap).toBe(10);
    const late = new VWAPState("day");
    expect(late.next(day + 60 * MIN, 11, 9, 10, 5)).toBeNull();
  });

  it("anchors weeks on Monday and months on the 1st, UTC", () => {
    // Wednesday 2025-03-05
    const t = Date.UTC(2025, 2, 5, 13);
    expect(vwapPeriodStart(t, "week")).toBe(Date.UTC(2025, 2, 3));
    expect(vwapPeriodStart(t, "month")).toBe(Date.UTC(2025, 2, 1));
    expect(vwapPeriodStart(t, "DAY")).toBe(Date.UTC(2025, 2, 5));
  });

  it("previews an open candle without moving the state", () => {
    const day = Date.UTC(2025, 2, 3);
    const state = new VWAPState("day");
    state.next(day, 11, 9, 10, 5);
    const preview = state.clone().next(day + MIN, 21, 19, 20, 5);
    expect(preview?.vwap).toBe(15);
    expect(state.next(day + MIN, 11, 9, 10, 5)?.vwap).toBe(10);
  });
});
