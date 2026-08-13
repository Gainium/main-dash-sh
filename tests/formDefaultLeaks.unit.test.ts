import { test, expect } from '@playwright/test';

import {
  COMBO_FORM_DEFAULTS,
  DCA_FORM_DEFAULTS,
  GRID_FORM_DEFAULTS,
  SHARED_FORM_DEFAULTS,
} from '@/contexts/bots/form/formDefaults';
import { mapFormDataToPayload } from '@/mappers/bots/dca/map-form-data-to-payload';
import {
  BotTypesEnum,
  CloseConditionEnum,
  IndicatorAction,
  IndicatorEnum,
} from '@/types';
import type { BotFormData } from '@/types/bots/form';

/**
 * `mapFormDataToBackend` returns `{ ...DCA_FORM_DEFAULTS, pair, name,
 * ...mappedFields }`. A field a mapper pushes to `fieldsSkipped` instead of
 * assigning therefore ships the FORM DEFAULT to the backend — not "nothing".
 * For every default that is truthy, a skip is a silent write.
 *
 * cdde20a fixed the first instance (`useMaxDealsPerHigherTimeframe`); these
 * cover the rest of the truthy defaults that some configuration skips.
 *
 * The generic probe in botFormRoundTrip.unit.test.ts cannot catch this class:
 * a payload carrying a value other than the one set is booked as "the forward
 * mapper normalized it", which is exactly what legitimate gating looks like.
 * Hence named tests.
 */

const buildFormData = (
  type: BotTypesEnum.dca | BotTypesEnum.combo,
  overrides: Record<string, unknown>
): BotFormData => {
  const base =
    type === BotTypesEnum.combo ? COMBO_FORM_DEFAULTS : DCA_FORM_DEFAULTS;

  return {
    ...SHARED_FORM_DEFAULTS,
    type,
    exchangeUUID: 'exchange-uuid',
    dca: { ...DCA_FORM_DEFAULTS, ...overrides },
    combo: { ...base, ...overrides },
    grid: GRID_FORM_DEFAULTS,
  } as unknown as BotFormData;
};

const payloadFor = (
  type: BotTypesEnum.dca | BotTypesEnum.combo,
  overrides: Record<string, unknown>
): Record<string, unknown> => {
  const result = mapFormDataToPayload(buildFormData(type, overrides), {
    mode: 'edit',
  });
  expect(result.success, JSON.stringify(result.errors)).toBe(true);
  return (result.updatePayload ?? {}) as Record<string, unknown>;
};

/**
 * feeOrder — the real defect of this class after the higher-timeframe one.
 *
 * The toggle is only visible for combo bots on spot (`experimental-toggles.ts`
 * gates it on `isComboBot && !isFutures`, the same condition the mapper used to
 * decide whether to write it). Everywhere else the mapper skipped it, so the
 * `feeOrder: true` sitting in DCA_FORM_DEFAULTS was written on every save —
 * even though the inbound mapper seeds the form with `false` when the bot has
 * no stored value. The DCA engine acts on the flag (it places separate fee
 * orders and adjusts balance accounting), so this was not an inert write.
 */
test.describe('feeOrder is not re-enabled by the defaults spread', () => {
  test('a DCA bot with the flag off keeps it off', () => {
    expect(payloadFor(BotTypesEnum.dca, { feeOrder: false })['feeOrder']).toBe(
      false
    );
  });

  test('a DCA bot with the flag on keeps it on', () => {
    expect(payloadFor(BotTypesEnum.dca, { feeOrder: true })['feeOrder']).toBe(
      true
    );
  });

  test('a combo bot on futures — where the toggle is hidden — keeps it off', () => {
    expect(
      payloadFor(BotTypesEnum.combo, { feeOrder: false, futures: true })[
        'feeOrder'
      ]
    ).toBe(false);
  });

  test('a combo bot on spot still maps the toggle in both positions', () => {
    expect(payloadFor(BotTypesEnum.combo, { feeOrder: false })['feeOrder']).toBe(
      false
    );
    expect(payloadFor(BotTypesEnum.combo, { feeOrder: true })['feeOrder']).toBe(
      true
    );
  });

  test('the KuCoin long override still forces it off where it is supported', () => {
    const result = mapFormDataToPayload(
      {
        ...buildFormData(BotTypesEnum.combo, { feeOrder: true }),
        exchangeUUID: 'kucoin-account',
      } as BotFormData,
      { mode: 'edit' }
    );

    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    expect(
      (result.updatePayload as Record<string, unknown>)['feeOrder']
    ).toBe(false);
  });
});

/**
 * riskUseTpRatio — audited, harmless, pinned so it stays that way.
 *
 * Its default is `true` and the whole Risk:Reward block returns `{}` when
 * `useRiskReward` is off, so the default does show through. That is inert: the
 * backend only consults the R:R fields when `useRiskReward` is set, and
 * `useRiskReward` itself defaults to `false`, so the flag it is gated behind is
 * written correctly. What must not regress is the enabled path, where the user
 * can actually see and clear the checkbox.
 */
test.describe('riskUseTpRatio survives when Risk:Reward is enabled', () => {
  const rrIndicator = {
    uuid: 'rr-1',
    type: IndicatorEnum.rsi,
    indicatorAction: IndicatorAction.riskReward,
    indicatorInterval: '15m',
    indicatorLength: 14,
    indicatorValue: '30',
    groupId: '',
  };

  for (const type of [BotTypesEnum.dca, BotTypesEnum.combo] as const) {
    test(`${type}: clearing the TP-ratio checkbox reaches the payload`, () => {
      const payload = payloadFor(type, {
        useRiskReward: true,
        riskUseTpRatio: false,
        indicators: [rrIndicator],
      });

      expect(payload['useRiskReward']).toBe(true);
      expect(payload['riskUseTpRatio']).toBe(false);
    });

    test(`${type}: keeping the TP-ratio checkbox reaches the payload`, () => {
      const payload = payloadFor(type, {
        useRiskReward: true,
        riskUseTpRatio: true,
        riskTpRatio: '2.5',
        indicators: [rrIndicator],
      });

      expect(payload['riskUseTpRatio']).toBe(true);
      expect(payload['riskTpRatio']).toBe('2.5');
    });
  }
});

/**
 * dynamicArLockValue — audited, harmless, pinned so it stays that way.
 *
 * Its default is `true` and the mapper only assigns it inside the dynamicAr
 * close-condition branch, so every other close condition ships `true`. That is
 * inert on two counts: the field has no UI control at all (the only reference
 * in TakeProfitSettings.tsx is commented out), and the backend only reads it
 * for the dynamicAr close mode — where the mapper does write the form's value.
 * The dynamicAr branch is the one that has to keep working.
 */
test.describe('dynamicArLockValue is honoured in the branch that uses it', () => {
  for (const value of [true, false] as const) {
    test(`dynamicAr close: the form's ${value} reaches the payload`, () => {
      const payload = payloadFor(BotTypesEnum.dca, {
        dealCloseCondition: CloseConditionEnum.dynamicAr,
        dynamicArLockValue: value,
      });

      expect(payload['dynamicArLockValue']).toBe(value);
    });
  }
});
