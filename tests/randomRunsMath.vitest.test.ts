import { describe, expect, it } from 'vitest';

import {
  MIN_BAND_DRAWS,
  bandOf,
  entryGate,
  offsetBars,
  sampleAt,
  shiftEntries,
} from '@/lib/backtester/randomRuns/math';

const H = 3_600_000;

describe('random-entry band math (spec 150)', () => {
  it('shifts every entry by the same whole-bar offset, wrapping round the window', () => {
    const entries = [
      { symbol: 'A', time: 0 },
      { symbol: 'A', time: 2 * H },
      { symbol: 'B', time: 8 * H },
    ];
    expect(shiftEntries(entries, 3, 0, 10 * H, H)).toEqual([
      { symbol: 'B', time: 1 * H },
      { symbol: 'A', time: 3 * H },
      { symbol: 'A', time: 5 * H },
    ]);
    // offset 0 is the strategy's own entries (the self-check, §3.5)
    expect(shiftEntries(entries, 0, 0, 10 * H, H)).toEqual(entries);
  });

  it('draws a reproducible non-zero offset per draw (§2.3)', () => {
    for (let d = 0; d < 50; d++) {
      const o = offsetBars(d, 100);
      expect(o).toBeGreaterThanOrEqual(1);
      expect(o).toBeLessThanOrEqual(99);
      expect(offsetBars(d, 100)).toBe(o);
    }
  });

  it('admits a pair on the first bar at or after its entry, within one bar', () => {
    const gate = entryGate(
      [
        { symbol: 'A', time: 2 * H },
        { symbol: 'A', time: 5 * H },
        { symbol: 'B', time: 2 * H },
      ],
      H
    );
    expect(gate.approve('A', 1 * H)).toBe(false);
    expect(gate.approve('A', 2 * H)).toBe(true);
    expect(gate.approve('A', 3 * H)).toBe(false);
    // B was never offered in its bar: missed, not taken late
    expect(gate.approve('B', 4 * H)).toBe(false);
    expect(gate.approve('A', 5 * H)).toBe(true);
    expect(gate.finish()).toEqual({ taken: 2, missed: 1 });
  });

  it('samples a run at the strategy timestamps, holding the last value', () => {
    expect(
      sampleAt(
        [
          { x: 0, y: 100 },
          { x: 2, y: 110 },
        ],
        [0, 1, 2, 3]
      )
    ).toEqual([100, 100, 110, 110]);
  });

  it('draws no band below the minimum number of runs (§3.1)', () => {
    const runs = Array.from({ length: MIN_BAND_DRAWS - 1 }, () => [100]);
    expect(bandOf(runs, 0, 0)).toBeNull();
    const band = bandOf(
      Array.from({ length: 21 }, (_, i) => [100 + i]),
      0,
      0
    );
    expect(band?.mid).toEqual([110]);
    expect(band?.lo[0]).toBeCloseTo(101);
    expect(band?.hi[0]).toBeCloseTo(119);
  });
});
