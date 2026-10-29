import { describe, expect, it } from "vitest";
import { OrderBlocks } from "@gainium/indicators";

import { OrderBlocksState } from "@/utils/indicators/orderBlocks";

// The chart study's copy of Order Blocks must agree with the one the bot
// engine and backtester run (@gainium/indicators), bar by bar.

const HOUR = 3_600_000;

const walk = (n: number, seed: number) => {
  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  let price = 100;
  let time = Date.UTC(2026, 0, 1);
  return Array.from({ length: n }, (_, i) => {
    const open = price;
    price = Math.max(1, price * (1 + (rand() - 0.5) * 0.03));
    const close = price;
    time += HOUR * (rand() < 0.01 ? 5 : 1);
    return {
      open,
      close,
      // equal highs / lows now and then exercise the pivot tie rule
      high:
        rand() < 0.03
          ? Math.max(open, close)
          : Math.max(open, close) * (1 + rand() * 0.01),
      low:
        rand() < 0.03
          ? Math.min(open, close)
          : Math.min(open, close) * (1 - rand() * 0.01),
      time: i > 0 && rand() < 0.01 ? NaN : time,
    };
  });
};

const same = (a: number, b: number) =>
  (Number.isNaN(a) && Number.isNaN(b)) || a === b;

describe("Order Blocks chart copy", () => {
  for (const [swingLength, seed] of [
    [5, 7],
    [2, 11],
    [10, 23],
    [50, 31],
  ] as const) {
    it(`matches @gainium/indicators (swing ${swingLength}, seed ${seed})`, () => {
      const lib = new OrderBlocks(swingLength);
      const chart = new OrderBlocksState(swingLength);
      let values = 0;
      const blocks = new Set<number>();
      for (const c of walk(6000, seed)) {
        const want = lib.next(c);
        const got = chart.next(c.high, c.low, c.close, c.time);
        if (want === null) {
          expect(got).toBeNull();
          continue;
        }
        values++;
        if (got === null) throw new Error(`no value at ${values}`);
        for (const key of Object.keys(want) as (keyof typeof want)[]) {
          expect(same(got[key], want[key]), `${key} at ${values}`).toBe(true);
        }
        if (isFinite(want.bullishId)) blocks.add(want.bullishId);
        if (isFinite(want.bearishId)) blocks.add(-want.bearishId);
      }
      expect(values).toBeGreaterThan(5800);
      expect(blocks.size).toBeGreaterThan(20);
    });
  }

  it("ids blocks by bar index without a candle time", () => {
    const lib = new OrderBlocks(3);
    const chart = new OrderBlocksState(3);
    for (const c of walk(2000, 41)) {
      const want = lib.next({ ...c, time: NaN });
      const got = chart.next(c.high, c.low, c.close);
      if (want) {
        expect(same(got?.bullishId ?? -1, want.bullishId)).toBe(true);
        expect(same(got?.bearishId ?? -1, want.bearishId)).toBe(true);
      }
    }
  });

  it("previews an open candle without moving the state", () => {
    const a = new OrderBlocksState(4);
    const b = new OrderBlocksState(4);
    walk(1500, 5).forEach((c) => {
      a.clone().next(c.high * 1.2, c.low * 0.8, c.close * 1.1, c.time);
      expect(a.next(c.high, c.low, c.close, c.time)).toEqual(
        b.next(c.high, c.low, c.close, c.time),
      );
    });
  });
});
