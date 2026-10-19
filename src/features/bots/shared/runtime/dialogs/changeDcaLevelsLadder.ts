import type { LadderLevel } from './executeNextDcaEligibility';

/** One DCA level that raising the deal's max would add. */
export interface AddedDcaLevel {
  /** 1-based DCA level number (the base order is not counted). */
  level: number;
  price: number;
  qty: number;
  /**
   * Price is already past this level: the engine places it as a limit at its
   * ladder price, which crosses the book and fills straight away, at about the
   * market price.
   */
  crossed: boolean;
}

/**
 * The levels between the current max and the new one, from the deal's full
 * ladder (level order). The engine rebuilds the ladder from the deal's opening
 * price on save, so these are the prices it will place.
 */
export function addedDcaLevels(
  ladder: ReadonlyArray<Pick<LadderLevel, 'price' | 'qty'>>,
  currentMax: number,
  newMax: number,
  isLong: boolean,
  market: number | undefined
): AddedDcaLevel[] {
  if (newMax <= currentMax) {
    return [];
  }
  return ladder.slice(currentMax, newMax).map((l, i) => ({
    level: currentMax + i + 1,
    price: l.price,
    qty: l.qty,
    crossed:
      typeof market === 'number' &&
      market > 0 &&
      (isLong ? market < l.price : market > l.price),
  }));
}
