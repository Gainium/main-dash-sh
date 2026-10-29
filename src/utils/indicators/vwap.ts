/**
 * Anchored VWAP for the chart study. A line-for-line copy of `VWAP` in
 * @gainium/indicators (what the bot engine and backtester run), which the
 * dashboard does not depend on directly — keep the two in step;
 * `core/tests/vwap.vitest.test.ts` checks they agree bar by bar.
 *
 * The volume-weighted average of hlc3 since the anchor (UTC day, Monday week
 * or month), with bands at ± multiplier × the volume-weighted standard
 * deviation. The first period is skipped unless its first candle opens on
 * the period start; a candle without a time is not accumulated; a period
 * with no volume has no value (NaN).
 */

export type VWAPAnchor = 'day' | 'week' | 'month';

export type VWAPValue = {
  vwap: number;
  stdev: number;
  upper: number;
  lower: number;
  price: number;
  periodStart: number;
};

const DAY = 86_400_000;
const WEEK = 7 * DAY;
/** 1970-01-05 00:00 UTC, the first Monday of the epoch */
const FIRST_MONDAY = 4 * DAY;

/** Normalises a stored anchor (any case, trimmed); anything unknown = day. */
export function resolveVWAPAnchor(anchor?: string | null): VWAPAnchor {
  const a = typeof anchor === 'string' ? anchor.trim().toLowerCase() : '';
  return a === 'week' ? 'week' : a === 'month' ? 'month' : 'day';
}

/** Start (ms, UTC) of the anchor period that contains `time`. */
export function vwapPeriodStart(time: number, anchor: string): number {
  switch (resolveVWAPAnchor(anchor)) {
    case 'week':
      return FIRST_MONDAY + Math.floor((time - FIRST_MONDAY) / WEEK) * WEEK;
    case 'month': {
      const d = new Date(time);
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    }
    default:
      return Math.floor(time / DAY) * DAY;
  }
}

export class VWAPState {
  readonly anchor: VWAPAnchor;
  readonly bandMultiplier: number;
  // start of the period being accumulated (NaN = none)
  private periodStart = NaN;
  // 1 when that period was seen from its start
  private full = 0;
  // 1 once any timed candle was fed
  private seen = 0;
  private sumV = 0;
  private sumVS = 0;
  // running weighted mean of hlc3 and Σ v·(hlc3 − mean)², West's update
  private mean = 0;
  private m2 = 0;

  constructor(anchor: string = 'day', bandMultiplier: number = 1) {
    this.anchor = resolveVWAPAnchor(anchor);
    const m = +bandMultiplier;
    this.bandMultiplier = Number.isFinite(m) ? m : 1;
  }

  private reset() {
    this.sumV = 0;
    this.sumVS = 0;
    this.mean = 0;
    this.m2 = 0;
  }

  next(
    time: number | null | undefined,
    high: number,
    low: number,
    close: number,
    volume: number
  ): VWAPValue | null {
    if (typeof time === 'number' && Number.isFinite(time)) {
      const start = vwapPeriodStart(time, this.anchor);
      if (start !== this.periodStart) {
        this.full = this.seen === 1 || time === start ? 1 : 0;
        this.periodStart = start;
        this.reset();
      }
      this.seen = 1;
      const v = volume > 0 ? +volume : 0;
      if (v > 0) {
        const src = (high + low + close) / 3;
        const w = this.sumV;
        const total = w + v;
        const delta = src - this.mean;
        const r = (delta * v) / total;
        this.mean += r;
        this.m2 += w * delta * r;
        this.sumV = total;
        this.sumVS += v * src;
      }
    }
    if (this.full !== 1 || isNaN(this.periodStart)) {
      return null;
    }
    const sumV = this.sumV;
    const vwap = sumV > 0 ? this.sumVS / sumV : NaN;
    const stdev = sumV > 0 ? Math.sqrt(Math.max(0, this.m2 / sumV)) : NaN;
    const band = this.bandMultiplier * stdev;
    return {
      vwap,
      stdev,
      upper: vwap + band,
      lower: vwap - band,
      price: close,
      periodStart: this.periodStart,
    };
  }

  /** A copy to preview an open candle without touching this state. */
  clone(): VWAPState {
    return Object.assign(
      Object.create(Object.getPrototypeOf(this)) as VWAPState,
      this
    );
  }
}
