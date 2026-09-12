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
  if (trade.length !== 1 || !trade[0]) {
    // Mass edit: several deals with nothing in common to seed from.
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
