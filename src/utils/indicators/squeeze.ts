/**
 * Squeeze Momentum for the chart study. A line-for-line copy of `Squeeze`
 * and `linregEnd` in @gainium/indicators (what the bot engine and backtester
 * run), which the dashboard does not depend on directly — keep the two in
 * step; `core/tests/squeeze.vitest.test.ts` checks they agree bar by bar.
 *
 * LazyBear's Squeeze Momentum (corrected v2), true range on:
 * - BB: sma(close, length) ± bbMult × population stdev(close, length).
 * - KC: sma(close, kcLength) ± kcMult × sma(trueRange, kcLength); the first
 *   candle's true range is high − low.
 * - squeeze 1 (on) when the BB is inside the KC, −1 (off) when outside, 0
 *   otherwise.
 * - momentum = least-squares end point over kcLength bars of
 *   close − avg(avg(highest high, lowest low), sma(close)).
 * Every window is summed directly; nothing is reported until the bands and
 * the momentum both exist.
 */

export type SqueezeValue = { momentum: number; squeeze: number };

const wholeLength = (v: number | string | null | undefined, d: number) => {
  const n = Math.floor(v === null || v === undefined || v === '' ? NaN : +v);
  return isFinite(n) && n >= 1 ? n : d;
};

const positive = (v: number | string | null | undefined, d: number) => {
  const n = v === null || v === undefined || v === '' ? NaN : +v;
  return isFinite(n) && n > 0 ? n : d;
};

/** Squeeze settings as the library resolves them. */
export const resolveSqueezeSettings = (
  length?: number | string | null,
  bbMult?: number | string | null,
  kcLength?: number | string | null,
  kcMult?: number | string | null
) => ({
  length: wholeLength(length, 20),
  bbMult: positive(bbMult, 2),
  kcLength: wholeLength(kcLength, 20),
  kcMult: positive(kcMult, 1.5),
});

/**
 * End point of the least-squares line through `values` (oldest first) —
 * Pine's `linreg(src, values.length, 0)`.
 */
export const linregEnd = (values: ArrayLike<number>): number => {
  const n = values.length;
  if (n === 0) return NaN;
  if (n === 1) return values[0];
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const y = values[i];
    sx += i;
    sy += y;
    sxx += i * i;
    sxy += i * y;
  }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const intercept = (sy - slope * sx) / n;
  return intercept + slope * (n - 1);
};

const push = (list: number[], value: number, size: number) => {
  list.push(value);
  if (list.length > size) list.shift();
};

export class SqueezeState {
  readonly length: number;
  readonly bbMult: number;
  readonly kcLength: number;
  readonly kcMult: number;
  private readonly closeWindow: number;
  private prevClose = NaN;
  private closes: number[] = [];
  private highs: number[] = [];
  private lows: number[] = [];
  private trs: number[] = [];
  private vals: number[] = [];

  constructor(
    length?: number | string | null,
    bbMult?: number | string | null,
    kcLength?: number | string | null,
    kcMult?: number | string | null
  ) {
    const r = resolveSqueezeSettings(length, bbMult, kcLength, kcMult);
    this.length = r.length;
    this.bbMult = r.bbMult;
    this.kcLength = r.kcLength;
    this.kcMult = r.kcMult;
    this.closeWindow = Math.max(this.length, this.kcLength);
  }

  /** Candles before the library's factory uses a result. */
  get warmup(): number {
    return 2 * Math.max(this.length, this.kcLength);
  }

  next(high: number, low: number, close: number): SqueezeValue | null {
    const prevClose = this.prevClose;
    const tr = isNaN(prevClose)
      ? high - low
      : Math.max(
          high - low,
          Math.abs(high - prevClose),
          Math.abs(low - prevClose)
        );
    this.prevClose = close;
    const kcL = this.kcLength;
    push(this.closes, close, this.closeWindow);
    push(this.highs, high, kcL);
    push(this.lows, low, kcL);
    push(this.trs, tr, kcL);

    const closes = this.closes;
    const nc = closes.length;

    // momentum source value of this bar, once kcLength candles exist
    if (this.highs.length === kcL) {
      let highest = -Infinity;
      let lowest = Infinity;
      for (let i = 0; i < kcL; i++) {
        if (this.highs[i] > highest) highest = this.highs[i];
        if (this.lows[i] < lowest) lowest = this.lows[i];
      }
      let kcSum = 0;
      for (let i = nc - kcL; i < nc; i++) kcSum += closes[i];
      const kcMa = kcSum / kcL;
      push(this.vals, close - ((highest + lowest) / 2 + kcMa) / 2, kcL);
    }
    if (nc < this.length || this.vals.length < kcL) {
      return null;
    }

    // Bollinger Bands
    const len = this.length;
    let sum = 0;
    for (let i = nc - len; i < nc; i++) sum += closes[i];
    const basis = sum / len;
    let sq = 0;
    for (let i = nc - len; i < nc; i++) {
      const d = closes[i] - basis;
      sq += d * d;
    }
    const dev = this.bbMult * Math.sqrt(sq / len);
    const upperBB = basis + dev;
    const lowerBB = basis - dev;

    // Keltner Channel
    let kcSum = 0;
    let trSum = 0;
    for (let i = nc - kcL; i < nc; i++) kcSum += closes[i];
    for (let i = 0; i < kcL; i++) trSum += this.trs[i];
    const ma = kcSum / kcL;
    const rangema = trSum / kcL;
    const upperKC = ma + rangema * this.kcMult;
    const lowerKC = ma - rangema * this.kcMult;

    const squeeze =
      lowerBB > lowerKC && upperBB < upperKC
        ? 1
        : lowerBB < lowerKC && upperBB > upperKC
          ? -1
          : 0;

    return { momentum: linregEnd(this.vals), squeeze };
  }

  /** A copy to preview an open candle without touching this state. */
  clone(): SqueezeState {
    const copy = Object.assign(
      Object.create(Object.getPrototypeOf(this)) as SqueezeState,
      this
    );
    copy.closes = [...this.closes];
    copy.highs = [...this.highs];
    copy.lows = [...this.lows];
    copy.trs = [...this.trs];
    copy.vals = [...this.vals];
    return copy;
  }
}
