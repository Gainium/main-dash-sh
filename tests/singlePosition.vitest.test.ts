/**
 * Runner note: Vitest. Run from the parent:
 * `npx vitest run core/tests/singlePosition.vitest.test.ts`.
 *
 * Single position per pair (DCA bots), the dashboard half: the adoption
 * preview, the ASAP spacing rule and its one-click fixes, the move/merge
 * routing, the entries label, the backend-compatibility gate on the save
 * payload, and the reads that detect an older backend.
 */
import { describe, expect, it } from 'vitest';

import {
  COMBO_FORM_DEFAULTS,
  DCA_FORM_DEFAULTS,
  SHARED_FORM_DEFAULTS,
} from '@/contexts/bots/form/formDefaults';
import { mapBotSettingsToFormData } from '@/mappers/bots/dca/map-bot-settings-to-form-data';
import { mapFormDataToPayload } from '@/mappers/bots/dca/map-form-data-to-payload';
import {
  ADOPTION_IRREVERSIBLE_SENTENCE,
  SINGLE_POSITION_ASAP_REASON,
  SINGLE_POSITION_CLOSE_AFTER_OPENED_MESSAGE,
  addStartCooldownPatch,
  adoptionRowTitle,
  buildAdoptionPreview,
  dealBaseSize,
  enableDynamicPriceFilterPatch,
  findPositionDeal,
  formatPositionEntries,
  isMultiDealRefusal,
  isTurningSinglePositionOn,
  maxPositionEntriesError,
  maxPositionEntriesToForm,
  mergesIntoPositionLabel,
  normalizeMaxPositionEntries,
  pairsNeedingAdoption,
  planMoveIntoBot,
  previewAdoption,
  singlePositionAsapError,
  tpPriceFor,
  type PreviewDeal,
} from '@/lib/singlePosition/singlePosition';
import {
  PROBE_BOT_ID,
  buildSinglePositionSettingsDocument,
  classifySinglePositionError,
  fetchSinglePositionSettings,
  parseSinglePositionAnswer,
} from '@/lib/singlePosition/singlePositionApi';
import type { GraphQLClient } from '@/lib/api/GraphQLClient';
import { BotTypesEnum, StartConditionEnum } from '@/types';
import type { BotFormData } from '@/types/bots/form';
import { validateDcaFormData } from '@/utils/bots/dca/validation';

const longDeal = (
  id: string,
  createTime: number,
  base: number,
  avgPrice: number,
  extra: Partial<PreviewDeal> = {}
): PreviewDeal => ({
  _id: id,
  symbol: 'BTCUSDT',
  createTime,
  avgPrice,
  strategy: 'LONG',
  initialBalances: { base: 0, quote: 1000 },
  currentBalances: { base, quote: 0 },
  levels: { all: 1, complete: 1 },
  settings: { tpPerc: '2', useTp: true },
  ...extra,
});

describe('adoption preview (§5.1.1 / §5.1.3)', () => {
  const bot = { strategy: 'LONG', tpPerc: '1', useTp: true };

  it('folds several deals on a pair into the OLDEST one, size-weighted', () => {
    const rows = buildAdoptionPreview(
      [
        longDeal('newer', 3_000, 2, 110),
        longDeal('oldest', 1_000, 1, 100),
        longDeal('middle', 2_000, 1, 120),
      ],
      bot
    );
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row?.kind).toBe('adopt');
    expect(row?.targetDealId).toBe('oldest');
    expect(row?.sourceDealIds.sort()).toEqual(['middle', 'newer']);
    expect(row?.dealCount).toBe(3);
    expect(row?.sizeBefore).toBe(1);
    expect(row?.sizeAfter).toBe(4);
    // (1*100 + 2*110 + 1*120) / 4
    expect(row?.avgAfter).toBeCloseTo(110, 10);
    // Old TP from the target's own deal TP % (2 %), new from the bot's (1 %).
    expect(row?.tpBefore).toBeCloseTo(102, 10);
    expect(row?.tpAfter).toBeCloseTo(111.1, 10);
    expect(row && adoptionRowTitle(row)).toBe(
      'BTCUSDT — 3 deals → 1 position'
    );
    expect(pairsNeedingAdoption(rows)).toEqual(['BTCUSDT']);
  });

  it('a lone deal with an unfilled ladder gets a row; one without gets none', () => {
    const rows = buildAdoptionPreview(
      [
        longDeal('ladder', 1, 1, 100, {
          symbol: 'ETHUSDT',
          levels: { all: 5, complete: 2 },
        }),
        longDeal('plain', 1, 1, 100, { symbol: 'SOLUSDT' }),
      ],
      bot
    );
    expect(rows.map((r) => [r.pair, r.kind])).toEqual([['ETHUSDT', 'ladder']]);
    expect(rows[0] && adoptionRowTitle(rows[0])).toBe(
      'ETHUSDT — 1 deal, safety orders cancelled'
    );
    expect(rows[0]?.sizeAfter).toBe(rows[0]?.sizeBefore);
  });

  it('groups pairs whatever their separator', () => {
    const rows = buildAdoptionPreview(
      [
        longDeal('a', 1, 1, 100, { symbol: 'BTC/USDT' }),
        longDeal('b', 2, 1, 100, { symbol: 'BTCUSDT' }),
      ],
      bot
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.targetDealId).toBe('a');
  });

  it('short positions: size is what was sold, TP below the average', () => {
    const shortDeal = (id: string, t: number, sold: number, avg: number) =>
      longDeal(id, t, 0, avg, {
        strategy: 'SHORT',
        initialBalances: { base: 10, quote: 0 },
        currentBalances: { base: 10 - sold, quote: 0 },
      });
    expect(dealBaseSize(shortDeal('s', 1, 3, 50))).toBe(3);
    const row = previewAdoption(
      shortDeal('t', 1, 1, 100),
      [shortDeal('s', 2, 1, 80)],
      { strategy: 'SHORT', tpPerc: '10', useTp: true }
    );
    expect(row.avgAfter).toBeCloseTo(90, 10);
    expect(row.tpAfter).toBeCloseTo(81, 10);
    expect(tpPriceFor(100, 10, 'SHORT')).toBeCloseTo(90, 10);
  });

  it('no TP when the bot does not use one; unfilled deals do not skew the average', () => {
    const row = previewAdoption(
      longDeal('t', 1, 1, 100),
      [longDeal('unfilled', 2, 0, 0)],
      { strategy: 'LONG', tpPerc: '1', useTp: false }
    );
    expect(row.tpAfter).toBeNull();
    expect(row.avgAfter).toBe(100);
    expect(row.sizeAfter).toBe(1);
  });

  it('shows the resting TP as before and carries its ratio to the new average', () => {
    // A resting TP 1.08 % above the average (TP % 1 plus fees), not the bare 1 %.
    const row = previewAdoption(
      { ...longDeal('t', 1, 7, 83356.5), restingTpPrice: 84257.4 },
      [longDeal('s', 2, 1, 82943.0)],
      bot
    );
    expect(row.tpBeforeLive).toBe(true);
    expect(row.tpBefore).toBe(84257.4);
    // (7 * 83356.5 + 82943) / 8
    expect(row.avgAfter).toBeCloseTo(83304.8125, 6);
    expect(row.tpAfter).toBeCloseTo(83304.8125 * (84257.4 / 83356.5), 6);
  });

  it('falls back to the TP % estimate when no resting TP was loaded', () => {
    const row = previewAdoption(
      { ...longDeal('t', 1, 1, 100), restingTpPrice: null },
      [longDeal('s', 2, 1, 120)],
      bot
    );
    expect(row.tpBeforeLive).toBe(false);
    expect(row.tpAfter).toBeCloseTo(111.1, 10);
  });

  it('carries the irreversibility sentence the spec asks for', () => {
    expect(ADOPTION_IRREVERSIBLE_SENTENCE).toBe(
      'Open safety orders and take-profit orders of these deals are cancelled and replaced. This cannot be undone.'
    );
  });
});

describe('ASAP spacing (§7)', () => {
  const asap = {
    singlePosition: true,
    startCondition: StartConditionEnum.asap,
  };

  it('ASAP without a dynamic filter or start cooldown is refused with the server reason', () => {
    expect(singlePositionAsapError(asap)).toBe(SINGLE_POSITION_ASAP_REASON);
  });

  it('either spacing satisfies it; other start conditions need none', () => {
    expect(
      singlePositionAsapError({
        ...asap,
        useDynamicPriceFilter: true,
        dynamicPriceFilterDeviation: '1',
        dynamicPriceFilterDirection: 'under',
        dynamicPriceFilterUnderValue: '3',
      })
    ).toBeNull();
    // The engine arms the filter only with the deviation field set.
    expect(
      singlePositionAsapError({
        ...asap,
        useDynamicPriceFilter: true,
        dynamicPriceFilterDirection: 'under',
        dynamicPriceFilterUnderValue: '3',
      })
    ).not.toBeNull();
    expect(
      singlePositionAsapError({
        ...asap,
        useCooldown: true,
        cooldownAfterDealStart: true,
        cooldownAfterDealStartInterval: 5,
      })
    ).toBeNull();
    expect(
      singlePositionAsapError({ ...asap, startCondition: StartConditionEnum.ti })
    ).toBeNull();
    expect(singlePositionAsapError({ ...asap, singlePosition: false })).toBeNull();
  });

  it('a dynamic filter without a deviation for its direction does not count', () => {
    expect(
      singlePositionAsapError({
        ...asap,
        useDynamicPriceFilter: true,
        dynamicPriceFilterDirection: 'overAndUnder',
        dynamicPriceFilterOverValue: '2',
        dynamicPriceFilterUnderValue: '',
      })
    ).toBe(SINGLE_POSITION_ASAP_REASON);
    // A cooldown switched on without the start part is not spacing either.
    expect(
      singlePositionAsapError({ ...asap, useCooldown: true })
    ).toBe(SINGLE_POSITION_ASAP_REASON);
  });

  it('each one-click fix clears the error', () => {
    const dyn = { ...asap, ...enableDynamicPriceFilterPatch(asap) };
    expect(dyn.useDynamicPriceFilter).toBe(true);
    expect(singlePositionAsapError(dyn)).toBeNull();
    const both = {
      ...asap,
      dynamicPriceFilterDirection: 'overAndUnder',
    };
    expect(
      singlePositionAsapError({ ...both, ...enableDynamicPriceFilterPatch(both) })
    ).toBeNull();
    const cool = { ...asap, ...addStartCooldownPatch(asap) };
    expect(singlePositionAsapError(cool)).toBeNull();
    // Keeps an interval the user already set.
    expect(
      addStartCooldownPatch({ ...asap, cooldownAfterDealStartInterval: 15 })
    ).not.toHaveProperty('cooldownAfterDealStartInterval');
  });
});

describe('max entries and the entries label', () => {
  it('"" and "0" are no limit; the wire value is "0"', () => {
    expect(normalizeMaxPositionEntries('')).toBe('0');
    expect(normalizeMaxPositionEntries(' 5 ')).toBe('5');
    expect(maxPositionEntriesToForm('0')).toBe('');
    expect(maxPositionEntriesToForm(4)).toBe('4');
    expect(maxPositionEntriesToForm(undefined)).toBe('');
  });

  it('accepts whole numbers only', () => {
    expect(maxPositionEntriesError('')).toBeNull();
    expect(maxPositionEntriesError('3')).toBeNull();
    expect(maxPositionEntriesError('2.5')).toMatch(/whole number/);
    expect(maxPositionEntriesError('-1')).toMatch(/whole number/);
  });

  it('formats "3/5", or "3" without a limit', () => {
    expect(formatPositionEntries(3, '5')).toBe('3/5');
    expect(formatPositionEntries(3, '')).toBe('3');
    expect(formatPositionEntries(3, '0')).toBe('3');
  });
});

describe('save and move routing', () => {
  it('only an off → on save asks for the adoption confirmation', () => {
    expect(isTurningSinglePositionOn(false, true)).toBe(true);
    expect(isTurningSinglePositionOn(undefined, true)).toBe(true);
    expect(isTurningSinglePositionOn(true, true)).toBe(false);
    expect(isTurningSinglePositionOn(false, false)).toBe(false);
  });

  it('recognises the server refusal that needs adoptOpenDeals', () => {
    expect(
      isMultiDealRefusal('Single position: more than one open deal on BTCUSDT')
    ).toBe(true);
    expect(
      isMultiDealRefusal(
        'Save failed: Single position: more than one open deal on BTCUSDT, ETHUSDT'
      )
    ).toBe(true);
    expect(
      isMultiDealRefusal('Start the bot to switch it to single position')
    ).toBe(false);
  });

  it('a move into a single-position bot holding the pair adopts; anything else merges', () => {
    const settings = {
      sp: { singlePosition: true },
      plain: { singlePosition: false },
      spEmpty: { singlePosition: true },
    };
    const positions = { sp: { _id: 'pos-1' }, plain: { _id: 'other' } };
    expect(planMoveIntoBot('sp', settings, positions)).toEqual({
      mode: 'adopt',
      targetDealId: 'pos-1',
    });
    expect(planMoveIntoBot('plain', settings, positions)).toEqual({
      mode: 'merge',
    });
    expect(planMoveIntoBot('spEmpty', settings, positions)).toEqual({
      mode: 'merge',
    });
    expect(planMoveIntoBot('unknown', settings, positions)).toEqual({
      mode: 'merge',
    });
    expect(mergesIntoPositionLabel('BTCUSDT')).toBe(
      'Merges into your open BTCUSDT position'
    );
  });

  it('finds the open position on the pair, oldest first', () => {
    const deals = [
      longDeal('b', 2, 1, 1),
      longDeal('a', 1, 1, 1),
      longDeal('eth', 0, 1, 1, { symbol: 'ETHUSDT' }),
    ];
    expect(findPositionDeal(deals, 'BTC/USDT')?._id).toBe('a');
    expect(findPositionDeal(deals, 'BTCUSDT', ['a'])?._id).toBe('b');
    expect(findPositionDeal(deals, 'SOLUSDT')).toBeNull();
  });
});

describe('older backends (compatibility gate)', () => {
  const formFor = (
    type: BotTypesEnum.dca | BotTypesEnum.combo,
    supported: boolean,
    dca: Record<string, unknown> = {}
  ): BotFormData =>
    ({
      ...SHARED_FORM_DEFAULTS,
      singlePositionSupported: supported,
      type,
      pair: ['BTCUSDT'],
      exchangeUUID: 'exchange-uuid',
      dca: { ...DCA_FORM_DEFAULTS, ...dca },
      combo: { ...COMBO_FORM_DEFAULTS },
      grid: {},
    }) as unknown as BotFormData;

  it('sends neither field until the backend is known to have them', () => {
    const r = mapFormDataToPayload(
      formFor(BotTypesEnum.dca, false, { singlePosition: true }),
      { mode: 'edit' }
    );
    expect(r.success).toBe(true);
    expect(r.updatePayload).not.toHaveProperty('singlePosition');
    expect(r.updatePayload).not.toHaveProperty('maxPositionEntries');
  });

  it('sends both for a DCA bot on a backend that has them ("" → "0")', () => {
    const r = mapFormDataToPayload(
      formFor(BotTypesEnum.dca, true, {
        singlePosition: true,
        maxPositionEntries: '',
      }),
      { mode: 'edit' }
    );
    expect(r.updatePayload).toMatchObject({
      singlePosition: true,
      maxPositionEntries: '0',
    });
  });

  it('never sends them for a combo bot', () => {
    const r = mapFormDataToPayload(formFor(BotTypesEnum.combo, true), {
      mode: 'edit',
    });
    expect(r.updatePayload).not.toHaveProperty('singlePosition');
    expect(r.updatePayload).not.toHaveProperty('maxPositionEntries');
  });

  it('reads an absent field as off (the shared fragments never select it)', () => {
    const { formData } = mapBotSettingsToFormData(BotTypesEnum.dca, {
      settings: { name: 'x', pair: ['BTCUSDT'] },
    });
    expect(formData.dca.singlePosition).toBe(false);
    expect(formData.dca.maxPositionEntries).toBe('');
    const loaded = mapBotSettingsToFormData(BotTypesEnum.dca, {
      settings: {
        name: 'x',
        pair: ['BTCUSDT'],
        singlePosition: true,
        maxPositionEntries: '0',
      },
    });
    expect(loaded.formData.dca.singlePosition).toBe(true);
    expect(loaded.formData.dca.maxPositionEntries).toBe('');
  });

  it('a schema rejection reads as "old", an execution error as "new", anything else is retried', () => {
    expect(
      classifySinglePositionError(
        new Error(
          'GraphQL errors: Cannot query field "singlePosition" on type "DCABotSettings".'
        )
      )
    ).toBe('old');
    expect(
      classifySinglePositionError(new Error('GraphQL errors: Bot not found'))
    ).toBe('new');
    expect(classifySinglePositionError(new Error('Failed to fetch'))).toBe(
      'transport'
    );
  });

  it('asks about several bots in one aliased document, or just probes', () => {
    const many = buildSinglePositionSettingsDocument(['a', 'b']);
    expect(many.query).toContain('b0: getDCABotSettings(input: $b0)');
    expect(many.query).toContain('b1: getDCABotSettings(input: $b1)');
    expect(many.variables).toEqual({ b0: { botId: 'a' }, b1: { botId: 'b' } });
    const probe = buildSinglePositionSettingsDocument([]);
    expect(probe.ids).toEqual([PROBE_BOT_ID]);
    expect(
      parseSinglePositionAnswer(['a', 'b', PROBE_BOT_ID], {
        b0: { data: { settings: { singlePosition: true, maxPositionEntries: '0' } } },
        b1: { data: { settings: { singlePosition: null, maxPositionEntries: '4' } } },
        b2: null,
      })
    ).toEqual({
      a: { singlePosition: true, maxPositionEntries: '' },
      b: { singlePosition: false, maxPositionEntries: '4' },
    });
  });

  it('fetchSinglePositionSettings: old backend → "old" without throwing', async () => {
    const client = {
      request: async () => {
        throw new Error('GraphQL errors: Cannot query field "singlePosition"');
      },
    } as unknown as GraphQLClient;
    await expect(fetchSinglePositionSettings(client, [])).resolves.toEqual({
      backend: 'old',
      byBot: {},
    });
    const failing = {
      request: async () => {
        throw new Error('Failed to fetch');
      },
    } as unknown as GraphQLClient;
    await expect(fetchSinglePositionSettings(failing, ['a'])).rejects.toThrow(
      'Failed to fetch'
    );
  });
});

describe('form validation blocks the save', () => {
  const formData = (dca: Record<string, unknown>) =>
    ({
      ...SHARED_FORM_DEFAULTS,
      singlePositionSupported: true,
      type: BotTypesEnum.dca,
      name: 'Bot',
      pair: ['BTCUSDT'],
      exchangeUUID: 'exchange-uuid',
      dca: { ...DCA_FORM_DEFAULTS, ...dca },
      combo: { ...COMBO_FORM_DEFAULTS },
      grid: {},
    }) as unknown as BotFormData;

  it('ASAP without spacing is an error on the toggle', () => {
    const { errors } = validateDcaFormData(
      formData({ singlePosition: true, startCondition: StartConditionEnum.asap })
    );
    expect(errors['singlePosition']).toBe(SINGLE_POSITION_ASAP_REASON);
  });

  it('"Stop after X deals opened" is refused while single position is on', () => {
    const { errors } = validateDcaFormData(
      formData({
        singlePosition: true,
        startCondition: StartConditionEnum.manual,
        useBotController: true,
        useCloseAfterXopen: true,
      })
    );
    expect(errors['closeAfterXopen']).toBe(
      SINGLE_POSITION_CLOSE_AFTER_OPENED_MESSAGE
    );
    expect(errors['singlePosition']).toBeUndefined();
  });

  it('says nothing when the setting is off or the backend lacks it', () => {
    const off = validateDcaFormData(
      formData({ singlePosition: false, startCondition: StartConditionEnum.asap })
    );
    expect(off.errors['singlePosition']).toBeUndefined();
    const old = validateDcaFormData({
      ...formData({
        singlePosition: true,
        startCondition: StartConditionEnum.asap,
      }),
      singlePositionSupported: false,
    });
    expect(old.errors['singlePosition']).toBeUndefined();
  });
});
