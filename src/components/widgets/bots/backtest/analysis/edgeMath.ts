import type { PreparedDeal } from '@/types';

/** z for a two-sided 95% interval (spec 135 §2.2, §2.4). */
const Z95 = 1.96;

export interface ReturnStats {
  n: number;
  mean: number;
  sd: number;
  /** Half-width of the 95% interval of the mean: z·sd/√n. */
  ci: number;
}

export type EdgeVerdict = 'beats' | 'worse' | 'same';

export interface EdgePoint {
  x: number;
  y: number;
}

export interface EdgeComparison {
  strategy: ReturnStats;
  random: ReturnStats;
  /** Welch's t of strategy − random; NaN when undefined (§2.4). */
  t: number;
  verdict: EdgeVerdict | null;
  strategyPoints: EdgePoint[];
  randomPoints: EdgePoint[];
}

/** Profit % of the closed deals, in deal order (§2.1). */
export const closedReturns = (deals: PreparedDeal[]) =>
  deals.filter((d) => d.status === 'closed').map((d) => d.profit.perc);

export function returnStats(values: number[]): ReturnStats {
  const n = values.length;
  if (!n) return { n, mean: NaN, sd: NaN, ci: NaN };
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const sd =
    n < 2
      ? NaN
      : Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
  return { n, mean, sd, ci: n < 2 ? NaN : (Z95 * sd) / Math.sqrt(n) };
}

/** Welch's two-sample t, signed so positive means `a` above `b` (§2.3). */
export function welchT(a: ReturnStats, b: ReturnStats) {
  if (a.n < 2 || b.n < 2) return NaN;
  const se = Math.sqrt(a.sd ** 2 / a.n + b.sd ** 2 / b.n);
  return se > 0 ? (a.mean - b.mean) / se : NaN;
}

export const verdictOf = (t: number): EdgeVerdict | null =>
  !Number.isFinite(t)
    ? null
    : t >= Z95
      ? 'beats'
      : t <= -Z95
        ? 'worse'
        : 'same';

/** Both sides' stats, the t-value and the v1 scatter layout (§2.5). */
export function compareToRandom(
  strategyDeals: PreparedDeal[],
  randomDeals: PreparedDeal[]
): EdgeComparison {
  const s = closedReturns(strategyDeals);
  const r = closedReturns(randomDeals);
  const strategy = returnStats(s);
  const random = returnStats(r);
  const t = welchT(strategy, random);
  return {
    strategy,
    random,
    t,
    verdict: verdictOf(t),
    strategyPoints: s.map((y, i) => ({ x: i + 1, y })),
    randomPoints: r.map((y, i) => ({ x: s.length + i + 1, y })),
  };
}
