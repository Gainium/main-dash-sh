import { math } from '@/utils/math';
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
  /**
   * Every order of the deal still resting — DCA levels and minigrid lines. A
   * reduce scales each of them down, and the engine refuses one that would
   * leave any below the exchange minimum.
   */
  lines?: { qty: number; price: number }[];
}

/** The pair's exchange filters, as the engine reads them. */
export interface PairLimits {
  /** Lot step of the base asset. */
  step: number;
  minBase: number;
  /** Minimum notional, in quote. */
  minQuote: number;
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
  /**
   * The engine refuses the request: `order` — the order itself is below the
   * exchange minimum; `level` — a combo reduce would leave a resting order of
   * the deal below it.
   */
  belowMinimum: 'order' | 'level' | null;
  /** Combo, `level`: the largest reduction, in percent, that would pass. */
  maxReducePerc: number | null;
  /** A percentage below the minimum, which the engine raises to it. */
  raisedToMinimum: boolean;
}

/**
 * Decimals of the pair's lot step, exactly as the engine derives them
 * (main-app `baseAssetPrecision`): 0.001 → 3, 1 → 0, 0.5 → 0.
 */
export function basePrecisionFromStep(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 8;
  let use = `${step}`;
  if (use.indexOf('e-') !== -1) {
    use = Number(step).toFixed(parseFloat(use.split('e-')[1] ?? '8'));
  }
  if (use.indexOf('1') === -1) {
    const dec = use.replace('0.', '');
    const place = dec.indexOf(dec.replace(/0/g, ''));
    if (place <= 1) return place;
    use = `0.${'0'.repeat(place)}1`;
  }
  return use.indexOf('1') === 0 ? 0 : use.replace('0.', '').indexOf('1') + 1;
}

const meetsMinimum = (qty: number, price: number, limits: PairLimits) =>
  qty > 0 && qty >= limits.minBase && qty * price >= limits.minQuote;

/**
 * The smallest scale at which every resting line still meets the exchange
 * minimum — main-app `comboMinimumScale`.
 */
export function comboMinimumScale(
  lines: { qty: number; price: number }[],
  limits: PairLimits
): number {
  let kMin = 0;
  for (const l of lines) {
    if (!finite(l.qty)) continue;
    if (finite(limits.minBase)) kMin = Math.max(kMin, limits.minBase / l.qty);
    if (finite(limits.minQuote) && finite(l.price)) {
      kMin = Math.max(kMin, limits.minQuote / (l.qty * l.price));
    }
  }
  return kMin;
}

const finite = (n: number) => Number.isFinite(n) && n > 0;

const NO_MINIMUM = {
  belowMinimum: null,
  maxReducePerc: null,
  raisedToMinimum: false,
} as const;

/**
 * DCA: the engine rounds the order to the lot step (to nearest). A percentage
 * below the exchange minimum is raised to it; a fixed amount below it is
 * refused (main-app `addDealFunds` / `reduceDealFunds`).
 */
export function dcaFundsOutcome(
  mode: FundsMode,
  basis: PercentBasis,
  req: FundsRequest,
  long: boolean,
  limits?: PairLimits | null
): FundsOutcome | null {
  if (!finite(req.qty) || !finite(req.price)) return null;
  const position = basis.remainingBase;
  const avg = basis.avgPrice;
  const raw = req.perc
    ? basis.perHundred * (req.qty / 100)
    : req.asset === 'base'
      ? req.qty
      : req.qty / req.price;
  if (!finite(raw)) return null;
  let orderBase = raw;
  let belowMinimum: FundsOutcome['belowMinimum'] = null;
  let raisedToMinimum = false;
  if (limits) {
    const precision = basePrecisionFromStep(limits.step);
    orderBase = math.round(raw, precision);
    if (!meetsMinimum(orderBase, req.price, limits)) {
      if (req.perc) {
        orderBase = math.round(
          Math.max(limits.minBase, limits.minQuote / req.price),
          precision,
          false,
          true
        );
        raisedToMinimum = true;
      } else {
        belowMinimum = 'order';
      }
    }
  }
  const checks = { belowMinimum, maxReducePerc: null, raisedToMinimum };

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
      ...checks,
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
    ...checks,
  };
}

/**
 * Combo: main-app `changeComboDealFunds`. A reduce that would leave a resting
 * line below the exchange minimum is refused, the market order is rounded to
 * the lot step, and an order below the minimum is refused.
 */
export function comboFundsOutcome(
  mode: FundsMode,
  basis: PercentBasis,
  req: FundsRequest,
  pending: PendingLevels,
  long: boolean,
  limits?: PairLimits | null
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
      ...NO_MINIMUM,
    };
  }
  let orderBase = Math.abs(scale - 1) * position;
  if (limits) {
    if (scale < 1) {
      const kMin = comboMinimumScale(pending.lines ?? [], limits);
      if (scale + 1e-9 < kMin) {
        const max = Math.floor((1 - kMin) * 100 * 100 + 1e-6) / 100;
        return {
          ...comboOutcome(mode, position, avg, orderBase, scale, req, pending, long),
          belowMinimum: 'level',
          maxReducePerc: Math.max(0, max),
        };
      }
    }
    orderBase = math.round(orderBase, basePrecisionFromStep(limits.step));
    if (mode === 'reduce' && orderBase >= position) {
      return comboFundsOutcome(
        mode,
        basis,
        { ...req, qty: 100, perc: true },
        pending,
        long
      );
    }
    if (!meetsMinimum(orderBase, req.price, limits)) {
      return {
        ...comboOutcome(mode, position, avg, orderBase, scale, req, pending, long),
        belowMinimum: 'order',
      };
    }
  }
  return comboOutcome(mode, position, avg, orderBase, scale, req, pending, long);
}

function comboOutcome(
  mode: FundsMode,
  position: number,
  avg: number,
  orderBase: number,
  requested: number,
  req: FundsRequest,
  pending: PendingLevels,
  long: boolean
): FundsOutcome {
  // The engine scales the deal by what the order executes, so a rounded
  // order moves the factor with it (main-app `comboFillScale`).
  const scale =
    position > 0
      ? 1 + ((mode === 'add' ? 1 : -1) * orderBase) / position
      : requested;
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
    ...NO_MINIMUM,
  };
}
