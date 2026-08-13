import { test, expect } from '@playwright/test';

import {
  COMBO_FORM_DEFAULTS,
  DCA_FORM_DEFAULTS,
  GRID_FORM_DEFAULTS,
  SHARED_FORM_DEFAULTS,
} from '@/contexts/bots/form/formDefaults';
import { mapFormDataToPayload } from '@/mappers/bots/dca/map-form-data-to-payload';
import { BotTypesEnum } from '@/types';
import type { BotFormData } from '@/types/bots/form';

/**
 * "Limit deals per higher timeframe bar" turns back on after saving.
 *
 * mapFormDataToBackend spreads DCA_FORM_DEFAULTS (where the flag defaults to
 * true) underneath the mapped fields, so a mapper that only writes the flag
 * when it is ON leaves the default showing through — the payload carries `true`
 * for a user who just switched it off, and the reload brings it back.
 *
 * The generic round-trip probe cannot catch this: it sees the payload carrying
 * a different value than was set and books it as "the forward mapper normalized
 * it", which is the same shape as legitimate gating.
 */

const buildFormData = (
  type: BotTypesEnum.dca | BotTypesEnum.combo,
  overrides: Record<string, unknown>
): BotFormData => {
  const section = { ...DCA_FORM_DEFAULTS, ...overrides };
  const comboSection = { ...COMBO_FORM_DEFAULTS, ...overrides };

  return {
    ...SHARED_FORM_DEFAULTS,
    type,
    exchangeUUID: 'exchange-uuid',
    dca: section,
    combo: comboSection,
    grid: GRID_FORM_DEFAULTS,
  } as unknown as BotFormData;
};

for (const type of [BotTypesEnum.dca, BotTypesEnum.combo] as const) {
  test(`${type}: disabling the higher-timeframe limiter reaches the payload`, () => {
    const result = mapFormDataToPayload(
      buildFormData(type, { useMaxDealsPerHigherTimeframe: false }),
      { mode: 'edit' }
    );

    expect(result.success, JSON.stringify(result.errors)).toBe(true);

    const payload = (result.updatePayload ?? {}) as Record<string, unknown>;
    expect(payload['useMaxDealsPerHigherTimeframe']).toBe(false);
  });

  test(`${type}: enabling the higher-timeframe limiter reaches the payload`, () => {
    const result = mapFormDataToPayload(
      buildFormData(type, {
        useMaxDealsPerHigherTimeframe: true,
        maxDealsPerHigherTimeframe: '3',
      }),
      { mode: 'edit' }
    );

    expect(result.success, JSON.stringify(result.errors)).toBe(true);

    const payload = (result.updatePayload ?? {}) as Record<string, unknown>;
    expect(payload['useMaxDealsPerHigherTimeframe']).toBe(true);
    expect(payload['maxDealsPerHigherTimeframe']).toBe('3');
  });
}
