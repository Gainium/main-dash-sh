// Fill markers on the chart: sized by order value, described on hover.
// Pure helpers (no chart or logger), so they can be unit-tested.
import type { TransactionExtended } from './types';

/** Smallest and largest fill icon, in px. The old fixed size was 20. */
const FILL_MARKER_MIN_PX = 14;
const FILL_MARKER_MAX_PX = 34;
export const FILL_MARKER_DEFAULT_PX = 20;

export const isPointFill = (tr: TransactionExtended) =>
  !tr.note && tr.isCompletedTrade !== true;

/** Attaches the fill's value (qty × price) so markers can be sized by it. */
export function withFillValue(tr: TransactionExtended): TransactionExtended {
  const qty = Number(tr.qty);
  const price = Number(tr.price);
  const notional =
    Number.isFinite(qty) && qty > 0 && Number.isFinite(price) && price > 0
      ? qty * price
      : undefined;
  return { ...tr, notional, fillCount: 1 };
}

/** The largest single fill's value; the 100 % reference for marker sizes. */
export function largestFillNotional(all: TransactionExtended[]): number {
  let max = 0;
  for (const tr of all) {
    if (!isPointFill(tr)) continue;
    const n = withFillValue(tr).notional ?? 0;
    if (n > max) max = n;
  }
  return max;
}

/**
 * Two fills that land on the same marker spot become one marker that stands
 * for both: quantities and values add up, so a merged spot is drawn (and
 * described on hover) by everything it hides, not by whichever fill came last.
 */
export function mergeFills(
  prev: TransactionExtended | undefined,
  tr: TransactionExtended
): TransactionExtended {
  if (!prev || !isPointFill(prev) || !isPointFill(tr)) return tr;
  const sum = (a?: number, b?: number) =>
    a == null && b == null ? undefined : (a ?? 0) + (b ?? 0);
  return {
    ...tr,
    qty: sum(prev.qty, tr.qty),
    notional: sum(prev.notional, tr.notional),
    fillCount: (prev.fillCount ?? 1) + (tr.fillCount ?? 1),
  };
}

/**
 * Icon size for a fill worth `notional`, against the largest fill. Area grows
 * with value (square-root scale), so a 4× order reads twice as wide and one
 * huge fill doesn't shrink the rest to dots. No size data → the old fixed size.
 */
export function fillMarkerSize(
  notional: number | undefined,
  reference: number
): number {
  if (notional == null || !(notional > 0) || !(reference > 0)) {
    return FILL_MARKER_DEFAULT_PX;
  }
  const ratio = Math.min(1, Math.sqrt(notional / reference));
  return Math.round(
    FILL_MARKER_MIN_PX + (FILL_MARKER_MAX_PX - FILL_MARKER_MIN_PX) * ratio
  );
}

const formatAmount = (value: number) =>
  Number(value.toPrecision(6)).toLocaleString(undefined, {
    maximumFractionDigits: 8,
  });

// Order value: cents are enough above 1; small values keep their digits.
const formatValue = (value: number) =>
  value >= 1
    ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : formatAmount(value);

/** Hover text for a fill marker, e.g. "Buy 0.0739 @ 270.45 · 19.99 USDT". */
export function fillTooltip(tr: TransactionExtended): string {
  const side = tr.side?.toString().toLowerCase().trim();
  const isBuy = side === 'buy' || side === 'long';
  const count = tr.fillCount ?? 1;
  const head = `${isBuy ? 'Buy' : 'Sell'}${count > 1 ? ` ×${count}` : ''}`;
  const qty = Number(tr.qty);
  if (!(qty > 0)) return `${head} @ ${formatAmount(Number(tr.price))}`;
  const value =
    tr.notional != null
      ? ` · ${formatValue(tr.notional)}${tr.quoteAsset ? ` ${tr.quoteAsset}` : ''}`
      : '';
  // Merged fills have no single price, so the value carries the total.
  const at = count > 1 ? '' : ` @ ${formatAmount(Number(tr.price))}`;
  return `${head} ${formatAmount(qty)}${at}${value}`;
}

/** A fill marker as drawn, kept so the crosshair can find what it is over. */
export type DrawnFill = {
  seconds: number;
  price: number;
  size: number;
  text: string;
};

/**
 * The drawn fill under the crosshair, if any: same bar, and the price within
 * the icon's own radius (converted from px with the pane's price-per-px).
 */
export function fillUnderCrosshair(
  fills: DrawnFill[],
  time: number,
  price: number,
  barSeconds: number,
  pricePerPx: number
): DrawnFill | null {
  if (!(pricePerPx > 0)) return null;
  const bar = Math.floor(time / barSeconds);
  let best: DrawnFill | null = null;
  let bestDistance = Infinity;
  for (const f of fills) {
    if (Math.floor(f.seconds / barSeconds) !== bar) continue;
    const distance = Math.abs(f.price - price);
    if (distance <= (f.size / 2 + 2) * pricePerPx && distance < bestDistance) {
      best = f;
      bestDistance = distance;
    }
  }
  return best;
}
