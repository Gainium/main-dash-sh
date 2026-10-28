/**
 * Run from the parent:
 * `NODE_ENV=development npx vitest run core/tests/hedgePickLegFormData.vitest.test.ts`.
 *
 * The hedge backtest snapshot reads each leg's formData from the refs of the
 * mode on screen. After Quick → Manual the Quick legs unmount but their ref
 * keeps the last Quick values; reading it first made a Manual backtest run
 * the Quick short leg (base order 0) and fail with "Short leg: base order
 * size must be greater than 0".
 */
import { describe, expect, it } from 'vitest';
import { pickLegFormData } from '../src/pages/hedge-bots/pickLegFormData';
import type { BotFormData } from '../src/types/bots/form';

const leg = (baseOrderSize: string) =>
  ({ dca: { baseOrderSize } }) as unknown as BotFormData;

describe('pickLegFormData', () => {
  it('Manual mode ignores a stale Quick ref', () => {
    const quick = leg('0.00');
    const manual = leg('60');
    expect(
      pickLegFormData('manual', { quick, manual, seed: undefined })
    ).toBe(manual);
  });

  it('Manual mode falls back to the seed for an unmounted leg, not the Quick ref', () => {
    const seed = leg('25');
    expect(
      pickLegFormData('manual', { quick: leg('0.00'), manual: null, seed })
    ).toBe(seed);
  });

  it('Quick mode reads the Quick ref, not a stale Manual ref', () => {
    const quick = leg('0.05');
    expect(
      pickLegFormData('quick', { quick, manual: leg('60'), seed: undefined })
    ).toBe(quick);
  });

  it('returns null when nothing is published or seeded', () => {
    expect(
      pickLegFormData('manual', { quick: null, manual: null, seed: undefined })
    ).toBeNull();
  });
});
