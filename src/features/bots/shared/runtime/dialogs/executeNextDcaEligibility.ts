/**
 * Eligibility + level arithmetic for "Execute next DCA".
 * https://community.gainium.io/t/execute-next-dca-manually/5072
 *
 * Kept out of `ExecuteNextDcaDialog.tsx` so that file only exports a component
 * (react-refresh), matching how `adjustFundsAmount.ts` sits beside
 * `AdjustFundsDialog.tsx`.
 */

/** What the eligibility check reads off a deal. Deliberately structural: the
 *  four call sites carry near-identical but separately declared deal shapes. */
export interface ExecuteNextDcaEligibilityTrade {
  type?: string;
  status?: string;
  terminal?: boolean | undefined;
  riskBased?: boolean | undefined;
  levels?: { complete: number; all: number } | undefined;
}

/**
 * `levels.complete` counts the base order as 1, and the engine numbers safety
 * orders from 1 — so the next safety order's level number IS `levels.complete`.
 * (The engine relies on the same identity: `addDCAOrderByIndicator` matches
 * `levels.complete === index + 1` against `levelNumber === index + 1`.)
 *
 * The count a user sees, "2 / 5", is `levels.complete - 1` of `levels.all - 1`,
 * because both totals include the base order. Same arithmetic
 * `ChangeDcaLevelsDialog` uses.
 */
export function nextDcaLevelNumber(trade: {
  levels?: { complete: number; all: number } | undefined;
}) {
  return trade.levels?.complete || 1;
}

/**
 * Whether "Execute next DCA" is offered at all for this deal. Mirrors
 * `canShowChangeDca` — DCA deals only, open, not terminal, not risk-based
 * (those levels are engine-managed) — plus "there is a level left to execute".
 *
 * Combo is excluded deliberately, and not merely for scope: combo levels are
 * minigrid-managed, so the engine's `executeNextDcaLevel` returns early on
 * `this.combo` and the action could never do anything there.
 */
export function canExecuteNextDca(trade: ExecuteNextDcaEligibilityTrade) {
  const complete = trade.levels?.complete ?? 0;
  const all = trade.levels?.all ?? 0;
  return (
    !trade.terminal &&
    trade.type === 'DCA' &&
    String(trade.status ?? '').toLowerCase() === 'open' &&
    !trade.riskBased &&
    complete > 0 &&
    complete < all
  );
}

/**
 * One rung of the deal's remaining DCA ladder, normalised from whichever source
 * knew about it.
 */
export interface LadderLevel {
  price: number;
  qty: number;
  baseAsset?: string | undefined;
  quoteAsset?: string | undefined;
  /**
   * True when nothing rests on the venue for this level and the figures come
   * from the client-side projection. That is the normal state for a
   * `dcaByMarket` deal and for every indicator-triggered deal — their safety
   * orders are never placed until they trigger — and it is also true of any
   * level past `activeOrdersCount` when smart orders are on.
   */
  projected: boolean;
}

/**
 * The deal's remaining ladder, nearest rung first.
 *
 * "Nearest" is by price and depends on direction: a long's safety orders sit
 * BELOW the current price and deepen downwards, so the highest is next; a
 * short's mirror that. Sorting rather than trusting input order matters
 * because the two sources arrive separately — real resting orders from the
 * exchange, projected rungs from the client-side ladder — and neither knows
 * about the other's positions.
 *
 * Levels at the same price are the same level counted twice (a resting order
 * and the projection that predicted it), so the real one wins: it carries the
 * venue's own assets and quantity.
 */
export function ladderAhead(
  levels: LadderLevel[],
  isLong: boolean
): LadderLevel[] {
  const byPrice = new Map<number, LadderLevel>();
  for (const level of levels) {
    if (!Number.isFinite(level.price) || level.price <= 0) {
      continue;
    }
    if (!Number.isFinite(level.qty) || level.qty <= 0) {
      continue;
    }
    const existing = byPrice.get(level.price);
    // A real order beats a projection at the same price; otherwise first wins.
    if (!existing || (existing.projected && !level.projected)) {
      byPrice.set(level.price, level);
    }
  }
  return [...byPrice.values()].sort((a, b) =>
    isLong ? b.price - a.price : a.price - b.price
  );
}
