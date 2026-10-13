/**
 * Where the projected (not-yet-placed) smart-order levels start.
 *
 * With smart orders on, the bot keeps only the nearest levels on the exchange;
 * the rest are drawn as projections past the furthest resting DCA order — below
 * the lowest for a long deal, above the highest for a short one.
 *
 * An add-funds order is a `dealRegular` row too, but it is not a ladder level
 * and the bot does not count it as one. A resting limit addition priced past
 * the placed safety orders used to become the bound, hiding every projected
 * level between the two although the bot still places them.
 */
export interface BoundOrder {
  typeOrder?: string;
  price: number;
  addFundsId?: string;
}

export const smartOrderProjectionBound = (
  pendingOrders: BoundOrder[],
  isLong: boolean
): number => {
  const prices = pendingOrders
    .filter((o) => o.typeOrder === 'dealRegular' && !o.addFundsId)
    .map((o) => o.price)
    .filter((p) => p > 0);
  if (!prices.length) return isLong ? Infinity : 0;
  return isLong ? Math.min(...prices) : Math.max(...prices);
};
