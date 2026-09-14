/**
 * A bot `stats.chart` point stamped `-86400000` (1969-12-31) with otherwise
 * normal equity/realizedProfit values was kept by `sanitizeChartPoints` — it is
 * a finite number, and the seconds heuristic even moved it to 1967. Sorted
 * first, it stretched the time axis back ~56 years. Shape taken from real
 * bot data (values rounded).
 */
import { describe, expect, test } from 'vitest';

import { MIN_CHART_POINT_TIME, sanitizeChartPoints } from '@/utils/chartData';

const DAY = 86_400_000;

describe('sanitizeChartPoints — corrupt chart times', () => {
  const real = [
    { time: 1788998400000, equity: 60.32, realizedProfit: 46.09, buyAndHold: 48.79 },
    { time: 1789084800000, equity: 61.21, realizedProfit: 46.09, buyAndHold: 49.64 },
  ];

  test('drops a 1969-12-31 point sitting between real days', () => {
    const junk = { time: -DAY, equity: 60.86, realizedProfit: 46.63, buyAndHold: 48.79 };
    const out = sanitizeChartPoints([real[0], junk, real[1]]);
    expect(out.map((p) => p.time)).toEqual([real[0].time, real[1].time]);
  });

  test('drops time 0 and anything at or before the floor', () => {
    const out = sanitizeChartPoints([
      { time: 0, equity: 1 },
      { time: MIN_CHART_POINT_TIME, equity: 1 },
      real[0],
    ]);
    expect(out.map((p) => p.time)).toEqual([real[0].time]);
  });

  test('still accepts epoch-seconds input for a real date', () => {
    const out = sanitizeChartPoints([{ time: real[0].time / 1000, equity: 1 }]);
    expect(out.map((p) => p.time)).toEqual([real[0].time]);
  });
});
