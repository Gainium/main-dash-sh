import { describe, expect, test } from 'vitest';

import {
  closedReturns,
  compareToRandom,
  returnStats,
  verdictOf,
  welchT,
} from '@/components/widgets/bots/backtest/analysis/edgeMath';
import type { PreparedDeal } from '@/types';

/**
 * Backtest Analysis tab — Strategy vs Random (spec 135 §2): closed-deal
 * returns of the strategy vs a random-entry rerun, avg ± 95% CI and Welch's t.
 */

const deal = (perc: number, status: 'open' | 'closed' = 'closed') =>
  ({ status, profit: { perc } }) as unknown as PreparedDeal;

describe('Strategy vs Random math (spec 135)', () => {
  test('§2.1 only closed deals count', () => {
    expect(closedReturns([deal(1), deal(5, 'open'), deal(-2)])).toEqual([
      1, -2,
    ]);
  });

  test('§2.2 mean ± 1.96·sd/√n with the sample sd', () => {
    const s = returnStats([1, 2, 3, 4]);
    expect(s.mean).toBe(2.5);
    expect(s.sd).toBeCloseTo(Math.sqrt(5 / 3), 12);
    expect(s.ci).toBeCloseTo((1.96 * Math.sqrt(5 / 3)) / 2, 12);
  });

  test('§2.2 the interval does not collapse at a zero mean (v1 bug)', () => {
    const s = returnStats([-1, 1, -1, 1]);
    expect(s.mean).toBe(0);
    expect(s.ci).toBeGreaterThan(0);
  });

  test('§2.3 Welch t is signed and matches the hand value', () => {
    const a = returnStats([2, 4, 6]); // mean 4, var 4
    const b = returnStats([0, 1, 2, 3]); // mean 1.5, var 5/3
    const expected = 2.5 / Math.sqrt(4 / 3 + 5 / 12);
    expect(welchT(a, b)).toBeCloseTo(expected, 12);
    expect(welchT(b, a)).toBeCloseTo(-expected, 12);
  });

  test('§2.4 verdict thresholds', () => {
    expect(verdictOf(1.96)).toBe('beats');
    expect(verdictOf(-2)).toBe('worse');
    expect(verdictOf(1.5)).toBe('same');
    expect(verdictOf(NaN)).toBeNull();
  });

  test('§2.4 no t-value below 2 deals a side or with zero spread', () => {
    expect(compareToRandom([deal(1)], [deal(0), deal(2)]).verdict).toBeNull();
    const flat = compareToRandom([deal(1), deal(1)], [deal(0), deal(0)]);
    expect(flat.t).toBeNaN();
    expect(flat.verdict).toBeNull();
  });

  test('§2.5 scatter: strategy at 1..nS, random after it', () => {
    const c = compareToRandom(
      [deal(1), deal(9, 'open'), deal(2)],
      [deal(-1), deal(0), deal(3)]
    );
    expect(c.strategyPoints).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]);
    expect(c.randomPoints.map((p) => p.x)).toEqual([3, 4, 5]);
  });
});
