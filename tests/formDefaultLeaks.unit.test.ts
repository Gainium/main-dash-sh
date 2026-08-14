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
 * `mapFormDataToBackend` USED TO return `{ ...DCA_FORM_DEFAULTS, pair, name,
 * ...mappedFields }`. A field a mapper pushed to `fieldsSkipped` instead of
 * assigning therefore shipped the FACTORY DEFAULT to the backend — not
 * "nothing". For every default that is truthy, a skip was a silent write, and
 * six of them reached customers before the pattern was recognised.
 *
 * Each was fixed by hand-writing "echo what the form is holding" into the one
 * mapper that had the hole. The fallback layer is now the live form slice
 * (`{ ...DCA_FORM_DEFAULTS, ...formData[dca|combo], ...mappedFields }`), which
 * generalises those point-fixes: an unmapped field is a no-op write of the
 * value the user is looking at, instead of a reset to the factory value.
 *
 * The tests below are the named regressions for the six. They are kept — and
 * must keep passing — because they assert the OUTCOME (the user's value
 * survives), not the mechanism, so they hold whichever layer supplies it.
 *
 * The generic probe in botFormRoundTrip.unit.test.ts could not catch this
 * class: a payload carrying a value other than the one set was booked as "the
 * forward mapper normalized it", which is exactly what legitimate gating looks
 * like. Hence named tests, plus the structural pin at the bottom of this file.
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

/**
 * The structural pin — the whole point of the six fixes above.
 *
 * Every test before this one names ONE field. That is how the bug class was
 * being worked: a customer reports a field that reverts, the mapper gap is
 * found, a test is added. Six rounds of that, and the seventh was still
 * waiting, because the defect was never in any individual mapper — it was in
 * the payload's fallback layer.
 *
 * These two tests assert the layer directly and without naming fields: take
 * EVERY field no mapper writes, give each a value different from the factory
 * default, and require the payload to carry the form's value. That is a
 * statement about the mechanism, so it covers the fields nobody has reported
 * yet — including any added after this was written.
 *
 * If someone restores a factory-default fallback, this fails with the full
 * list of fields it would silently revert, rather than waiting for a report.
 */
test.describe('no mapper gap can revert a field to its factory default', () => {
  /**
   * Gates that cannot be flipped on without a structured fixture (an indicator
   * list, a TP/SL target array). Flipping them just re-tests the mapper's
   * validation, which the named tests above already cover. Same exclusion the
   * round-trip probe makes for the same reason.
   */
  const NEEDS_FIXTURE = new Set([
    'useRiskReward',
    'useMultiTp',
    'useMultiSl',
    'useFixedTPPrices',
    'useFixedSLPrices',
  ]);

  /**
   * Removed from the payload on purpose, so "absent" is the correct outcome
   * here and not a revert — neither `change*BotInput` accepts them.
   * map-form-data-to-payload.ts strips both; botFormRoundTrip's VERDICT table
   * classifies them `by-design`.
   */
  const STRIPPED_BY_DESIGN = new Set(['useExperimental', 'avgPrice']);

  /** A value valid for the field's type but different from `current`. */
  const distinctFrom = (current: unknown): unknown | undefined => {
    if (typeof current === 'boolean') return !current;
    if (typeof current === 'number') return current + 7;
    if (typeof current === 'string') {
      if (current.trim() !== '' && !isNaN(Number(current))) {
        return String(Number(current) + 7);
      }
      // A non-numeric string is an enum member; the mapper may validate it, so
      // a made-up value is not safe. Covered by the round-trip probe instead.
      return undefined;
    }
    return undefined;
  };

  for (const type of [BotTypesEnum.dca, BotTypesEnum.combo] as const) {
    const defaults =
      type === BotTypesEnum.combo ? COMBO_FORM_DEFAULTS : DCA_FORM_DEFAULTS;

    test(`${type}: a field no mapper writes still ships the form's value`, () => {
      const result = mapFormDataToPayload(buildFormData(type, {}), {
        mode: 'edit',
      });
      expect(result.success, JSON.stringify(result.errors)).toBe(true);

      const mapped = new Set<string>(
        (result.mappingResult?.debugInfo?.fieldsMapped ?? []) as string[]
      );

      // Everything the mappers leave to the fallback layer.
      const unmapped = Object.entries(defaults).filter(
        ([key]) =>
          !mapped.has(key) &&
          !NEEDS_FIXTURE.has(key) &&
          !STRIPPED_BY_DESIGN.has(key)
      );
      expect(
        unmapped.length,
        'no unmapped fields to probe — the baseline changed'
      ).toBeGreaterThan(0);

      const overrides: Record<string, unknown> = {};
      for (const [key, value] of unmapped) {
        const probe = distinctFrom(value);
        if (probe !== undefined) overrides[key] = probe;
      }

      const payload = payloadFor(type, overrides);
      // `'8'` and `8` are the same saved value — mapFormDataToPayload coerces
      // the two order counts to numbers on the way out. Compare loosely so a
      // deliberate coercion doesn't read as a revert; a revert to the factory
      // default fails this comparison either way.
      const payloadFor_ = (key: string) => String(payload[key]);
      const reverted = Object.entries(overrides)
        .filter(([key, probe]) => payloadFor_(key) !== String(probe))
        .map(
          ([key, probe]) =>
            `${key}: form held ${JSON.stringify(probe)}, payload carried ${JSON.stringify(payload[key])} (factory default is ${JSON.stringify(defaults[key as keyof typeof defaults])})`
        );

      expect(
        reverted,
        `these fields were reverted on the way to the backend — a user's edit to any of them is silently lost:\n${reverted.join('\n')}`
      ).toEqual([]);
    });
  }
});
