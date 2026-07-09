import { BotTypesEnum } from '@/types';

import type { BotPageBoundaryDescriptor } from './types';

/**
 * Hedge page contracts. Hedge pages do NOT use BotWorkbench (their body is
 * MainLayout + HedgeBotFormProvider + HedgeBotEditLayout), so they implement
 * only the boundary slice — no chart-widget / backtest-panel plumbing.
 *
 * premium.description is mode-specific to preserve the original per-page copy
 * ("Creating…" on new, "Editing…" on edit) byte-for-byte.
 */
export const hedgeDcaPageDescriptor: BotPageBoundaryDescriptor = {
  botType: BotTypesEnum.hedgeDca,
  basePath: '/hedge/bot',
  listLabel: 'hedge DCA bots',
  titles: { create: 'Hedge DCA Bot — New', edit: 'Hedge DCA Bot — Edit' },
  activePage: { create: '/hedge/bot/new', edit: '/hedge/bot/edit' },
  premium: {
    feature: 'Hedge DCA bots',
    description: {
      create: 'Creating hedge bots requires a premium license.',
      edit: 'Editing hedge bots requires a premium license.',
    },
  },
  guardEnabled: true,
};

export const hedgeComboPageDescriptor: BotPageBoundaryDescriptor = {
  botType: BotTypesEnum.hedgeCombo,
  basePath: '/hedge/combo',
  listLabel: 'hedge combo bots',
  titles: { create: 'Hedge Combo Bot — New', edit: 'Hedge Combo Bot — Edit' },
  activePage: { create: '/hedge/combo/new', edit: '/hedge/combo/edit' },
  premium: {
    feature: 'Hedge combo bots',
    description: {
      create: 'Creating hedge bots requires a premium license.',
      edit: 'Editing hedge bots requires a premium license.',
    },
  },
  guardEnabled: true,
};
