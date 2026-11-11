/**
 * Random-entry band (spec 150) — the pure parts: which entries a draw uses,
 * when the engine may open them, and the band over the draws' equity.
 * No engine and no DOM here, so the worker and the tests share it.
 */

/** Draws per result (§2.4). */
export const RANDOM_DRAWS = 100;
/** Fewer completed draws than this never draw a band (§3.1). */
export const MIN_BAND_DRAWS = 20;
/** The band refreshes every this many draws (§2.4). */
export const BAND_EVERY = 10;
/** 5th–95th percentile: 90% of the runs (§1.2). */
export const BAND_QUANTILES = [0.05, 0.5, 0.95] as const;

/** One strategy entry: the bar a deal opened on, and its pair. */
export interface Entry {
  symbol: string;
  time: number;
}

/** The band over the draws at the strategy curve's own timestamps. */
export interface RandomBand {
  lo: number[];
  mid: number[];
  hi: number[];
  /** completed draws the band is computed from */
  draws: number;
  /** shifted entries the engine could not open, over all draws */
  missed: number;
  /** shifted entries over all draws */
  entries: number;
}

/** mulberry32 — a small seeded PRNG, so draw d is the same every time (§2.3). */
export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Linear-interpolated quantile of an ascending-sorted array. */
export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Whole bars in the window `[from, to)`. */
export const barsIn = (from: number, to: number, barMs: number) =>
  Math.max(0, Math.floor((to - from) / barMs));

/**
 * Draw d's whole-bar offset (§2.1): 0 for the self-check draw, else uniform
 * over 1…bars−1, so a shift never lands every entry back where it was.
 */
export function offsetBars(draw: number, bars: number): number {
  if (draw < 0 || bars < 2) return 0;
  return 1 + Math.floor(seededRandom(draw + 1)() * (bars - 1));
}

/**
 * Every entry moved by the same whole-bar offset, wrapping round the window
 * (§2.1): spacing and clustering kept, only the timing random.
 */
export function shiftEntries(
  entries: Entry[],
  offset: number,
  from: number,
  to: number,
  barMs: number
): Entry[] {
  const bars = barsIn(from, to, barMs);
  if (!bars) return [];
  return entries
    .map((e) => {
      const bar = Math.floor((e.time - from) / barMs);
      const at = (((bar + offset) % bars) + bars) % bars;
      return { symbol: e.symbol, time: from + at * barMs };
    })
    .sort((a, b) => a.time - b.time);
}

/**
 * The engine's `approveNewDeal` for one draw (§2.2): a deal opens only on the
 * first bar at or after a pending shifted entry of its pair, within one bar.
 * An entry the engine never offers in that bar is missed.
 */
export function entryGate(targets: Entry[], barMs: number) {
  const queue = new Map<string, number[]>();
  for (const t of targets) {
    const q = queue.get(t.symbol) ?? [];
    q.push(t.time);
    queue.set(t.symbol, q);
  }
  const head = new Map<string, number>();
  let missed = 0;
  let taken = 0;
  /** drops the pair's entries whose bar passed before `time` */
  const expire = (symbol: string, time: number) => {
    const q = queue.get(symbol);
    if (!q) return;
    let i = head.get(symbol) ?? 0;
    while (i < q.length && q[i] + barMs <= time) {
      missed++;
      i++;
    }
    head.set(symbol, i);
  };
  return {
    approve(symbol: string, time: number): boolean {
      expire(symbol, time);
      const q = queue.get(symbol);
      const i = head.get(symbol) ?? 0;
      if (!q || i >= q.length || q[i] > time) return false;
      head.set(symbol, i + 1);
      taken++;
      return true;
    },
    /** after the run: entries still pending never got their bar */
    finish() {
      for (const [symbol, q] of queue) {
        const i = head.get(symbol) ?? 0;
        missed += q.length - i;
        head.set(symbol, q.length);
      }
      return { taken, missed };
    },
  };
}

/**
 * A run's equity at each of the strategy's timestamps, holding the last
 * value (both series come from the same bars, so this only fills gaps).
 */
export function sampleAt(
  series: { x: number; y: number }[],
  times: number[]
): number[] {
  const out: number[] = [];
  let j = 0;
  let last = series[0]?.y ?? NaN;
  for (const t of times) {
    while (j < series.length && series[j].x <= t) {
      last = series[j].y;
      j++;
    }
    out.push(last);
  }
  return out;
}

/**
 * The band over the draws' sampled equity (§1.2), or null below
 * MIN_BAND_DRAWS (§3.1).
 */
export function bandOf(
  runs: number[][],
  missed: number,
  entries: number
): RandomBand | null {
  if (runs.length < MIN_BAND_DRAWS) return null;
  const n = runs[0]?.length ?? 0;
  const lo: number[] = [];
  const mid: number[] = [];
  const hi: number[] = [];
  const col = new Array<number>(runs.length);
  for (let i = 0; i < n; i++) {
    for (let d = 0; d < runs.length; d++) col[d] = runs[d][i];
    const sorted = col.filter(Number.isFinite).sort((a, b) => a - b);
    lo.push(quantile(sorted, BAND_QUANTILES[0]));
    mid.push(quantile(sorted, BAND_QUANTILES[1]));
    hi.push(quantile(sorted, BAND_QUANTILES[2]));
  }
  return { lo, mid, hi, draws: runs.length, missed, entries };
}
