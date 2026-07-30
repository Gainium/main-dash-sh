import { test, expect } from '@playwright/test';

import { projectIndicatorDcaThresholds } from '@/utils/bots/dca/indicator-dca-thresholds';

/**
 * The projected "next DCA" line for an indicator-condition bot must use the
 * same reference the bot itself uses: main-app `dcaHelper.addDcaOrderBySignal`
 * gates each level on
 *
 *   (deal.lastPrice - price) / deal.lastPrice >= minPercFromLast / 100   (long)
 *
 * so the threshold is anchored on the deal's last fill, NOT on `initialPrice`
 * chained through the projected ladder. These lock that contract.
 */
test.describe('projectIndicatorDcaThresholds', () => {
  // Rossano's "Orca - LONG v2" (bot 69aac1fa97cbd9ee7852442e): 5 startDca
  // indicators at 0.65 / 0.79 / 0.97 / 1.17 / 1.43 %.
  const orca = [0.0065, 0.0079, 0.0097, 0.0117, 0.0143];

  test('anchors the next level on the deal last fill, not the initial price', () => {
    // Base order only: next DCA is indicator[0], 0.65% below the last fill.
    const prices = projectIndicatorDcaThresholds({
      lastPrice: 100_000,
      levelsComplete: 1,
      minPercFromLast: orca,
      isLong: true,
      precision: 2,
    });
    expect(prices[0]).toBeCloseTo(99_350, 2);
    // Subsequent levels chain off that best-case threshold.
    expect(prices[1]).toBeCloseTo(99_350 * (1 - 0.0079), 2);
    expect(prices).toHaveLength(5);
  });

  test('drops levels the deal has already consumed', () => {
    // Two levels filled (base + DCA 1) → next DCA is indicator[1].
    const prices = projectIndicatorDcaThresholds({
      lastPrice: 98_000,
      levelsComplete: 2,
      minPercFromLast: orca,
      isLong: true,
      precision: 2,
    });
    expect(prices[0]).toBeNull();
    expect(prices[1]).toBeCloseTo(98_000 * (1 - 0.0079), 2);
    // ...and the chain continues from there, not from the ladder's own guess.
    expect(prices[2]).toBeCloseTo(98_000 * (1 - 0.0079) * (1 - 0.0097), 2);
  });

  test('re-anchoring beats the ladder once a level fills below its threshold', () => {
    // Deal opened at 100k. DCA 1's threshold was 99_350, but the indicator did
    // not fire until 97_000, so that is where it actually filled.
    const ladderGuess = 100_000 * (1 - 0.0065) * (1 - 0.0079); // 98_565.x
    const reanchored = projectIndicatorDcaThresholds({
      lastPrice: 97_000,
      levelsComplete: 2,
      minPercFromLast: orca,
      isLong: true,
      precision: 2,
    })[1] as number;
    expect(reanchored).toBeCloseTo(97_000 * (1 - 0.0079), 2);
    // The old chained-from-initialPrice figure sat ~1.7% too high — it drew the
    // next DCA nearer than the bot could ever take it.
    expect(reanchored).toBeLessThan(ladderGuess);
  });

  test('short deals step up', () => {
    const prices = projectIndicatorDcaThresholds({
      lastPrice: 100,
      levelsComplete: 1,
      minPercFromLast: [0.02, 0.03],
      isLong: false,
      precision: 4,
    });
    expect(prices[0]).toBeCloseTo(102, 4);
    expect(prices[1]).toBeCloseTo(102 * 1.03, 4);
  });

  test('levels without a usable minimum % are skipped', () => {
    const prices = projectIndicatorDcaThresholds({
      lastPrice: 100,
      levelsComplete: 1,
      minPercFromLast: [0.01, 0, 0.02],
      isLong: true,
      precision: 4,
    });
    expect(prices[0]).toBeCloseTo(99, 4);
    expect(prices[1]).toBeNull();
    // The chain carries on from the last priced level.
    expect(prices[2]).toBeCloseTo(99 * (1 - 0.02), 4);
  });

  test('an unknown last price yields no projection at all', () => {
    expect(
      projectIndicatorDcaThresholds({
        lastPrice: 0,
        levelsComplete: 1,
        minPercFromLast: orca,
        isLong: true,
        precision: 2,
      })
    ).toEqual([null, null, null, null, null]);
  });
});
