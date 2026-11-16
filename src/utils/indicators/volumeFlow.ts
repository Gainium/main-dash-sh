/**
 * On-Balance Volume, Chaikin Money Flow and the Choppiness Index for the
 * chart studies. Line-for-line copies of `OBV`, `CMF` and `CHOP` in
 * @gainium/indicators (what the bot engine and the backtester run), which the
 * dashboard does not depend on directly — keep them in step;
 * `core/tests/volumeFlow.vitest.test.ts` checks they agree bar by bar.
 *
 * Each state is fed closed candles only (`closedCandleFeed` in
 * customIndicators.js) and has a `clone()` to preview the open candle.
 */
import {
  createMovingAverageStream,
  type MovingAverageStream,
} from '@/utils/indicators/movingAverages';

export const OBV_DEFAULT_MA_TYPE = 'sma';
export const OBV_DEFAULT_MA_LENGTH = 20;
export const OBV_MAX_MA_LENGTH = 1000;
/** The averages the OBV line can be compared with (the package's `OBV_MA_TYPES`). */
export const OBV_MA_TYPES = [
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

export const CMF_DEFAULT_LENGTH = 20;
export const CMF_MAX_LENGTH = 1000;
export const CHOP_DEFAULT_LENGTH = 14;
export const CHOP_MAX_LENGTH = 1000;

/**
 * OBV's average with defaults applied (missing / '' = sma 20), or null when a
 * setting is present but unusable — the package then builds no indicator,
 * and the chart draws nothing rather than a default nobody chose.
 */
export function resolveObvSettings(
  maType?: string | null,
  maLength?: number | string | null
): { maType: string; maLength: number } | null {
  const type =
    maType === undefined || maType === null || maType === ''
      ? OBV_DEFAULT_MA_TYPE
      : String(maType).toLowerCase();
  if (!(OBV_MA_TYPES as readonly string[]).includes(type)) {
    return null;
  }
  const length =
    maLength === undefined || maLength === null || maLength === ''
      ? OBV_DEFAULT_MA_LENGTH
      : +maLength;
  if (!Number.isInteger(length) || length < 1 || length > OBV_MAX_MA_LENGTH) {
    return null;
  }
  return { maType: type, maLength: length };
}

const resolveLength = (
  length: number | string | null | undefined,
  fallback: number,
  min: number,
  max: number
): number | null => {
  const n =
    length === undefined || length === null || length === ''
      ? fallback
      : +length;
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/** CMF length with the default applied, null when unusable (1…1000). */
export const resolveCmfLength = (length?: number | string | null) =>
  resolveLength(length, CMF_DEFAULT_LENGTH, 1, CMF_MAX_LENGTH);

/** Choppiness length with the default applied, null when unusable (2…1000). */
export const resolveChopLength = (length?: number | string | null) =>
  resolveLength(length, CHOP_DEFAULT_LENGTH, 2, CHOP_MAX_LENGTH);

export type OBVValue = { obv: number; ma: number };

/**
 * The running total of volume signed by the close's direction (0 on the
 * first candle), with its moving average. Null until the average has a
 * value. A non-finite close is skipped; a non-finite volume counts as 0.
 */
export class OBVState {
  private obv = NaN;
  private prevClose = NaN;
  private ma: MovingAverageStream;

  constructor(
    readonly maType: string = OBV_DEFAULT_MA_TYPE,
    readonly maLength: number = OBV_DEFAULT_MA_LENGTH
  ) {
    this.ma = createMovingAverageStream(maType, maLength);
  }

  next(close: number, volume: number): OBVValue | null {
    const c = +close;
    if (isNaN(this.obv)) {
      this.obv = 0;
    }
    if (isFinite(c)) {
      const v = isFinite(+volume) ? +volume : 0;
      if (!isNaN(this.prevClose)) {
        if (c > this.prevClose) {
          this.obv += v;
        } else if (c < this.prevClose) {
          this.obv -= v;
        }
      }
      this.prevClose = c;
    }
    const obv = this.obv;
    const ma = this.ma.next(obv);
    if (ma === null || isNaN(ma)) {
      return null;
    }
    return { obv, ma };
  }

  clone(): OBVState {
    const copy = Object.assign(
      Object.create(Object.getPrototypeOf(this)) as OBVState,
      this
    );
    copy.ma = this.ma.clone();
    return copy;
  }
}

/**
 * Σ money-flow volume / Σ volume over `length` candles, the multiplier
 * ((close − low) − (high − close)) / (high − low) being 0 on a flat candle
 * and the result 0 when the window traded nothing. Null until the window is
 * full.
 */
export class CMFState {
  private mfv: Float64Array;
  private volume: Float64Array;
  private index = 0;
  private filled = false;

  constructor(readonly length: number = CMF_DEFAULT_LENGTH) {
    this.mfv = new Float64Array(length);
    this.volume = new Float64Array(length);
  }

  next(high: number, low: number, close: number, volume: number): number | null {
    const range = high - low;
    const multiplier =
      range === 0 ? 0 : (close - low - (high - close)) / range;
    this.mfv[this.index] = multiplier * volume;
    this.volume[this.index] = volume;
    this.index = (this.index + 1) % this.length;
    if (!this.filled && this.index === 0) {
      this.filled = true;
    }
    if (!this.filled) {
      return null;
    }
    let sumMfv = 0;
    let sumVolume = 0;
    for (let i = 0; i < this.length; i++) {
      sumMfv += this.mfv[i];
      sumVolume += this.volume[i];
    }
    return sumVolume === 0 ? 0 : sumMfv / sumVolume;
  }

  clone(): CMFState {
    const copy = Object.assign(
      Object.create(Object.getPrototypeOf(this)) as CMFState,
      this
    );
    copy.mfv = this.mfv.slice();
    copy.volume = this.volume.slice();
    return copy;
  }
}

/**
 * 100 × log10(Σ true range / (highest high − lowest low)) / log10(length)
 * over `length` candles; 100 when that range is 0. Every true range needs a
 * previous close, so the first value comes on candle length + 1.
 */
export class CHOPState {
  private tr: Float64Array;
  private highs: Float64Array;
  private lows: Float64Array;
  private index = 0;
  private filled = false;
  private prevClose = NaN;
  private readonly logN: number;

  constructor(readonly length: number = CHOP_DEFAULT_LENGTH) {
    this.tr = new Float64Array(length);
    this.highs = new Float64Array(length);
    this.lows = new Float64Array(length);
    this.logN = Math.log10(length);
  }

  next(high: number, low: number, close: number): number | null {
    const prevClose = this.prevClose;
    this.prevClose = close;
    if (isNaN(prevClose)) {
      return null;
    }
    this.tr[this.index] = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    this.highs[this.index] = high;
    this.lows[this.index] = low;
    this.index = (this.index + 1) % this.length;
    if (!this.filled && this.index === 0) {
      this.filled = true;
    }
    if (!this.filled) {
      return null;
    }
    let sumTr = 0;
    let highest = -Infinity;
    let lowest = Infinity;
    for (let i = 0; i < this.length; i++) {
      sumTr += this.tr[i];
      if (this.highs[i] > highest) highest = this.highs[i];
      if (this.lows[i] < lowest) lowest = this.lows[i];
    }
    const range = highest - lowest;
    if (range === 0) {
      return 100;
    }
    return (100 * Math.log10(sumTr / range)) / this.logN;
  }

  clone(): CHOPState {
    const copy = Object.assign(
      Object.create(Object.getPrototypeOf(this)) as CHOPState,
      this
    );
    copy.tr = this.tr.slice();
    copy.highs = this.highs.slice();
    copy.lows = this.lows.slice();
    return copy;
  }
}
