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
