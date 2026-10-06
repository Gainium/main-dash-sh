/**
 * A grid budget below the minimum every level needs must block save.
 *
 * Paper Hyperliquid UNI-USDC, 20 geometric levels 7.9968–9.774, fixed in
 * base, min notional 10 USDC, qty step 0.1: the engine refused the start
 * with "Budget 200 USDC is below the minimum 230.2 USDC …" while the form
 * had saved 200 (= 10 × 20, the exchange-minimum bump's old target).
 */
import { describe, expect, it } from 'vitest';

import { computeGridBudgetRange } from '@/utils/bots/grid/budget-ranges';
import { validateGridFormData } from '@/utils/bots/grid/validation';

const grid = {
  budget: 200,
  topPrice: 9.774,
  lowPrice: 7.9968,
  levels: 20,
} as Parameters<typeof validateGridFormData>[0]['grid'];

const base = {
  name: 'UNI grid',
  exchangeUUID: 'uuid',
  pair: ['UNI-USDC'],
};

const minBudget = computeGridBudgetRange({
  lowPrice: 7.9968,
  topPrice: 9.774,
  levels: 20,
  gridType: 'geometric',
  profitCurrency: 'quote',
  orderFixedIn: 'base',
  futures: true,
  latestPrice: 8.9,
  initialPrice: 8.9,
  pricePrecision: 4,
  quoteMinAmount: 10,
  baseMinAmount: 0.1,
  baseStep: 0.1,
})?.min;

describe('grid minimum budget validation', () => {
  it('computes the same minimum the engine refused with (230.2)', () => {
    expect(minBudget).toBeGreaterThan(230);
    expect(minBudget).toBeLessThanOrEqual(230.2);
  });

  it('blocks a budget below the minimum', () => {
    const { errors } = validateGridFormData({ ...base, grid, minBudget });
    expect(errors['budget']).toBe(
      `Min budget for these settings is ${minBudget}.`
    );
  });

  it('accepts a budget at the minimum', () => {
    const { errors } = validateGridFormData({
      ...base,
      grid: { ...grid, budget: minBudget },
      minBudget,
    });
    expect(errors['budget']).toBeUndefined();
  });

  it('skips the check when the minimum is unknown', () => {
    const { errors } = validateGridFormData({ ...base, grid, minBudget: null });
    expect(errors['budget']).toBeUndefined();
  });
});
