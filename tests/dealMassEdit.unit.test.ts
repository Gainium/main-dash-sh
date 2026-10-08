import { test, expect } from '@playwright/test';

import { buildDealEditSeedSettings } from '@/components/deals/dealEditSeedSettings';
import { pickMassEditChanges } from '@/components/deals/dealEditSettingsDiff';
import {
  COMBO_FORM_DEFAULTS,
  DCA_FORM_DEFAULTS,
  SHARED_FORM_DEFAULTS,
} from '@/contexts/bots/form/formDefaults';
import { BotTypesEnum, type DCADeals } from '@/types';
import type { BotFormData } from '@/types/bots/form';

/**
 * Bulk deal edit (DCA, terminal and combo deals all use DealEditDrawer).
 *
 * The drawer seeded a multi-deal selection with the new-bot defaults, so it
 * showed take profit on at 1% on deals that had it off, and a save diffed the
 * form against each deal — writing every default that differed (take profit,
 * stop loss, DCA step, order count) onto deals the user never touched.
 *
 * Now: the drawer shows only values every selected deal shares, and a save
 * sends only what the user changed.
 */

type Kind = 'dca' | 'combo';

const deal = (id: string, settings: Record<string, unknown>, combo = false) =>
  ({
    _id: id,
    botId: 'bot',
    combo,
    strategy: 'LONG',
    symbol: { symbol: `${id}USDT`, baseAsset: id, quoteAsset: 'USDT' },
    settings,
  }) as unknown as DCADeals;

// A combo deal snapshot as the API returns it — take profit OFF at 5%.
const comboSettings = (over: Record<string, unknown> = {}) => ({
  tpPerc: '5',
  useTp: false,
  useSl: false,
  slPerc: '-25',
  ordersCount: 5,
  activeOrdersCount: 1,
  step: '5',
  stepScale: '1',
  volumeScale: '1',
  useDca: true,
  dealCloseCondition: 'tp',
  ...over,
});

/** The form exactly as DealEditDrawer seeds it for a multi-deal selection. */
const seededForm = (kind: Kind, trade: DCADeals[]): BotFormData => {
  const seed = buildDealEditSeedSettings(trade);
  const slice = {
    ...(kind === 'combo' ? COMBO_FORM_DEFAULTS : DCA_FORM_DEFAULTS),
    ...seed,
  };
  return {
    ...SHARED_FORM_DEFAULTS,
    type: kind === 'combo' ? BotTypesEnum.combo : BotTypesEnum.dca,
    exchangeUUID: 'exchange-uuid',
    dca: kind === 'dca' ? slice : { ...DCA_FORM_DEFAULTS },
    combo: kind === 'combo' ? slice : { ...COMBO_FORM_DEFAULTS },
    grid: {},
    originalBot: {
      type: kind === 'combo' ? BotTypesEnum.combo : BotTypesEnum.dca,
      settings: { ...slice },
    },
  } as unknown as BotFormData;
};

const edit = (form: BotFormData, kind: Kind, over: Record<string, unknown>) => {
  const key = kind === 'combo' ? 'combo' : 'dca';
  return {
    ...form,
    [key]: { ...(form[key] as object), ...over },
  } as unknown as BotFormData;
};

for (const kind of ['combo', 'dca'] as const) {
  const isCombo = kind === 'combo';
  const trade = [
    deal('LINK', comboSettings(), isCombo),
    deal('DOGE', comboSettings({ step: '3' }), isCombo),
    deal('BNB', comboSettings({ tpPerc: '1' }), isCombo),
  ];

  test(`${kind}: the drawer shows the deals' shared values, not defaults`, () => {
    const seed = buildDealEditSeedSettings(trade) as Record<string, unknown>;
    expect(seed['useTp']).toBe(false);
    expect(seed['slPerc']).toBe('-25');
    expect(seed['ordersCount']).toBe(5);
    expect(seed['strategy']).toBe('LONG');
    // The deals disagree — show nothing rather than one deal's value.
    expect(seed['step']).toBeUndefined();
    expect(seed['tpPerc']).toBeUndefined();
  });

  test(`${kind}: an untouched save changes nothing on any deal`, () => {
    const form = seededForm(kind, trade);
    for (const t of trade) {
      expect(pickMassEditChanges(form, t.settings)).toEqual({});
    }
  });

  test(`${kind}: a save sends only what the user changed`, () => {
    const form = edit(seededForm(kind, trade), kind, {
      useTp: true,
      tpPerc: '1',
    });
    expect(pickMassEditChanges(form, trade[0].settings)).toEqual({
      useTp: true,
      tpPerc: '1',
    });
    // Already at 1% — only the switch is sent.
    expect(pickMassEditChanges(form, trade[2].settings)).toEqual({
      useTp: true,
    });
  });

  test(`${kind}: one changed field leaves the deals' differing fields alone`, () => {
    const form = edit(seededForm(kind, trade), kind, { slPerc: '-15' });
    for (const t of trade) {
      expect(pickMassEditChanges(form, t.settings)).toEqual({
        slPerc: '-15',
      });
    }
  });
}
