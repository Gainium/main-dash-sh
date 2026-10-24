/**
 * Discount / Premium OTE Levels for the chart study. A line-for-line copy of
 * `OTELevels` in @gainium/indicators (what the bot engine and backtester
 * run), which the dashboard does not depend on directly — keep the two in
 * step; `core/tests/oteLevels.vitest.test.ts` checks they agree bar by bar.
 *
 * Tracks the latest valid leg between a swing low and a swing high (pivots
 * with `leftBars` to the left and one bar to the right) that is at least
 * `minLegSize` percent of its low long, re-anchoring on the remaining swings
 * when price trades through the leg's extreme.
 */

export type OTELeg = { high: number; low: number; direction: 1 | -1 };

type Swing = { price: number; bar: number };
type Leg = { start: number; bull: boolean; low: number; high: number };

const MAX_SWINGS = 1000;
const MAX_LEGS = 100;
const RIGHT_BARS = 1;

/** TradingView pivot of the last `left + right + 1` values, or NaN. */
const pivot = (values: number[], left: number, isHigh: boolean): number => {
  const range = left + RIGHT_BARS;
  if (values.length <= range) {
    return NaN;
  }
  // newest first
  const buf: number[] = [];
  for (let i = 0; i <= range; i++) {
    buf.push(values[values.length - 1 - i]);
  }
  if (isNaN(buf[range])) {
    return NaN;
  }
  let minValue = buf[0];
  let maxValue = buf[0];
  let minIndex = 0;
  let maxIndex = 0;
  for (let i = range; i >= 0; i--) {
    const value = buf[i];
    if (value <= minValue) {
      minValue = value;
      minIndex = range - i;
    }
    if (value >= maxValue) {
      maxValue = value;
      maxIndex = range - i;
    }
  }
  return range - (isHigh ? maxIndex : minIndex) === RIGHT_BARS
    ? buf[RIGHT_BARS]
    : NaN;
};

export class OTELevelsState {
  private readonly left: number;
  private readonly minLegSize: number;
  private bar = -1;
  private highWindow: number[] = [];
  private lowWindow: number[] = [];
  private highs: Swing[] = [];
  private lows: Swing[] = [];
  private legs: Leg[] = [];

  constructor(leftBars = 10, minLegSize = 1) {
    this.left = Math.max(1, Math.floor(leftBars));
    this.minLegSize = Math.max(0, minLegSize);
  }

  private isLeg(a: number, b: number): boolean {
    const low = Math.min(a, b);
    return low > 0 && ((Math.max(a, b) - low) / low) * 100 >= this.minLegSize;
  }

  private pushLeg(leg: Leg) {
    this.legs.push(leg);
    if (this.legs.length > MAX_LEGS) this.legs.shift();
  }

  private pushSwing(list: Swing[], swing: Swing) {
    list.push(swing);
    if (list.length > MAX_SWINGS) list.shift();
  }

  private processSwing(price: number, bull: boolean, bar: number) {
    const source = bull ? this.highs : this.lows;
    const opposite = bull ? this.lows : this.highs;
    this.pushSwing(source, { price, bar });
    let op: Swing | undefined;
    // index 0 is never considered, as in the original script
    for (let i = opposite.length - 1; i > 0; i--) {
      if (this.isLeg(price, opposite[i].price)) {
        op = opposite[i];
        break;
      }
    }
    if (!op) return;
    const last = this.legs[this.legs.length - 1];
    if (last && op.bar <= last.start) return;
    this.pushLeg(
      bull
        ? { start: op.bar, bull, low: op.price, high: price }
        : { start: op.bar, bull, low: price, high: op.price },
    );
  }

  private invalidateUp(high: number) {
    while (this.highs.length) {
      const h = this.highs.pop() as Swing;
      if (h.price > high) {
        this.highs.push(h);
        break;
      }
    }
    this.legs.pop();
    const hi = this.highs[this.highs.length - 1];
    if (!hi) return;
    let lo: Swing | undefined;
    for (let i = this.lows.length - 1; i > 0; i--) {
      const l = this.lows[i];
      if (hi.bar > l.bar) break;
      if (this.isLeg(hi.price, l.price)) lo = l;
    }
    if (lo) {
      this.pushLeg({
        start: lo.bar,
        bull: false,
        low: lo.price,
        high: hi.price,
      });
    }
  }

  private invalidateDown(low: number) {
    while (this.lows.length) {
      const l = this.lows.pop() as Swing;
      if (l.price < low) {
        this.lows.push(l);
        break;
      }
    }
    this.legs.pop();
    const lo = this.lows[this.lows.length - 1];
    if (!lo) return;
    let hi: Swing | undefined;
    for (let i = this.highs.length - 1; i > 0; i--) {
      const h = this.highs[i];
      if (lo.bar > h.bar) break;
      if (this.isLeg(lo.price, h.price)) hi = h;
    }
    if (hi) {
      this.pushLeg({
        start: hi.bar,
        bull: true,
        low: lo.price,
        high: hi.price,
      });
    }
  }

  /** Feeds one closed candle; returns the latest leg, or null. */
  next(high: number, low: number): OTELeg | null {
    const bar = ++this.bar;
    while (this.legs.length && high > this.legs[this.legs.length - 1].high) {
      this.invalidateUp(high);
    }
    while (this.legs.length && low < this.legs[this.legs.length - 1].low) {
      this.invalidateDown(low);
    }
    this.highWindow.push(high);
    this.lowWindow.push(low);
    if (this.highWindow.length > this.left + RIGHT_BARS + 1) {
      this.highWindow.shift();
      this.lowWindow.shift();
    }
    const swingLow = pivot(this.lowWindow, this.left, false);
    if (!isNaN(swingLow)) this.processSwing(swingLow, false, bar);
    const swingHigh = pivot(this.highWindow, this.left, true);
    if (!isNaN(swingHigh)) this.processSwing(swingHigh, true, bar);
    return this.leg;
  }

  get leg(): OTELeg | null {
    const leg = this.legs[this.legs.length - 1];
    return leg
      ? { high: leg.high, low: leg.low, direction: leg.bull ? 1 : -1 }
      : null;
  }
}

/** Price of retracement `level` of a leg: 0 = its end, 1 = its origin. */
export const oteLevelPrice = (leg: OTELeg, level: number): number =>
  leg.direction > 0
    ? leg.high - level * (leg.high - leg.low)
    : leg.low + level * (leg.high - leg.low);

export const DEFAULT_OTE_LEVELS =
  "1, 0.79, 0.705, 0.618, 0.5, 0.382, 0.295, 0.21, 0";

/** Up to `max` finite numbers from a comma separated list. */
export const parseOteLevels = (text: string, max = 9): number[] =>
  `${text ?? ""}`
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v !== "")
    .map(Number)
    .filter((v) => Number.isFinite(v))
    .slice(0, max);
