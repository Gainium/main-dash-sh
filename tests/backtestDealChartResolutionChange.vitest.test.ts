import { describe, expect, test } from "vitest";

import { dealFrameFits } from "@/components/widgets/bots/backtest/redesign/dealToTradingView";

/**
 * A resolution picked on the backtest deal chart reframes the selected deal
 * only when reaching it loads a bounded number of bars: TradingView loads
 * every bar from the frame's start up to now, the cost the opening frame is
 * already budgeted by.
 */

const NOW_MS = Date.UTC(2026, 9, 14, 9);
const DAY_MS = 86_400_000;
const yearOld = NOW_MS - 352 * DAY_MS;

describe("backtest deal chart — resolution picked on the chart", () => {
  test.each(["360", "720", "1D", "240"])(
    "a year-old deal is reframed at %s",
    (res) => {
      expect(dealFrameFits(res, "1", yearOld, NOW_MS)).toBe(true);
    },
  );

  test("a year-old deal is not reframed at a fine resolution that would load ~100k bars", () => {
    expect(dealFrameFits("5", "1", yearOld, NOW_MS)).toBe(false);
  });

  test("the run resolution keeps its own, larger budget", () => {
    const monthOld = NOW_MS - 30 * DAY_MS;
    expect(dealFrameFits("1", "1", monthOld, NOW_MS)).toBe(true);
    expect(dealFrameFits("1", "60", monthOld, NOW_MS)).toBe(false);
  });

  test("a resolution with no known bar length is left to TradingView", () => {
    expect(dealFrameFits("1M", "1", yearOld, NOW_MS)).toBe(false);
  });

  test("TradingView short forms D / W are recognised", () => {
    expect(dealFrameFits("D", "1", yearOld, NOW_MS)).toBe(true);
  });
});
