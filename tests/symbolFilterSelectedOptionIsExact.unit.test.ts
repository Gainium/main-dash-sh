import { test, expect } from '@playwright/test';

import { createEnhancedColumnFilter } from '@/components/ui/data-table/filter-logic';
import { SYMBOL_COLUMN_FILTER_META } from '@/components/widgets/shared/symbolColumnFilterMeta';

// Deals/trades tables: picking ONE symbol from the Symbol column's multi-select
// ("Is any of") also returned every other symbol that CONTAINS it as a
// substring — selecting `AKE-USD` also returned the `CAKE-USD` row, selecting
// `BTC/USDT` also returned `WBTC/USDT`. `isNoneOf` has the inverse bug and
// silently HIDES those rows.
//
// The column declares `meta.getOptionValue` (the canonical per-row value that
// the dropdown offers as a discrete choice). A value that is a substring of a
// row's canonical value can only have come from that option list — the
// multi-select snaps a typed term to a matching option and only ever stores
// raw free text when it matches NO option — so such a value must be compared
// EXACTLY. Free text that matches no option keeps the generous substring path
// over `getFilterValue`'s variants (symbol / pair / base / quote / unslashed).

const filterFn = createEnhancedColumnFilter(SYMBOL_COLUMN_FILTER_META);

const row = (symbol: string, pair: string) => ({ symbol, pair });

const apply = (
  rows: ReturnType<typeof row>[],
  operator: 'isAnyOf' | 'isNoneOf',
  value: string[]
) =>
  rows
    .filter((r) =>
      filterFn({ original: r, getValue: () => r.symbol }, 'symbol', {
        operator,
        value,
      })
    )
    .map((r) => r.symbol);

const DASHED = [
  row('AKE-USD', 'AKEUSD'),
  row('CAKE-USD', 'CAKEUSD'),
  row('GAIB-USD', 'GAIBUSD'),
];

const SLASHED = [
  row('BTC/USDT', 'BTCUSDT'),
  row('WBTC/USDT', 'WBTCUSDT'),
  row('ETH/USDT', 'ETHUSDT'),
];

test('isAnyOf on a selected symbol returns only that symbol (short ticker)', () => {
  expect(apply(DASHED, 'isAnyOf', ['AKE-USD'])).toEqual(['AKE-USD']);
});

test('isAnyOf on a selected symbol returns only that symbol (slashed pair)', () => {
  expect(apply(SLASHED, 'isAnyOf', ['BTC/USDT'])).toEqual(['BTC/USDT']);
});

test('isNoneOf on a selected symbol hides only that symbol (short ticker)', () => {
  expect(apply(DASHED, 'isNoneOf', ['AKE-USD'])).toEqual([
    'CAKE-USD',
    'GAIB-USD',
  ]);
});

test('isNoneOf on a selected symbol hides only that symbol (slashed pair)', () => {
  expect(apply(SLASHED, 'isNoneOf', ['BTC/USDT'])).toEqual([
    'WBTC/USDT',
    'ETH/USDT',
  ]);
});

test('selecting several symbols returns exactly those rows', () => {
  expect(apply(DASHED, 'isAnyOf', ['AKE-USD', 'GAIB-USD'])).toEqual([
    'AKE-USD',
    'GAIB-USD',
  ]);
});

// --- the substring path that must survive --------------------------------
//
// These inputs cannot come from the option list (the dropdown offers only
// canonical symbols), so they are free text typed and Enter-ed, and they keep
// matching against `getFilterValue`'s variants.

test('free text matching no option still matches via the symbol variants', () => {
  // `BTCUSDT` is not a substring of any canonical option (`BTC/USDT` has a
  // slash), so the multi-select stores it verbatim rather than snapping it to
  // an option. It must still reach the BTC/USDT row through the unslashed
  // variant — free text keeps the generous substring semantics, which is why
  // it also (correctly, for a typed term) reaches WBTC/USDT.
  expect(apply(SLASHED, 'isAnyOf', ['BTCUSDT'])).toEqual([
    'BTC/USDT',
    'WBTC/USDT',
  ]);
});

test('a bare asset that IS a substring of an option is treated as an option', () => {
  // Deliberate, and the whole point of the fix: `GAIB` is a substring of the
  // `GAIB-USD` option, so it is treated as a picked option and compared
  // exactly — it matches nothing. This is the same rule that stops `AKE-USD`
  // from returning `CAKE-USD`; the two cases are indistinguishable from a
  // single row, so exactness wins.
  //
  // No live path produces this: clicking an option stores the full symbol, and
  // typing `GAIB` + Enter SNAPS to the `GAIB-USD` option before storing. It is
  // only reachable from a `filters_<tableId>` link saved before #814, when the
  // dropdown still offered bare assets as choices.
  expect(apply(DASHED, 'isAnyOf', ['GAIB'])).toEqual([]);
  expect(apply(DASHED, 'isAnyOf', ['GAIB-USD'])).toEqual(['GAIB-USD']);
});

test('a column without getOptionValue keeps the substring behaviour', () => {
  const legacy = createEnhancedColumnFilter({
    filterType: 'array',
    getFilterValue: SYMBOL_COLUMN_FILTER_META.getFilterValue,
  });
  const matched = DASHED.filter((r) =>
    legacy({ original: r, getValue: () => r.symbol }, 'symbol', {
      operator: 'isAnyOf',
      value: ['AKE-USD'],
    })
  ).map((r) => r.symbol);
  expect(matched).toEqual(['AKE-USD', 'CAKE-USD']);
});

test('an empty selection matches every row', () => {
  expect(apply(DASHED, 'isAnyOf', [])).toEqual([
    'AKE-USD',
    'CAKE-USD',
    'GAIB-USD',
  ]);
});
