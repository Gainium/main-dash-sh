/**
 * Builds the per-order auto-compounding breakdown for a deal.
 *
 * Ported from legacy main-dash (`components/dcabot/utils.ts`), which showed the
 * same data behind an info icon next to a deal's size. The redesign fetched the
 * raw `sizes` (base/dca vs. origBase/origDca) on every DCA & combo deal but
 * never surfaced it — so users couldn't see how much auto-compounding added to
 * each order. This restores that visibility.
 *
 * Each entry pairs the originally configured order size (`valueOrig`) with the
 * amount auto-compounding added on top of it (`valueAdded`); the effective order
 * size the bot actually placed is `valueOrig + valueAdded`. `Base` is the
 * initial buy; `DCA n` are the safety orders.
 */
import type { Sizes } from '@/types';

export interface CompoundBreakdownEntry {
  key: string;
  valueOrig: number;
  valueAdded: number;
}

export function computeCompoundBreakdown(
  sizes?: Sizes
): CompoundBreakdownEntry[] | undefined {
  if (!sizes || typeof sizes.origBase === 'undefined' || sizes.origBase === null) {
    return undefined;
  }

  const entries: CompoundBreakdownEntry[] = [
    {
      key: 'Base',
      valueOrig: sizes.origBase,
      valueAdded: sizes.base,
    },
  ];

  (sizes.dca ?? []).forEach((added, i) => {
    entries.push({
      key: `DCA ${i + 1}`,
      valueOrig: sizes.origDca?.[i] ?? 0,
      valueAdded: added,
    });
  });

  // If auto-compounding added nothing to any order, there's nothing worth
  // showing — keep the deal detail uncluttered for non-compounding bots.
  const hasCompounding = entries.some((e) => Math.abs(e.valueAdded) > 0);
  return hasCompounding ? entries : undefined;
}
