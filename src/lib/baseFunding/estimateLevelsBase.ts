// Base a run of safety-order levels sells — the add-DCA funding estimate
// (main-app spec 044 §7.5). The engine sizes the real levels from its own
// ladder when it acts; this reads only the order size and volume scale, so the
// dialog can say roughly what will be bought before the change is saved.
//
// A quote-sized level is priced at the current price, where a short's levels
// sit above it: the estimate errs on the high side.

export interface LevelsBaseInput {
  /** First level to count, 1-based. */
  fromLevel: number;
  /** Last level to count, inclusive. */
  toLevel: number;
  orderSize: number;
  /** `base` | `quote` — anything else (usd, percentages) is not estimated. */
  orderSizeType: string;
  volumeScale: number;
  price: number;
}

/** Σ base of levels `fromLevel..toLevel`, or null when it cannot be estimated. */
export function estimateLevelsBase(input: LevelsBaseInput): number | null {
  const { fromLevel, toLevel, orderSize, orderSizeType, price } = input;
  const scale =
    Number.isFinite(input.volumeScale) && input.volumeScale > 0
      ? input.volumeScale
      : 1;
  if (
    !(orderSize > 0) ||
    !Number.isFinite(orderSize) ||
    (orderSizeType !== 'base' && orderSizeType !== 'quote') ||
    (orderSizeType === 'quote' && !(price > 0))
  ) {
    return null;
  }
  let total = 0;
  for (let level = Math.max(1, fromLevel); level <= toLevel; level += 1) {
    const size = orderSize * scale ** (level - 1);
    total += orderSizeType === 'base' ? size : size / price;
  }
  return total;
}
