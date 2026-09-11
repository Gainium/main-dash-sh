export type OrderTimestamps = {
  time?: number | string | null;
  transactTime?: number | string | null;
  updateTime?: number | string | null;
  executedQty?: number | string | null;
  origQty?: number | string | null;
};

/**
 * When an order EXECUTED — the timestamp its chart marker belongs on.
 *
 * `time || transactTime` is when the order was PLACED. For a market order that
 * is the fill, but a resting limit (take profit, DCA or grid level) can fill
 * hours or days later; plotting it at placement puts the fill on a candle that
 * never traded at its price.
 *
 * `updateTime` is stamped from the venue's fill event, so for an order that
 * filled its whole size it is the fill. For a partial fill it is not: the
 * unfilled remainder is cancelled later (typically when the deal closes) and
 * that cancel rewrites `updateTime`, so a partial keeps the placement time.
 */
export const getOrderExecutionTime = (order: OrderTimestamps): number => {
  const placed =
    Number(order.time || order.transactTime || order.updateTime) || 0;
  const updated = Number(order.updateTime) || 0;
  const executed = parseFloat(String(order.executedQty ?? '0'));
  const size = parseFloat(String(order.origQty ?? '0'));
  // Tolerance for exchange-side rounding of the executed size.
  const fullyFilled = size > 0 && executed > 0 && executed >= size * 0.999;
  return fullyFilled && updated >= placed ? updated : placed;
};
