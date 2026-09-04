import { test, expect } from '@playwright/test';

import type { MultiTP } from '@/types';
import {
  MULTI_TARGET_MIN_GAP_PERCENT,
  resolveMultiTargetPercentageFloor,
} from '@/utils/bots/dca/take-profit-behaviours';

/**
 * Bug #617 — "Take profit Market orders not filling".
 *
 * Real state of the reporter's FLR/USD deal 6a95a87529611c273a7bca67, read from
 * production via getBotDeals on 2026-09-04. Two of the three multi-TP targets
 * have already executed (`tpSlTargetFilled`), yet all three are still ordinary
 * rows in `settings.multiTp` — and `single-target`, long since taken, now reads
 * as a NEGATIVE take-profit because the deal's breakeven moved up under it
 * (avgPrice 0.0070348483, its stored `fixed` 0.00692299).
 *
 * Filled targets stay in `multiTp` on purpose: main-app `dcaHelper.getTPOrder`
 * sizes each surviving target as `amount / (100 - <summed filled amounts>)`, so
 * dropping them would silently shrink every remaining take-profit. They are
 * history, though, and must not constrain the targets that are still live.
 */
const FLR_DEAL_TARGETS: MultiTP[] = [
  { uuid: 'single-target', target: '-1.590', amount: '34', fixed: '0.00692299' },
  { uuid: 'tp-target-1', target: '0.144', amount: '33', fixed: '0.00704500' },
  { uuid: 'tp-target-2', target: '4', amount: '33', fixed: '0.00731624' },
];

const FILLED = new Set(['single-target', 'tp-target-1']);

test.describe('multi-TP percentage floor ignores already-filled targets', () => {
  test('a spent target does not set the floor for the next live target', () => {
    // tp-target-2 is the only live target left. Its neighbour in the array is
    // tp-target-1, which has already filled at 0.144% — so before the fix the
    // user could not move tp-target-2 below 0.644%, well above the market.
    const floor = resolveMultiTargetPercentageFloor(
      FLR_DEAL_TARGETS,
      2,
      FILLED
    );

    expect(floor).toBeNull();
  });

  test('without the filled set, the spent neighbour still clamps (the old behaviour)', () => {
    const floor = resolveMultiTargetPercentageFloor(FLR_DEAL_TARGETS, 2);

    // 0.144 + 0.5 — the stale number the reporter was silently clamped to.
    expect(floor).toBeCloseTo(0.144 + MULTI_TARGET_MIN_GAP_PERCENT, 10);
  });

  test('a filled FIRST target does not floor the second one at a negative %', () => {
    // The mirror case: `single-target` sits at -1.590% after the breakeven
    // moved, which would drag the floor for tp-target-1 below zero.
    expect(resolveMultiTargetPercentageFloor(FLR_DEAL_TARGETS, 1, FILLED)).toBe(
      null
    );
    expect(resolveMultiTargetPercentageFloor(FLR_DEAL_TARGETS, 1)).toBeCloseTo(
      -1.09,
      10
    );
  });

  test('two live targets still keep the gap between them', () => {
    const liveOnly: MultiTP[] = [
      { uuid: 'tp-target-1', target: '1', amount: '50' },
      { uuid: 'tp-target-2', target: '2', amount: '50' },
    ];

    expect(
      resolveMultiTargetPercentageFloor(liveOnly, 1, new Set())
    ).toBeCloseTo(1.5, 10);
  });

  test('the first row and empty input are unconstrained', () => {
    expect(resolveMultiTargetPercentageFloor(FLR_DEAL_TARGETS, 0, FILLED)).toBe(
      null
    );
    expect(resolveMultiTargetPercentageFloor([], 1, FILLED)).toBe(null);
    expect(resolveMultiTargetPercentageFloor(undefined, 1, FILLED)).toBe(null);
  });

  test('a non-numeric previous target is not a floor', () => {
    const targets: MultiTP[] = [
      { uuid: 'tp-target-1', target: '', amount: '50' },
      { uuid: 'tp-target-2', target: '2', amount: '50' },
    ];

    expect(resolveMultiTargetPercentageFloor(targets, 1, new Set())).toBe(null);
  });
});
