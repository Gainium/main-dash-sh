import { test, expect } from '@playwright/test';

import {
  COMBO_FORM_DEFAULTS,
  DCA_FORM_DEFAULTS,
  GRID_FORM_DEFAULTS,
  SHARED_FORM_DEFAULTS,
} from '@/contexts/bots/form/formDefaults';
import { mapFormDataToBackend } from '@/mappers/bots/dca/field-mapping';
import { mapBotSettingsToFormData } from '@/mappers/bots/dca/map-bot-settings-to-form-data';
import { mapGridBotSettingsToFormData } from '@/mappers/bots/grid/map-grid-bot-settings-to-form-data';
import {
  BotTypesEnum,
  CloseConditionEnum,
  DCAConditionEnum,
  IndicatorAction,
  IndicatorEnum,
  IndicatorsLogicEnum,
  StrategyEnum,
} from '@/types';
import type { BotFormData } from '@/types/bots/form';

/**
 * Named regressions for the defects a subagent sweep turned up after the
 * round-trip probe reached 163/163 on the flat fields. Every one of them lives
 * in a place that probe structurally cannot reach — which is the point: the
 * flat-field harness is necessary and not sufficient.
 *
 * Three of the four are the same shape as the two found before them: the
 * forward mapper writes the value, the REVERSE mapper never reads it, so the
 * setting saves and then shows the factory default on the next load. That
 * shape now has five confirmed instances (rrSlType, rrSlFixedValue,
 * fixedSlPrice/useFixedSLPrices, useLimitTimeout, grid strategy) and is the
 * first thing to check on any new form field.
 */

const build = (
  type: BotTypesEnum.dca | BotTypesEnum.combo,
  overrides: Record<string, unknown>
): BotFormData =>
  ({
    ...SHARED_FORM_DEFAULTS,
    type,
    exchangeUUID: 'exchange-uuid',
    dca: { ...DCA_FORM_DEFAULTS, ...overrides },
    combo: { ...COMBO_FORM_DEFAULTS, ...overrides },
    grid: GRID_FORM_DEFAULTS,
  }) as unknown as BotFormData;

/* ------------------------------------------------------------------------ */

/**
 * Every per-role mapper emits the FULL indicator list — its own role
 * serialized, all other roles passed through raw. The merge used to be "last
 * writer wins", so a raw passthrough overwrote another mapper's serialized
 * entry and the indicator lost every field the user had not touched. Whether
 * it happened depended only on which mapper ran last, so a single-role bot
 * looked fine and a two-role bot silently lost configuration.
 */
test.describe('indicator gap-fill survives a second indicator role', () => {
  const MAR_DCA = {
    uuid: 'mar-dca-1',
    type: IndicatorEnum.mar,
    indicatorAction: IndicatorAction.startDca,
    indicatorInterval: '1h',
    indicatorCondition: 'cd',
    indicatorValue: '0.99',
    groupId: '',
  };

  /**
   * A close indicator needs a non-empty groupId to survive
   * pruneUnusedCloseIndicators under the techInd close condition
   * (isCloseIndicatorUsedByCondition returns Boolean(groupId) there), and the
   * group has to exist or the group re-filter drops it. Without both, this
   * fixture is pruned before the merge is ever exercised and the test passes
   * vacuously.
   */
  const CLOSE_GROUP = {
    id: 'grp-close-1',
    logic: IndicatorsLogicEnum.and,
    action: IndicatorAction.closeDeal,
  };

  const ATR_CLOSE = {
    uuid: 'atr-close-1',
    type: IndicatorEnum.atr,
    indicatorAction: IndicatorAction.closeDeal,
    indicatorInterval: '1h',
    indicatorValue: '2',
    groupId: CLOSE_GROUP.id,
  };

  const indicatorFromPayload = (
    overrides: Record<string, unknown>,
    uuid: string
  ): Record<string, unknown> => {
    const result = mapFormDataToBackend(build(BotTypesEnum.dca, overrides), null);
    expect(result.errors, JSON.stringify(result.errors)).toEqual([]);
    const found = (result.data?.indicators ?? []).find(
      (i) => (i as unknown as Record<string, unknown>)['uuid'] === uuid
    );
    return (found ?? {}) as unknown as Record<string, unknown>;
  };

  const DCA_ONLY = {
    useDca: true,
    dcaCondition: DCAConditionEnum.indicators,
    indicators: [MAR_DCA],
  };

  const DCA_PLUS_CLOSE = {
    useDca: true,
    dcaCondition: DCAConditionEnum.indicators,
    dealCloseCondition: CloseConditionEnum.techInd,
    indicators: [MAR_DCA, ATR_CLOSE],
    indicatorGroups: [CLOSE_GROUP],
  };

  test('the MAR keeps every gap-filled field when a close indicator is added', () => {
    const alone = indicatorFromPayload(DCA_ONLY, 'mar-dca-1');
    const withClose = indicatorFromPayload(DCA_PLUS_CLOSE, 'mar-dca-1');

    const lost = Object.keys(alone)
      .filter((k) => !(k in withClose))
      .sort();

    expect(
      lost,
      `adding an unrelated close indicator stripped these fields from the MAR — a MAR saved without mar1length is silently re-tuned from a 20-period base MA to a 10:\n${lost.join(', ')}`
    ).toEqual([]);
  });

  test('the MAR is actually gap-filled in the first place', () => {
    // Guards the test above: if serialization stopped happening entirely both
    // sides would be equally bare and the comparison would pass vacuously.
    const alone = indicatorFromPayload(DCA_ONLY, 'mar-dca-1');
    for (const field of ['mar1type', 'mar1length', 'mar2type', 'mar2length']) {
      expect(alone[field], `${field} should be gap-filled`).toBeDefined();
    }
  });

  test('the later role is still serialized too — the fix is not just order-reversal', () => {
    const atr = indicatorFromPayload(DCA_PLUS_CLOSE, 'atr-close-1');
    expect(atr['keepConditionBars']).toBeDefined();
  });

  test('both indicators still reach the payload', () => {
    const result = mapFormDataToBackend(
      build(BotTypesEnum.dca, DCA_PLUS_CLOSE),
      null
    );
    expect(
      (result.data?.indicators ?? []).map((i) =>
        String((i as unknown as Record<string, unknown>)['uuid'])
      ).sort()
    ).toEqual(['atr-close-1', 'mar-dca-1']);
  });
});

/* ------------------------------------------------------------------------ */

test.describe('Enter Market Timeout reads back from the saved bot', () => {
  for (const type of [BotTypesEnum.dca, BotTypesEnum.combo] as const) {
    const section = type === BotTypesEnum.combo ? 'combo' : 'dca';

    test(`${type}: an enabled timeout comes back enabled`, () => {
      const back = mapBotSettingsToFormData(type, {
        useLimitTimeout: true,
        limitTimeout: '45',
      } as unknown as Record<string, unknown>).formData;

      expect(back[section].useLimitTimeout).toBe(true);
      expect(back[section].limitTimeout).toBe('45');
    });

    test(`${type}: a disabled timeout stays disabled`, () => {
      const back = mapBotSettingsToFormData(type, {
        useLimitTimeout: false,
        limitTimeout: '45',
      } as unknown as Record<string, unknown>).formData;

      expect(back[section].useLimitTimeout).toBe(false);
    });
  }

  test('a bot that never stored the flag infers it from the seconds', () => {
    const back = mapBotSettingsToFormData(BotTypesEnum.dca, {
      limitTimeout: '30',
    } as unknown as Record<string, unknown>).formData;
    expect(back.dca.useLimitTimeout).toBe(true);
  });
});

/* ------------------------------------------------------------------------ */

test.describe('grid bot direction reads back from the saved bot', () => {
  const gridSettings = (extra: Record<string, unknown>) =>
    ({
      topPrice: 200,
      lowPrice: 100,
      levels: 10,
      ...extra,
    }) as unknown as Parameters<typeof mapGridBotSettingsToFormData>[0];

  for (const strategy of [StrategyEnum.short, StrategyEnum.long] as const) {
    test(`a ${strategy} grid bot comes back ${strategy}`, () => {
      const back = mapGridBotSettingsToFormData(
        gridSettings({ strategy })
      ).formData;
      expect(back.grid.strategy).toBe(strategy);
    });
  }

  test('futuresStrategy is not clobbered when strategy is present', () => {
    // The same line used to test `strategy` and assign `futuresStrategy`, so a
    // payload carrying one and not the other wrote undefined over a good value.
    const back = mapGridBotSettingsToFormData(
      gridSettings({ strategy: StrategyEnum.short, futures: true })
    ).formData;
    expect(back.grid.futuresStrategy).toBeDefined();
  });
});
