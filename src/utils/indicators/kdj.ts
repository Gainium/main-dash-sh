/**
 * KDJ for the chart study. A line-for-line copy of `KDJ` in
 * @gainium/indicators (what the bot engine and backtester run), which the
 * dashboard does not depend on directly — keep the two in step;
 * `core/tests/kdj.vitest.test.ts` checks they agree bar by bar.
 *
 * RSV = 100 × (close − lowest low) / (highest high − lowest low) over `n`
 * candles; K = (RSV + (kSmooth − 1) × K[1]) / kSmooth; D likewise from K;
 * J = 3K − 2D. K and D start at 50 and nothing is reported until that seed
 * has faded below 1e-6; a flat range keeps the previous RSV.
 */

export type KDJValue = { k: number; d: number; j: number };

/** K and D start here before the first update. */
export const KDJ_SEED = 50;

/** Largest seed error the warm-up allows in K, D and J. */
const SEED_TOLERANCE = 1e-6;

/** K/D updates after which the seed's weight is below 1e-6. */
export function kdjSettleBars(kSmooth: number, dSmooth: number): number {
  const rk = (kSmooth - 1) / kSmooth;
  const rd = (dSmooth - 1) / dSmooth;
  let eK = 100;
  let eD = 100;
  let t = 1;
  for (; t < 1_000_000; t++) {
    eK = rk * eK;
    eD = rd * eD + eK / dSmooth;
    if (3 * eK + 2 * eD < SEED_TOLERANCE) {
      break;
    }
  }
  return t;
}

export class KDJState {
  readonly n: number;
  readonly kSmooth: number;
  readonly dSmooth: number;
  /** K/D updates needed before the first value */
  readonly settle: number;
  private highs: number[] = [];
  private lows: number[] = [];
  private rsv = NaN;
  private k = KDJ_SEED;
  private d = KDJ_SEED;
  private updates = 0;

  constructor(n: number = 9, kSmooth: number = 3, dSmooth: number = 3) {
    this.n = Math.max(1, Math.floor(+n || 9));
    this.kSmooth = Math.max(1, Math.floor(+kSmooth || 3));
    this.dSmooth = Math.max(1, Math.floor(+dSmooth || 3));
    this.settle = kdjSettleBars(this.kSmooth, this.dSmooth);
  }

  /** Candles needed before the first value. */
  get warmup(): number {
    return this.n - 1 + this.settle;
  }

  next(high: number, low: number, close: number): KDJValue | null {
    this.highs.push(high);
    this.lows.push(low);
    if (this.highs.length > this.n) {
      this.highs.shift();
      this.lows.shift();
    }
    if (this.lows.length < this.n) {
      return null;
    }
    let highest = -Infinity;
    let lowest = Infinity;
    for (let i = 0; i < this.n; i++) {
      if (this.highs[i] > highest) highest = this.highs[i];
      if (this.lows[i] < lowest) lowest = this.lows[i];
    }
    const range = highest - lowest;
    if (range > 0) {
      this.rsv = (100 * (close - lowest)) / range;
    } else if (isNaN(this.rsv)) {
      this.rsv = KDJ_SEED;
    }
    const ks = this.kSmooth;
    const ds = this.dSmooth;
    this.k = (this.rsv + (ks - 1) * this.k) / ks;
    this.d = (this.k + (ds - 1) * this.d) / ds;
    this.updates += 1;
    if (this.updates < this.settle) {
      return null;
    }
    return { k: this.k, d: this.d, j: 3 * this.k - 2 * this.d };
  }

  /** A copy to preview an open candle without touching this state. */
  clone(): KDJState {
    const copy = Object.assign(
      Object.create(Object.getPrototypeOf(this)) as KDJState,
      this
    );
    copy.highs = [...this.highs];
    copy.lows = [...this.lows];
    return copy;
  }
}
