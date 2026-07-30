/**
 * Pricing for the projected levels of an indicator-driven DCA ladder.
 *
 * Kept dependency-free (no stores, no `import.meta.env`) so it stays unit
 * testable — see `tests/indicatorDcaThresholds.unit.test.ts`.
 */

/**
 * Prices the still-reachable levels of an indicator-driven DCA ladder.
 *
 * For `dcaCondition: 'indicators'` the bot holds nothing on the exchange. On
 * each startDca signal it checks
 * `|price - deal.lastPrice| / deal.lastPrice >= minPercFromLast` for that
 * level's indicator and, if cleared, sends a MARKET order (main-app
 * `dcaHelper.addDcaOrderBySignal`). So the threshold for the next level is
 * measured from the deal's last fill — not from `initialPrice` chained through
 * the projected ladder, which is what the shared example-orders ladder produces
 * and which drifts as soon as a level fills below its projection.
 *
 * Returns one price per level index, best case (i.e. assuming each level fills
 * exactly on its threshold), with `null` for levels the deal has already
 * consumed or that have no usable indicator minimum behind them.
 *
 * @param lastPrice       `deal.lastPrice` — deepest fill so far.
 * @param levelsComplete  `deal.levels.complete` — filled levels incl. the base order.
 * @param minPercFromLast Per-level minimum move, as a fraction (0.025 = 2.5%).
 * @param isLong          Long deals step down, short deals step up.
 * @param precision       Price precision of the pair.
 */
export function projectIndicatorDcaThresholds({
  lastPrice,
  levelsComplete,
  minPercFromLast,
  isLong,
  precision,
}: {
  lastPrice: number;
  levelsComplete: number;
  minPercFromLast: number[];
  isLong: boolean;
  precision: number;
}): (number | null)[] {
  if (!(lastPrice > 0)) return minPercFromLast.map(() => null);
  // `levels.complete` counts the base order, so the next DCA uses the
  // indicator at index `complete - 1`.
  const nextLevelIdx = Math.max(0, levelsComplete - 1);
  let anchor = lastPrice;
  return minPercFromLast.map((perc, level) => {
    if (level < nextLevelIdx || !perc || perc <= 0) return null;
    anchor = Number(
      (anchor * (isLong ? 1 - perc : 1 + perc)).toFixed(precision)
    );
    return anchor;
  });
}
