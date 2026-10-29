/**
 * Order Blocks for the chart study. A line-for-line copy of `OrderBlocks`
 * (and the `PivotCalculator` it uses) in @gainium/indicators — what the bot
 * engine and backtester run — which the dashboard does not depend on
 * directly; keep the two in step. `core/tests/orderBlocks.vitest.test.ts`
 * checks they agree bar by bar.
 *
 * - Swings: pivots with L (`swingLength`) bars on both sides, confirmed L bars
 *   after they print. Only the latest swing of each kind is a break target.
 * - Bullish block: a close above the latest unbroken swing high; the candle
 *   with the lowest low from the swing bar to the breaking candle (ties → the
 *   latest), zone = its low..high. Bearish: the mirror.
 * - A bullish block ends when a candle closes below its bottom, a bearish one
 *   when a candle closes above its top. One block per side; the search goes
 *   back at most 500 bars.
 * - `*Id` = the breaking candle's open time (its bar index without one).
 *   Nothing is reported for the first 2L candles.
 */

export type OrderBlocksValue = {
  bullishTop: number;
  bullishBottom: number;
  bullishId: number;
  bearishTop: number;
  bearishBottom: number;
  bearishId: number;
  price: number;
};

/** Most bars searched back from the breaking candle for the block candle. */
export const OB_MAX_WINDOW = 500;

/** A stored swing length: a whole number ≥ 1, anything else 5. */
export const resolveOBSwingLength = (
  swingLength?: number | string | null
): number => {
  const n = Math.floor(
    swingLength === null || swingLength === undefined || swingLength === ''
      ? NaN
      : +swingLength
  );
  return isFinite(n) && n >= 1 ? n : 5;
};

/** `PivotCalculator` of @gainium/indicators. */
class Pivot {
  private readonly buffer: Float64Array;
  private readonly range: number;
  private readonly isHigh: boolean;

  constructor(
    leftBars: number,
    private readonly rightBars: number,
    type: 'high' | 'low'
  ) {
    this.isHigh = type === 'high';
    this.range = leftBars + rightBars;
    this.buffer = new Float64Array(leftBars + rightBars + 1);
  }

  calculate(array: number[]): number {
    const { range, rightBars, isHigh } = this;
    if (array.length <= range) {
      return NaN;
    }
    for (let i = 0; i <= range; i++) {
      this.buffer[i] = array[array.length - 1 - i];
    }
    const leftEdge = this.buffer[range] ?? NaN;
    if (isNaN(leftEdge)) {
      return NaN;
    }
    const possiblePivot = this.buffer[rightBars];
    let minValue = this.buffer[0];
    let maxValue = this.buffer[0];
    let minIndex = 0;
    let maxIndex = 0;
    for (let i = range; i >= 0; i--) {
      const value = this.buffer[i];
      if (value <= minValue) {
        minValue = value;
        minIndex = range - i;
      }
      if (value >= maxValue) {
        maxValue = value;
        maxIndex = range - i;
      }
    }
    const searchIndex = isHigh ? maxIndex : minIndex;
    if (range - searchIndex === rightBars) {
      return possiblePivot;
    }
    return NaN;
  }
}

export class OrderBlocksState {
  readonly swingLength: number;
  private pivotHigh: Pivot;
  private pivotLow: Pivot;
  private highs: number[] = [];
  private lows: number[] = [];
  private ids: number[] = [];
  private bar = -1;
  private swingHigh = NaN;
  private swingHighBar = NaN;
  private swingLow = NaN;
  private swingLowBar = NaN;
  private bullTop = NaN;
  private bullBottom = NaN;
  private bullId = NaN;
  private bearTop = NaN;
  private bearBottom = NaN;
  private bearId = NaN;

  constructor(swingLength?: number | string | null) {
    this.swingLength = Math.min(
      resolveOBSwingLength(swingLength),
      Math.floor((OB_MAX_WINDOW - 1) / 2)
    );
    this.pivotHigh = new Pivot(this.swingLength, this.swingLength, 'high');
    this.pivotLow = new Pivot(this.swingLength, this.swingLength, 'low');
  }

  next(
    high: number,
    low: number,
    close: number,
    time?: number
  ): OrderBlocksValue | null {
    const bar = ++this.bar;
    const id = typeof time === 'number' && isFinite(time) ? time : bar;
    this.highs.push(high);
    this.lows.push(low);
    this.ids.push(id);
    if (this.highs.length > OB_MAX_WINDOW) {
      this.highs.shift();
      this.lows.shift();
      this.ids.shift();
    }
    const L = this.swingLength;

    // 1. swings confirmed on this bar (the pivot printed L bars ago)
    const ph = this.pivotHigh.calculate(this.highs);
    if (!isNaN(ph)) {
      this.swingHigh = ph;
      this.swingHighBar = bar - L;
    }
    const pl = this.pivotLow.calculate(this.lows);
    if (!isNaN(pl)) {
      this.swingLow = pl;
      this.swingLowBar = bar - L;
    }

    // 2. mitigation on close
    if (close < this.bullBottom) {
      this.bullTop = NaN;
      this.bullBottom = NaN;
      this.bullId = NaN;
    }
    if (close > this.bearTop) {
      this.bearTop = NaN;
      this.bearBottom = NaN;
      this.bearId = NaN;
    }

    // 3. breaks of structure → new blocks
    const n = this.highs.length;
    const oldest = bar - (n - 1);
    if (close > this.swingHigh) {
      const from = Math.max(this.swingHighBar, oldest) - oldest;
      let best = n - 1;
      for (let i = n - 1; i >= from; i--) {
        if (this.lows[i] < this.lows[best]) best = i;
      }
      this.bullTop = this.highs[best];
      this.bullBottom = this.lows[best];
      this.bullId = id;
      this.swingHigh = NaN;
      this.swingHighBar = NaN;
    }
    if (close < this.swingLow) {
      const from = Math.max(this.swingLowBar, oldest) - oldest;
      let best = n - 1;
      for (let i = n - 1; i >= from; i--) {
        if (this.highs[i] > this.highs[best]) best = i;
      }
      this.bearTop = this.highs[best];
      this.bearBottom = this.lows[best];
      this.bearId = id;
      this.swingLow = NaN;
      this.swingLowBar = NaN;
    }

    if (bar < 2 * L) {
      return null;
    }
    return {
      bullishTop: this.bullTop,
      bullishBottom: this.bullBottom,
      bullishId: this.bullId,
      bearishTop: this.bearTop,
      bearishBottom: this.bearBottom,
      bearishId: this.bearId,
      price: close,
    };
  }

  /** A copy to preview an open candle without touching this state. */
  clone(): OrderBlocksState {
    const copy = Object.assign(
      Object.create(Object.getPrototypeOf(this)) as OrderBlocksState,
      this
    );
    copy.highs = [...this.highs];
    copy.lows = [...this.lows];
    copy.ids = [...this.ids];
    // the pivots' buffers are scratch space, rewritten on every call, but a
    // shared one would be written by the preview mid-calculation
    copy.pivotHigh = new Pivot(this.swingLength, this.swingLength, 'high');
    copy.pivotLow = new Pivot(this.swingLength, this.swingLength, 'low');
    return copy;
  }
}
