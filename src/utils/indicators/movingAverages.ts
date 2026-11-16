/**
 * Moving averages for the chart studies. Line-for-line copies of the classes
 * in @gainium/indicators (what the bot engine and the backtester run), which
 * the dashboard does not depend on directly — keep the two in step;
 * `core/tests/movingAverages.vitest.test.ts` checks they agree bar by bar.
 *
 * Two shapes:
 * - window functions (`kamaNext`, `almaValue`, `lsmaValue`) for the MA and
 *   MA Ratio studies, which read their window from TradingView series;
 * - streams (`createMovingAverageStream`), fed one value at a time, for the
 *   average of the On-Balance Volume line. Each stream copies its library
 *   class's arithmetic in the same order, so the two give the same numbers.
 */

/** KAMA's fast and slow EMA lengths (Kaufman's and TradingView's). */
export const KAMA_FAST = 2;
export const KAMA_SLOW = 30;
/** ALMA's offset and sigma (TradingView's defaults). */
export const ALMA_OFFSET = 0.85;
export const ALMA_SIGMA = 6;

/**
 * One bar of Kaufman's Adaptive Moving Average.
 *
 * `prev` is the line on the previous bar (NaN before it exists or after a
 * gap), `window` the last `length + 1` inputs, oldest first. The efficiency
 * ratio |net change| / Σ|bar-to-bar change| (0 when nothing moved) picks a
 * smoothing constant between the fast and the slow EMA's, squared. The line
 * starts from the input itself. A window that is short or holds a
 * non-finite input gives NaN, and the line starts over afterwards.
 */
export function kamaNext(
  prev: number,
  window: ArrayLike<number>,
  fast: number = KAMA_FAST,
  slow: number = KAMA_SLOW
): number {
  const size = window.length;
  if (size < 2) {
    return NaN;
  }
  let volatility = 0;
  let prevValue = window[0];
  if (!isFinite(prevValue)) {
    return NaN;
  }
  for (let i = 1; i < size; i++) {
    const v = window[i];
    if (!isFinite(v)) {
      return NaN;
    }
    volatility += Math.abs(v - prevValue);
    prevValue = v;
  }
  const price = window[size - 1];
  const mom = Math.abs(price - window[0]);
  const er = volatility !== 0 ? mom / volatility : 0;
  const fastAlpha = 2 / (fast + 1);
  const slowAlpha = 2 / (slow + 1);
  const alpha = Math.pow(er * (fastAlpha - slowAlpha) + slowAlpha, 2);
  const base = isNaN(prev) ? price : prev;
  return alpha * price + (1 - alpha) * base;
}

/** ALMA's normalised Gaussian weights, oldest bar first. */
export function almaWeights(
  length: number,
  offset: number = ALMA_OFFSET,
  sigma: number = ALMA_SIGMA
): Float64Array {
  const weights = new Float64Array(length);
  const m = offset * (length - 1);
  const sd = length / sigma;
  let norm = 0;
  for (let i = 0; i < length; i++) {
    const w = Math.exp(-Math.pow(i - m, 2) / (2 * sd * sd));
    weights[i] = w;
    norm += w;
  }
  for (let i = 0; i < length; i++) {
    weights[i] /= norm;
  }
  return weights;
}

/**
 * Arnaud Legoux Moving Average of `window` (oldest first, as long as
 * `weights`). A non-finite input gives NaN.
 */
export function almaValue(
  window: ArrayLike<number>,
  weights: Float64Array
): number {
  if (window.length < weights.length) {
    return NaN;
  }
  let sum = 0;
  for (let i = 0; i < weights.length; i++) {
    sum += window[i] * weights[i];
  }
  return sum;
}

/**
 * Least Squares Moving Average: the least-squares line through `window`
 * (oldest first) read at its newest bar minus `offset` (TradingView's
 * `ta.linreg`). One input is the input itself.
 */
export function lsmaValue(window: ArrayLike<number>, offset = 0): number {
  const n = window.length;
  if (n === 0) {
    return NaN;
  }
  if (n === 1) {
    return window[0];
  }
  const sumX = (n * (n - 1)) / 2;
  const sumX2 = ((n - 1) * n * (2 * n - 1)) / 6;
  const denominator = n * sumX2 - sumX * sumX;
  let sumY = 0;
  let sumXY = 0;
  for (let i = 0; i < n; i++) {
    const y = window[i];
    sumY += y;
    sumXY += i * y;
  }
  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  return intercept + slope * (n - 1 - offset);
}

/** A moving average fed one value at a time. */
export interface MovingAverageStream {
  /** The average after `value`, or null while it has no value yet. */
  next(value: number): number | null;
  /** The value the last `next` returned. */
  readonly result: number | null;
  /** An independent copy (to preview an open candle). */
  clone(): MovingAverageStream;
}

/**
 * The library's circular buffer: `add` overwrites the oldest slot, keeps the
 * value it replaced (`oldValue`) and reports whether the buffer has been
 * full once. Values sit in slot order, not age order, as there.
 */
class Ring {
  values: Float64Array;
  index = 0;
  prevIndex = 0;
  filled = false;
  oldValue: number;

  constructor(
    readonly size: number,
    initial = 0
  ) {
    this.values = new Float64Array(size).fill(initial);
    this.oldValue = initial;
  }

  add(value: number): boolean {
    if (this.size < 1) {
      // the library's zero-length buffer never fills
      return false;
    }
    this.oldValue = this.values[this.index];
    this.values[this.index] = value;
    this.prevIndex = this.index;
    this.index = (this.index + 1) % this.size;
    if (!this.filled && this.index === 0) {
      this.filled = true;
    }
    return this.filled;
  }

  get last(): number {
    return this.values[this.prevIndex];
  }

  /** The window, oldest first. */
  ordered(): Float64Array {
    const out = new Float64Array(this.size);
    for (let i = 0; i < this.size; i++) {
      out[i] = this.values[(this.index + i) % this.size];
    }
    return out;
  }

  /** Sum in slot order (the library's `average(h.array)`). */
  average(): number {
    let sum = 0;
    for (let i = 0; i < this.size; i++) {
      sum += this.values[i];
    }
    return this.size === 0 ? 0 : sum / this.size;
  }

  clone(): Ring {
    const copy = new Ring(this.size);
    copy.values = this.values.slice();
    copy.index = this.index;
    copy.prevIndex = this.prevIndex;
    copy.filled = this.filled;
    copy.oldValue = this.oldValue;
    return copy;
  }
}

abstract class Stream implements MovingAverageStream {
  result: number | null = null;

  next(value: number): number | null {
    this.result = this.calculate(value);
    return this.result;
  }

  protected abstract calculate(value: number): number | null;

  abstract clone(): MovingAverageStream;

  protected copyTo<T extends Stream>(copy: T): T {
    copy.result = this.result;
    return copy;
  }
}

class SmaStream extends Stream {
  private history: Ring;
  private rollingSum = 0;

  constructor(private readonly length: number) {
    super();
    this.history = new Ring(length);
  }

  protected calculate(value: number): number | null {
    this.history.add(value);
    this.rollingSum = this.rollingSum - this.history.oldValue + value;
    return this.history.filled ? this.rollingSum / this.length : null;
  }

  clone(): SmaStream {
    const copy = this.copyTo(new SmaStream(this.length));
    copy.history = this.history.clone();
    copy.rollingSum = this.rollingSum;
    return copy;
  }
}

// EMA (alpha 2 / (n + 1)) and RMA (alpha 1 / n): seeded with the average of
// the first `length` inputs, waiting for a window with no gap.
class ExponentialStream extends Stream {
  private history: Ring;
  private current = NaN;

  constructor(
    private readonly length: number,
    private readonly kind: 'ema' | 'rma'
  ) {
    super();
    this.history = new Ring(length);
  }

  protected calculate(value: number): number | null {
    this.history.add(value);
    if (!this.history.filled) {
      return null;
    }
    if (isNaN(this.current)) {
      const seed = this.history.average();
      if (isNaN(seed)) {
        return null;
      }
      this.current = seed;
      return this.current;
    }
    const prev = this.current;
    if (this.kind === 'ema') {
      this.current = (value - prev) * (2 / (this.length + 1)) + prev;
    } else {
      const alpha = 1 / this.length;
      this.current = prev * (1 - alpha) + value * alpha;
    }
    return this.current;
  }

  clone(): ExponentialStream {
    const copy = this.copyTo(new ExponentialStream(this.length, this.kind));
    copy.history = this.history.clone();
    copy.current = this.current;
    return copy;
  }
}

// The library's WMA keeps a rolling weighted sum: once full, every value's
// weight drops by one (subtract the plain sum of the previous window) and the
// new value comes in at weight n.
class WmaStream extends Stream {
  private prices: Ring;
  private sum = NaN;
  private rollingSum = NaN;
  private readonly denominator: number;

  constructor(private readonly length: number) {
    super();
    this.prices = new Ring(length);
    this.denominator = (length * (length + 1)) >> 1;
  }

  protected calculate(value: number): number | null {
    const p = this.prices;
    p.add(value);
    if (p.filled) {
      if (isNaN(this.sum)) {
        this.sum = 0;
        for (let i = 0; i < this.length; i++) {
          this.sum +=
            p.values[(p.prevIndex - i + this.length) % this.length] *
            (this.length - i);
        }
      } else {
        this.sum -= this.rollingSum;
        this.sum += value * this.length;
      }
    }
    this.rollingSum = (this.rollingSum || 0) - (p.oldValue || 0) + value;
    if (!p.filled) {
      return null;
    }
    return this.sum / this.denominator;
  }

  clone(): WmaStream {
    const copy = this.copyTo(new WmaStream(this.length));
    copy.prices = this.prices.clone();
    copy.sum = this.sum;
    copy.rollingSum = this.rollingSum;
    return copy;
  }
}

// DEMA = 2·EMA − EMA(EMA); TEMA = 3·(EMA − EMA(EMA)) + EMA(EMA(EMA)).
class ChainedEmaStream extends Stream {
  private emas: ExponentialStream[];

  constructor(
    private readonly length: number,
    private readonly depth: 2 | 3
  ) {
    super();
    this.emas = Array.from(
      { length: depth },
      () => new ExponentialStream(length, 'ema')
    );
  }

  protected calculate(value: number): number | null {
    let input = value;
    for (const ema of this.emas) {
      const out = ema.next(input);
      if (out === null) {
        return null;
      }
      input = out;
    }
    const [e1, e2, e3] = this.emas.map((ema) => ema.result as number);
    return this.depth === 2 ? 2 * e1 - e2 : 3 * (e1 - e2) + e3;
  }

  clone(): ChainedEmaStream {
    const copy = this.copyTo(new ChainedEmaStream(this.length, this.depth));
    copy.emas = this.emas.map((ema) => ema.clone());
    return copy;
  }
}

// The library's HMA feeds its half-length WMA only once the full-length one
// has a value.
class HmaStream extends Stream {
  private root: WmaStream;
  private full: WmaStream;
  private half: WmaStream;

  constructor(private readonly length: number) {
    super();
    this.root = new WmaStream(Math.floor(Math.sqrt(length)));
    this.full = new WmaStream(length);
    this.half = new WmaStream(Math.floor(length / 2));
  }

  protected calculate(value: number): number | null {
    if (this.full.next(value) === null) {
      return null;
    }
    if (this.half.next(value) === null) {
      return null;
    }
    return this.root.next(
      2 * (this.half.result as number) - (this.full.result as number)
    );
  }

  clone(): HmaStream {
    const copy = this.copyTo(new HmaStream(this.length));
    copy.root = this.root.clone();
    copy.full = this.full.clone();
    copy.half = this.half.clone();
    return copy;
  }
}

class KamaStream extends Stream {
  private history: Ring;
  private current = NaN;

  constructor(private readonly length: number) {
    super();
    this.history = new Ring(length + 1);
  }

  protected calculate(value: number): number | null {
    this.history.add(value);
    if (!this.history.filled) {
      return null;
    }
    const seeded = !isNaN(this.current);
    this.current = kamaNext(this.current, this.history.ordered());
    if (isNaN(this.current)) {
      // a gap: NaN once seeded, nothing before (the library's `gap()`)
      return seeded ? NaN : null;
    }
    return this.current;
  }

  clone(): KamaStream {
    const copy = this.copyTo(new KamaStream(this.length));
    copy.history = this.history.clone();
    copy.current = this.current;
    return copy;
  }
}

class WindowStream extends Stream {
  private history: Ring;
  private readonly weights: Float64Array | null;

  constructor(
    private readonly length: number,
    private readonly kind: 'alma' | 'lsma'
  ) {
    super();
    this.history = new Ring(length);
    this.weights = kind === 'alma' ? almaWeights(length) : null;
  }

  protected calculate(value: number): number | null {
    if (!this.history.add(value)) {
      return null;
    }
    const window = this.history.ordered();
    return this.weights
      ? almaValue(window, this.weights)
      : lsmaValue(window);
  }

  clone(): WindowStream {
    const copy = this.copyTo(new WindowStream(this.length, this.kind));
    copy.history = this.history.clone();
    return copy;
  }
}

/**
 * The averages a stream can be: every single-series MA of the package (the
 * OBV line's `OBV_MA_TYPES`). Anything else is an SMA, as the package's own
 * fallback.
 */
export const STREAM_MA_TYPES = [
  'sma',
  'ema',
  'wma',
  'dema',
  'tema',
  'hma',
  'rma',
  'kama',
  'alma',
  'lsma',
] as const;

export function createMovingAverageStream(
  type: string,
  length: number
): MovingAverageStream {
  switch (String(type).toLowerCase()) {
    case 'ema':
      return new ExponentialStream(length, 'ema');
    case 'rma':
      return new ExponentialStream(length, 'rma');
    case 'wma':
      return new WmaStream(length);
    case 'dema':
      return new ChainedEmaStream(length, 2);
    case 'tema':
      return new ChainedEmaStream(length, 3);
    case 'hma':
      return new HmaStream(length);
    case 'kama':
      return new KamaStream(length);
    case 'alma':
      return new WindowStream(length, 'alma');
    case 'lsma':
      return new WindowStream(length, 'lsma');
    default:
      return new SmaStream(length);
  }
}
