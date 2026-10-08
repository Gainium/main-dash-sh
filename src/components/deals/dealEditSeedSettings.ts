import { DCA_FORM_DEFAULTS } from '@/contexts/bots/form/formDefaults';
import { dealStrategy, mergeDealSettings } from '@/utils/deals/trailing';
import type { DCADeals } from '@/types';

/**
 * The deal-edit seed: the deal(s) being edited in, the settings object the form
 * slice (`formData.dca` / `formData.combo`) is seeded from.
 *
 * Lives in its own module (rather than inside DealEditDrawer.tsx) for the same
 * reason as its sibling `dealEditSettingsDiff.ts` — so it can be driven
 * directly by a test with a real deal payload. Nothing here is React.
 */
export const buildDealEditSeedSettings = (trade: DCADeals[]) => {
  if (trade.length > 1) {
    return buildMassEditSeedSettings(trade);
  }
  if (!trade[0]) {
    return { ...DCA_FORM_DEFAULTS };
  }

  const deal = trade[0];

  return {
    ...deal.dcaBot?.settings,
    ...deal.settings,
    // Direction. It is NOT in either spread: the deal's own `settings`
    // snapshot has no `strategy` key, and the deal list queries resolve
    // `dcaBot` to null, so the form would keep its LONG default and every
    // TP/SL price this drawer derives off the breakeven would land on the
    // wrong side for a short deal. Resolved with the same helper and the same
    // precedence the deal chart's exit lines use, so the form, the chart and
    // the engine agree on which way the deal points.
    strategy: dealStrategy(deal, mergeDealSettings(deal.dcaBot?.settings, deal)),
    // Breakeven price: seed from the deal's manual override if set,
    // else its live computed average, so the input always reflects
    // the current breakeven and the field exists for updateFormData.
    avgPrice: deal.settings?.avgPrice ?? deal.avgPrice,
    // Which multi-target uuids already executed. The deal keeps
    // filled targets in `multiTp` on purpose — the engine sizes the
    // remaining targets as `amount / (100 - <filled amounts>)`
    // (main-app `dcaHelper.getTPOrder`), so dropping them would
    // silently shrink every surviving take-profit. They must stay in
    // the payload and be presented as spent instead.
    tpSlTargetFilled: deal.tpSlTargetFilled ?? [],
  };
};

/**
 * Mass edit: the values every selected deal shares, and nothing else.
 *
 * This used to return `DCA_FORM_DEFAULTS`, so the drawer showed the new-bot
 * defaults (take profit on at 1%, stop loss at -10%, …) as if they were the
 * deals' settings — for combo deals too, whose own defaults differ. A field the
 * deals disagree on is seeded `undefined`, so it renders empty instead of
 * showing one deal's value, or a default, as everyone's.
 *
 * Seeding is display only. What a save sends is decided by
 * `pickMassEditChanges` — the fields the user changed, never the seed.
 */
export const buildMassEditSeedSettings = (trade: DCADeals[]) => {
  const merged = trade.map(
    (deal) =>
      ({
        ...deal.dcaBot?.settings,
        ...deal.settings,
      }) as Record<string, unknown>
  );
  const keys = new Set(merged.flatMap((m) => Object.keys(m)));
  const seed: Record<string, unknown> = {};
  for (const key of keys) {
    const first = JSON.stringify(merged[0][key] ?? null);
    const shared = merged.every(
      (m) => JSON.stringify(m[key] ?? null) === first
    );
    seed[key] = shared ? merged[0][key] : undefined;
  }
  // Direction is not in the deal's settings snapshot (see the single-deal
  // branch); resolve it per deal and keep it only when every deal agrees.
  const strategies = new Set(
    trade.map((deal) =>
      dealStrategy(deal, mergeDealSettings(deal.dcaBot?.settings, deal))
    )
  );
  seed['strategy'] = strategies.size === 1 ? [...strategies][0] : undefined;
  return seed;
};
