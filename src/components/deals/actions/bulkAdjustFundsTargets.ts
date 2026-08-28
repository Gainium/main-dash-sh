// Pure selection rules for the bulk Add/Reduce funds flow.
//
// Split out of `useBulkAdjustFunds` so they can be exercised without pulling a
// React tree — and the logger's `import.meta.env` access — into the runner.
import type { PercentBasis } from '@/features/bots/shared/runtime/dialogs/adjustFundsAmount';
import { DCADealStatusEnum } from '@/types';

/** A selected deal row reduced to what the adjust-funds flow needs. */
export interface BulkAdjustFundsTarget {
  dealId: string;
  botId: string | undefined;
  /** Deal status — only open deals can take a funds adjustment. */
  status: string | undefined;
  /** Bot type as rendered in the tables ('DCA', 'Combo', 'Grid', …). */
  type: string | undefined;
  baseAsset?: string | undefined;
  quoteAsset?: string | undefined;
  /** Exchange symbol and venue, used to seed the limit price from the market. */
  symbol?: string | undefined;
  exchange?: string | undefined;
  /** Per-deal, so it is only passed on when exactly one deal is selected. */
  percentBasis?: PercentBasis | undefined;
}

/**
 * The one value shared by every selected deal, or undefined when they differ.
 *
 * Every field the dialog takes from the selection describes ONE pair — the
 * asset names it labels the picker with, and the symbol it seeds the limit
 * price from. Across a mixed selection each of those would be a fact about one
 * deal presented as true of all of them, and for the limit price that means
 * putting one symbol's price on the others' orders. Undefined makes the dialog
 * fall back to "Base/Quote asset" and an empty price box, which is honest.
 *
 * Deliberately not `targets[0].<field>`: a single-target selection and a
 * homogeneous one are the same case, and a mixed one must not resolve.
 */
export const sharedTargetValue = (
  targets: BulkAdjustFundsTarget[],
  pick: (target: BulkAdjustFundsTarget) => string | undefined
): string | undefined => {
  const values = new Set(targets.map((target) => pick(target) ?? ''));
  if (values.size !== 1) {
    return undefined;
  }
  const [only] = [...values];
  return only || undefined;
};

/** Combo legs are managed by the combo engine, not the deal funds mutation. */
const COMBO_TYPES = new Set(['Combo', 'Hedge Combo']);

/**
 * Same rule the per-row Add/Reduce Funds menu items apply: the deal must be
 * open, belong to a bot, and not be a combo deal.
 */
export function canAdjustDealFunds(target: BulkAdjustFundsTarget): boolean {
  return (
    !!target.dealId &&
    !!target.botId &&
    !COMBO_TYPES.has(String(target.type ?? '')) &&
    String(target.status ?? '').toLowerCase() === DCADealStatusEnum.open
  );
}
