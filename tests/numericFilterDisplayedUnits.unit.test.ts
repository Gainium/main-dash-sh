import { test, expect } from '@playwright/test';

import { createEnhancedColumnFilter } from '@/components/ui/data-table/filter-logic';

// A number column whose accessor holds a different unit than the cell shows —
// a ratio rendered as a percent — declares `meta.getNumericFilterValue` so the
// numeric operators compare what the user reads on screen. Without it `> 5`
// against a raw 0.053 matched nothing.

type Row = { ratio: number | null };

const withHook = createEnhancedColumnFilter({
  filterType: 'number',
  getNumericFilterValue: (r: unknown) => {
    const { ratio } = r as Row;
    return ratio === null ? null : ratio * 100;
  },
});
const withoutHook = createEnhancedColumnFilter({ filterType: 'number' });

const ROWS: Row[] = [{ ratio: 0.02 }, { ratio: 0.053 }, { ratio: -0.1 }];

const apply = (
  fn: ReturnType<typeof createEnhancedColumnFilter>,
  rows: Row[],
  filter: { operator: string; value: unknown }
) =>
  rows
    .filter((r) => fn({ original: r, getValue: () => r.ratio }, 'ratio', filter))
    .map((r) => r.ratio);

test('numeric operators compare the displayed value', () => {
  expect(
    apply(withHook, ROWS, { operator: 'greaterThan', value: '5' })
  ).toEqual([0.053]);
  expect(
    apply(withHook, ROWS, { operator: 'between', value: [-20, 3] })
  ).toEqual([0.02, -0.1]);
});

test('without the hook the raw accessor value is compared', () => {
  expect(
    apply(withoutHook, ROWS, { operator: 'greaterThan', value: '5' })
  ).toEqual([]);
});

test('a null displayed value counts as empty', () => {
  expect(
    apply(withHook, [{ ratio: null }, { ratio: 0.1 }], {
      operator: 'isEmpty',
      value: 'true',
    })
  ).toEqual([null]);
});

test('an empty cell never matches a numeric comparison', () => {
  const rows: Row[] = [{ ratio: null }, { ratio: 0.001 }];
  expect(apply(withHook, rows, { operator: 'lessThan', value: '1' })).toEqual([
    0.001,
  ]);
  expect(
    apply(withHook, rows, { operator: 'between', value: [-5, 5] })
  ).toEqual([0.001]);
});

test('an unavailable (-Infinity) sort value is blank to the filter', () => {
  const fn = createEnhancedColumnFilter({ filterType: 'number' });
  const rows = [Number.NEGATIVE_INFINITY, -3, Number.POSITIVE_INFINITY];
  const match = (operator: string, value: unknown) =>
    rows.filter((v) =>
      fn({ original: {}, getValue: () => v }, 'x', { operator, value })
    );
  expect(match('lessThan', '0')).toEqual([-3]);
  expect(match('greaterThan', '2')).toEqual([Number.POSITIVE_INFINITY]);
});
