/**
 * Unrealized P&L for a raw exchange position (Trading Terminal → Exchange
 * Orders → Positions).
 *
 * We deliberately do NOT read the venue's own `unrealizedProfit`: main-app's
 * `getAllOpenPositions` handler drops that field on the way out, and where it
 * survives it is not comparable across venues — the Kraken connector, for one,
 * maps `unrealizedProfit` from `unrealizedFunding` (the funding accrual, not
 * P&L) and reports `notional: '0'`. Computing from entry price against the
 * live ticker is exchange-agnostic and matches what the rest of the dashboard
 * already does for deals (`getLatestPrices`).
 */

export interface PositionPnlInput {
  /** 'LONG' | 'SHORT' (case-insensitive). */
  side: string;
  /** Position entry / average price, in quote. */
  entryPrice: number;
  /** Live mark (ticker) price, in quote. */
  markPrice: number;
  /** Absolute size: base amount on linear venues, contracts on coin-m ones. */
  quantity: number;
  /** True for inverse (coin-m) contracts, where `quantity` counts contracts. */
  isInverse?: boolean;
  /** Quote value of one contract; only read when `isInverse`. */
  contractSize?: number;
  /** Position leverage; `0`/absent means "unknown", treated as 1x. */
  leverage?: number;
}

export interface PositionPnl {
  /** Position size at entry, in the quote asset. */
  entryNotional: number;
  /** Unrealized P&L, in the quote asset. */
  pnlQuote: number;
  /** Price move in the position's favour, unleveraged, in percent. */
  pricePct: number;
  /** `pricePct` × leverage — return on the margin actually posted, in percent. */
  roiPct: number;
}

/**
 * Returns `null` when the inputs can't produce an honest number (no ticker for
 * the pair, zero entry price, empty position) so callers can render a dash
 * rather than a confident `0.00`.
 *
 * Quote-denominated P&L is the same expression for linear and inverse
 * contracts once the size is expressed as entry notional:
 *
 *   linear:  qty × (mark − entry)              = N × (mark/entry − 1)
 *   inverse: N × (1/entry − 1/mark) × mark     = N × (mark/entry − 1)
 *
 * For inverse contracts the trader settles that P&L in the base asset; we show
 * it valued in quote at the current mark, which is what the venues display.
 */
export function computePositionPnl(
  input: PositionPnlInput
): PositionPnl | null {
  const { side, entryPrice, markPrice, quantity, isInverse, contractSize } =
    input;

  if (
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(markPrice) ||
    !Number.isFinite(quantity) ||
    entryPrice <= 0 ||
    markPrice <= 0 ||
    quantity === 0
  ) {
    return null;
  }

  const sign = side.toUpperCase() === 'SHORT' ? -1 : 1;
  const size = Math.abs(quantity);
  const entryNotional = isInverse
    ? size * (contractSize && contractSize > 0 ? contractSize : 1)
    : size * entryPrice;

  const move = markPrice / entryPrice - 1;
  const pricePct = sign * move * 100;
  // `leverage` is '0' on venues that report cross/unknown rather than an
  // isolated preference (Kraken does this); fall back to 1x instead of
  // collapsing ROI to zero.
  const leverage =
    input.leverage && input.leverage > 0 ? input.leverage : 1;

  return {
    entryNotional,
    pnlQuote: entryNotional * sign * move,
    pricePct,
    roiPct: pricePct * leverage,
  };
}
