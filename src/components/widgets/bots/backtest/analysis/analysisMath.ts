/**
 * analysisMath.ts — pure aggregations behind the backtest Analysis tab's
 * Price behaviour and Seasonality cards. Framework-free so they stay cheap to
 * test; the cards only load candles and render what these return.
 */

import type { PreparedDeal, Symbols } from '@/types';
import type { Bar } from '@/utils/tradingView/types';

/** The `max` pairs with the most deals, most-traded first. */
export function topSymbols(deals: PreparedDeal[], max: number): Symbols[] {
  const counts = new Map<string, { symbol: Symbols; n: number }>();
  for (const d of deals) {
    if (!d.symbol?.pair || !d.symbol.exchange) continue;
    const row = counts.get(d.symbol.pair);
    if (row) row.n++;
    else counts.set(d.symbol.pair, { symbol: d.symbol, n: 1 });
  }
  return [...counts.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map((r) => r.symbol);
}

/** Upper bound on control start points — keeps a 1m, multi-year run cheap. */
const MAX_CONTROL_STARTS = 5_000;
/** Random-entry simulations: draws × entries × bars stays near this budget. */
const SIM_BUDGET = 5_000_000;
const MIN_SIMS = 100;
const MAX_SIMS = 500;
/** Fixed seed, so the band doesn't jitter between renders. */
const SIM_SEED = 0x9e3779b9;

/** mulberry32 — a small seeded PRNG; Math.random would redraw on every render. */
function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const pct = (to: number, from: number) => (to / from - 1) * 100;

/** Linear-interpolated quantile of an ascending-sorted array. */
export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;

/** Index of the last bar opening at or before `time`, or -1. */
function barIndexAt(bars: Bar[], time: number): number {
  let lo = 0;
  let hi = bars.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time <= time) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

export interface BehaviorPoint {
  step: number;
  mean: number;
  median: number;
  /** Mean move from every bar of the window — what a random entry averages. */
  control: number;
  /** 5th–95th percentile of the average path of `entries` random entries. */
  randomLo: number;
  randomHi: number;
  randomBand: [number, number];
  /** Share of random draws whose average the deals' mean beats, 0–100. */
  beats: number;
  p10: number;
  p90: number;
  /** Share of entries in profit at this step, 0–100. */
  positive: number;
  entries: number;
  /** Band split at zero so the chart can tint gains and losses separately. */
  upBand: [number, number];
  downBand: [number, number];
}

/**
 * Price move after each deal entry, `horizon` bars out. The base is the deal's
 * own entry price; every later point is a bar close. `sign` flips the move for
 * short bots, so a positive value always means "in the deal's favour".
 */
export function priceBehavior(
  barsBySymbol: Map<string, Bar[]>,
  deals: PreparedDeal[],
  horizon: number,
  sign: 1 | -1
): BehaviorPoint[] {
  const moves: number[][] = Array.from({ length: horizon }, () => []);

  for (const deal of deals) {
    const bars = barsBySymbol.get(deal.symbol?.pair);
    if (!bars?.length || !(deal.startPrice > 0)) continue;
    const i = barIndexAt(bars, deal.startTime);
    if (i < 0 || i + horizon >= bars.length) continue;
    for (let k = 1; k <= horizon; k++) {
      moves[k - 1].push(sign * pct(bars[i + k].close, deal.startPrice));
    }
  }

  // control[k][j]: the k+1-bar move from start j — one index per start, so a
  // random entry follows a single bar's own path through every step
  const control: number[][] = Array.from({ length: horizon }, () => []);
  for (const bars of barsBySymbol.values()) {
    const starts = bars.length - horizon;
    if (starts <= 0) continue;
    const stride = Math.max(1, Math.floor(starts / MAX_CONTROL_STARTS));
    for (let j = 0; j < starts; j += stride) {
      const base = bars[j].close;
      if (!(base > 0)) continue;
      for (let k = 1; k <= horizon; k++) {
        control[k - 1].push(sign * pct(bars[j + k].close, base));
      }
    }
  }

  if (!moves[0].length) return [];

  // Random comparison: as many entries as there are deals, at random bars of
  // the window, drawn `sims` times; each draw's average path is one sample.
  const n = moves[0].length;
  const starts = control[0].length;
  const sims = Math.min(
    MAX_SIMS,
    Math.max(MIN_SIMS, Math.floor(SIM_BUDGET / (n * horizon)))
  );
  const simMeans: number[][] = Array.from({ length: horizon }, () => []);
  if (starts) {
    const rand = seededRandom(SIM_SEED);
    const sums = new Float64Array(horizon);
    for (let s = 0; s < sims; s++) {
      sums.fill(0);
      for (let e = 0; e < n; e++) {
        const j = Math.floor(rand() * starts);
        for (let k = 0; k < horizon; k++) sums[k] += control[k][j];
      }
      for (let k = 0; k < horizon; k++) simMeans[k].push(sums[k] / n);
    }
  }

  return moves.map((xs, idx) => {
    const sorted = xs.slice().sort((a, b) => a - b);
    const p10 = quantile(sorted, 0.1);
    const p90 = quantile(sorted, 0.9);
    const m = mean(xs);
    const sim = simMeans[idx].slice().sort((a, b) => a - b);
    const randomLo = quantile(sim, 0.05);
    const randomHi = quantile(sim, 0.95);
    return {
      step: idx + 1,
      mean: m,
      median: quantile(sorted, 0.5),
      control: mean(control[idx]),
      randomLo,
      randomHi,
      randomBand: [randomLo, randomHi],
      beats: sim.length
        ? (sim.filter((v) => v < m).length / sim.length) * 100
        : NaN,
      p10,
      p90,
      positive: (xs.filter((x) => x > 0).length / xs.length) * 100,
      entries: xs.length,
      upBand: [Math.max(0, p10), Math.max(0, p90)],
      downBand: [Math.min(0, p10), Math.min(0, p90)],
    };
  });
}

export type SeasonalityGranularity = 'weekday' | 'month';

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export interface SeasonBucket {
  label: string;
  /** Share of positive periods (price) or winning deals (deals), 0–100. */
  positive: number;
  mean: number;
  median: number;
  p25: number;
  p75: number;
  count: number;
}

/** Monday-first weekday / calendar month of a timestamp, in UTC. */
const bucketOf = (time: number, g: SeasonalityGranularity) => {
  const d = new Date(time);
  return g === 'weekday' ? (d.getUTCDay() + 6) % 7 : d.getUTCMonth();
};

function toBuckets(
  samples: { time: number; value: number }[],
  g: SeasonalityGranularity
): SeasonBucket[] {
  const labels = g === 'weekday' ? WEEKDAYS : MONTH_NAMES;
  const groups: number[][] = labels.map(() => []);
  for (const s of samples) groups[bucketOf(s.time, g)].push(s.value);
  return labels.map((label, i) => {
    const xs = groups[i];
    const sorted = xs.slice().sort((a, b) => a - b);
    return {
      label,
      positive: xs.length
        ? (xs.filter((x) => x > 0).length / xs.length) * 100
        : NaN,
      mean: mean(xs),
      median: quantile(sorted, 0.5),
      p25: quantile(sorted, 0.25),
      p75: quantile(sorted, 0.75),
      count: xs.length,
    };
  });
}

/**
 * Price seasonality from DAILY bars (UTC days). Weekday: each day's
 * open→close change. Month: each calendar month's first open → last close;
 * the partial months at either edge of the range are dropped.
 */
export function priceSeasonality(
  daily: Bar[],
  g: SeasonalityGranularity
): SeasonBucket[] {
  if (g === 'weekday') {
    return toBuckets(
      daily
        .filter((b) => b.open > 0)
        .map((b) => ({ time: b.time, value: pct(b.close, b.open) })),
      g
    );
  }
  const months: { time: number; open: number; close: number }[] = [];
  let key = '';
  for (const b of daily) {
    const d = new Date(b.time);
    const k = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    if (k !== key) {
      key = k;
      months.push({ time: b.time, open: b.open, close: b.close });
    } else {
      months[months.length - 1].close = b.close;
    }
  }
  // edges are partial unless they start on the 1st / end on the last day
  const whole = months.filter((m, i) => {
    if (i === 0 && new Date(m.time).getUTCDate() !== 1) return false;
    if (i === months.length - 1) {
      const last = daily[daily.length - 1].time;
      const next = new Date(last + 86_400_000);
      if (next.getUTCMonth() === new Date(last).getUTCMonth()) return false;
    }
    return m.open > 0;
  });
  return toBuckets(
    whole.map((m) => ({ time: m.time, value: pct(m.close, m.open) })),
    g
  );
}

/** Deal seasonality: closed deals bucketed by when they OPENED (UTC). */
export function dealSeasonality(
  deals: PreparedDeal[],
  g: SeasonalityGranularity
): SeasonBucket[] {
  return toBuckets(
    deals
      .filter((d) => d.status === 'closed')
      .map((d) => ({ time: d.startTime, value: d.profit.perc })),
    g
  );
}
