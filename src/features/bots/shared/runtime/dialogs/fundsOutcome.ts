import type { PercentBasis } from './adjustFundsAmount';

/**
 * What an add / reduce funds request does to a deal, for the confirmation
 * dialog. Mirrors the engine:
 *
 * - DCA: one order of the requested size at `price`. An add folds it into the
 *   average; a reduce sells out of the position at the average cost, so the
 *   average is unchanged and the difference is realized.
 * - Combo: every rung (base order + each DCA level) is scaled by one factor k.
 *   Filled rungs are topped up (or trimmed) at market now — `(k − 1) ×
 *   position` — and pending levels are resized by k. A fixed amount is the
 *   total commitment across both: k − 1 = amount / (position value now +
 *   pending levels).
 */
export type FundsMode = 'add' | 'reduce';

export interface FundsRequest {
  /** Typed amount: a percentage when `perc`, else an amount of `asset`. */
  qty: number;
  asset: 'base' | 'quote';
  perc: boolean;
  /** Price the order fills at: the limit price, else the market. */
  price: number;
}

export interface PendingLevels {
  /** Σ base of the deal's DCA levels still resting. */
  base: number;
  /** Σ quote (qty × price) of the same levels. */
  quote: number;
}

export interface FundsOutcome {
  /** Base bought (add) or sold (reduce) now. */
  orderBase: number;
  orderQuote: number;
  positionBefore: number;
  positionAfter: number;
  avgBefore: number;
  avgAfter: number;
  /** Reduce only: P&L realized by the sale, in quote. */
  realized: number | null;
  /** Combo only: the factor every rung is scaled by. */
  scale: number | null;
  /** Combo only: change in quote held for pending levels. */
  pendingQuoteDelta: number | null;
  /** The reduce takes the whole position, so the engine closes the deal. */
  closesDeal: boolean;
}

const finite = (n: number) => Number.isFinite(n) && n > 0;

export function dcaFundsOutcome(
  mode: FundsMode,
  basis: PercentBasis,
  req: FundsRequest,
  long: boolean
): FundsOutcome | null {
  if (!finite(req.qty) || !finite(req.price)) return null;
  const position = basis.remainingBase;
  const avg = basis.avgPrice;
  const orderBase = req.perc
    ? basis.perHundred * (req.qty / 100)
    : req.asset === 'base'
      ? req.qty
      : req.qty / req.price;
  if (!finite(orderBase)) return null;

  if (mode === 'add') {
    const after = position + orderBase;
    return {
      orderBase,
      orderQuote: orderBase * req.price,
      positionBefore: position,
      positionAfter: after,
      avgBefore: avg,
      avgAfter: (avg * position + req.price * orderBase) / after,
      realized: null,
      scale: null,
      pendingQuoteDelta: null,
      closesDeal: false,
    };
  }
  const closesDeal = position > 0 && orderBase >= position;
  const sold = Math.min(orderBase, position);
  return {
    orderBase: sold,
    orderQuote: sold * req.price,
    positionBefore: position,
    positionAfter: closesDeal ? 0 : position - sold,
    avgBefore: avg,
    avgAfter: avg,
    realized: sold * (req.price - avg) * (long ? 1 : -1),
    scale: null,
    pendingQuoteDelta: null,
    closesDeal,
  };
}

export function comboFundsOutcome(
  mode: FundsMode,
  basis: PercentBasis,
  req: FundsRequest,
  pending: PendingLevels,
  long: boolean
): FundsOutcome | null {
  if (!finite(req.qty) || !finite(req.price)) return null;
  const position = basis.remainingBase;
  const avg = basis.avgPrice;
  const sign = mode === 'add' ? 1 : -1;
  const delta = req.perc
    ? req.qty / 100
    : req.asset === 'base'
      ? req.qty / (position + pending.base)
      : req.qty / (position * req.price + pending.quote);
  if (!Number.isFinite(delta) || delta <= 0) return null;
  const scale = 1 + sign * delta;
  if (scale <= 0) {
    return {
      orderBase: position,
      orderQuote: position * req.price,
      positionBefore: position,
      positionAfter: 0,
      avgBefore: avg,
      avgAfter: avg,
      realized: position * (req.price - avg) * (long ? 1 : -1),
      scale: 0,
      pendingQuoteDelta: -pending.quote,
      closesDeal: true,
    };
  }
  const orderBase = Math.abs(scale - 1) * position;
  const after = position * scale;
  return {
    orderBase,
    orderQuote: orderBase * req.price,
    positionBefore: position,
    positionAfter: after,
    avgBefore: avg,
    avgAfter:
      mode === 'add' ? (avg * position + req.price * orderBase) / after : avg,
    realized:
      mode === 'reduce'
        ? orderBase * (req.price - avg) * (long ? 1 : -1)
        : null,
    scale,
    pendingQuoteDelta: (scale - 1) * pending.quote,
    closesDeal: false,
  };
}
