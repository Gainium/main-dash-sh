import { test, expect } from '@playwright/test';

import {
  COMBO_FORM_DEFAULTS,
  DCA_FORM_DEFAULTS,
  GRID_FORM_DEFAULTS,
  SHARED_FORM_DEFAULTS,
} from '@/contexts/bots/form/formDefaults';
import { mapGridFormDataToPayload } from '@/mappers/bots/grid/map-grid-form-data-to-payload';
import { BotTypesEnum } from '@/types';
import type { BotFormData } from '@/types/bots/form';

/**
 * Grid number inputs are free text, so whatever the user types reaches the
 * save mapper as a string. The mapper coerced it with `Number()`, which reads
 * a decimal comma (`1,5`) as NaN, and then defaulted NaN to 0 — while the
 * validator read the same string with `parseFloat`, which stops at the comma
 * and calls it valid. The bot was saved with 0 and nothing was shown.
 *
 * Spec: main-dash-redesign specs/081.grid-decimal-comma-saved-as-zero.md
 */

const formFor = (grid: Record<string, unknown>): BotFormData =>
  ({
    ...SHARED_FORM_DEFAULTS,
    name: 'Grid',
    pair: ['BTCUSDT'],
    type: BotTypesEnum.grid,
    exchangeUUID: 'exchange-uuid',
    dca: { ...DCA_FORM_DEFAULTS },
    combo: { ...COMBO_FORM_DEFAULTS },
    grid: {
      ...GRID_FORM_DEFAULTS,
      lowPrice: '100',
      topPrice: '200',
      levels: 10,
      gridStep: '1',
      budget: '1000',
      ...grid,
    },
  }) as unknown as BotFormData;

for (const mode of ['edit', 'create'] as const) {
  const save = (grid: Record<string, unknown>) => {
    const result = mapGridFormDataToPayload(formFor(grid), { mode });
    const payload = (
      mode === 'create' ? result.createPayload : result.updatePayload
    ) as Record<string, unknown> | undefined;
    return { result, payload };
  };

  test.describe(`grid number fields (${mode})`, () => {
    // §1.1 — a single comma is a decimal separator
    test('sell displacement 1,5 saves as 1.5%', () => {
      const { result, payload } = save({ sellDisplacement: '1,5' });
      expect(result.success).toBe(true);
      expect(payload?.['sellDisplacement']).toBe(0.015);
    });

    test('budget 1000,5 saves as 1000.5', () => {
      const { result, payload } = save({ budget: '1000,5' });
      expect(result.success).toBe(true);
      expect(payload?.['budget']).toBe(1000.5);
    });

    test('take profit 1,5 saves as 1.5%', () => {
      const { result, payload } = save({ tpSl: true, tpPerc: '1,5' });
      expect(result.success).toBe(true);
      expect(payload?.['tpPerc']).toBe(0.015);
    });

    test('grid step 0,5 saves as 0.5%', () => {
      const { result, payload } = save({ gridStep: '0,5' });
      expect(result.success).toBe(true);
      expect(payload?.['gridStep']).toBe(0.005);
    });

    // §1.2 — anything that is not a number is an error, never a silent 0
    test("sell displacement alert('x') is rejected with a field error", () => {
      const { result } = save({ sellDisplacement: "alert('x')" });
      expect(result.success).toBe(false);
      expect(result.errors?.join(' ')).toContain('Sell displacement');
    });

    test("grid step alert('x') is rejected with a field error", () => {
      const { result } = save({ gridStep: "alert('x')" });
      expect(result.success).toBe(false);
      expect(result.errors?.join(' ')).toContain('Grid step');
    });

    test('budget with trailing text is rejected, not truncated', () => {
      const { result } = save({ budget: '1000abc' });
      expect(result.success).toBe(false);
    });

    test('a value mixing comma and dot is rejected, not guessed', () => {
      const { result } = save({ budget: '1,000.5' });
      expect(result.success).toBe(false);
    });

    // §1.3 — values typed with a dot and empty optional fields are unchanged
    test('sell displacement 1.5 still saves as 1.5%', () => {
      const { result, payload } = save({ sellDisplacement: '1.5' });
      expect(result.success).toBe(true);
      expect(payload?.['sellDisplacement']).toBe(0.015);
    });

    test('an empty sell displacement still saves as 0', () => {
      const { result, payload } = save({ sellDisplacement: '' });
      expect(result.success).toBe(true);
      expect(payload?.['sellDisplacement']).toBe(0);
    });

    test('numeric (non-string) values still save unchanged', () => {
      const { result, payload } = save({ budget: 250, sellDisplacement: 0.2 });
      expect(result.success).toBe(true);
      expect(payload?.['budget']).toBe(250);
      expect(payload?.['sellDisplacement']).toBe(0.002);
    });
  });
}
