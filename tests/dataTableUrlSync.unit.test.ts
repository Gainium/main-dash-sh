import { test, expect } from '@playwright/test';

import type { ColumnFiltersState } from '@tanstack/react-table';

import {
  deserializeFilters,
  deserializeSorting,
  serializeFilters,
} from '@/components/ui/data-table/urlSync';

/**
 * Round-trip guarantees for the DataTable's `filters_<tableId>` URL param.
 *
 * The regression these lock: the quick-filter UI stores a column's filter as an
 * ARRAY of `{ operator, value }` conditions, but the serializer only understood
 * a bare scalar or a single condition object. An array fell through both
 * branches, so it emitted the column id alone ("name"). On the next load the
 * generic reader parsed that token as SORTING (`[{ id: 'name', desc: false }]`),
 * which still passed the `Array.isArray` check in <DataTable> and was written
 * back as the column filters — wiping the user's filters on every reload.
 * Reported as "the B shortcut clears the bot filters", since the nav shortcut
 * for the page you are already on triggers a full reload.
 */
test.describe('data-table urlSync filters', () => {
  test('round-trips the array-of-conditions shape the filter UI writes', () => {
    const filters: ColumnFiltersState = [
      { id: 'name', value: [{ operator: 'contains', value: 'BTC' }] },
    ];

    const encoded = serializeFilters(filters);
    expect(encoded).toBe('name:contains:BTC');
    expect(deserializeFilters<ColumnFiltersState>(encoded)).toEqual(filters);
  });

  test('never emits a bare column id for an unreadable condition', () => {
    // A valueless token is what got misread as sorting. Anything we cannot
    // describe must be dropped instead.
    expect(serializeFilters([{ id: 'name', value: [{ nonsense: true }] }])).toBe(
      ''
    );
    expect(serializeFilters([{ id: 'name', value: null }])).toBe('');
    expect(serializeFilters([{ id: '', value: 'x' }])).toBe('');
  });

  test('a filters param is never parsed as sorting', () => {
    // The exact corruption path: 'name' must not deserialize into a filter.
    expect(deserializeFilters<ColumnFiltersState>('name')).toBeNull();
    // ...while the sorting reader still accepts it, since that IS its format.
    expect(deserializeSorting('name')).toEqual([{ id: 'name', desc: false }]);
  });

  test('keeps several conditions on the same column', () => {
    const filters: ColumnFiltersState = [
      {
        id: 'name',
        value: [
          { operator: 'contains', value: 'BTC' },
          { operator: 'notContains', value: 'USDC' },
        ],
      },
      { id: 'exchange', value: [{ operator: 'equals', value: 'binance' }] },
    ];

    const encoded = serializeFilters(filters);
    expect(encoded).toBe(
      'name:contains:BTC|name:notContains:USDC|exchange:equals:binance'
    );
    expect(deserializeFilters<ColumnFiltersState>(encoded)).toEqual(filters);
  });

  test('preserves numeric values so `between` stays a number range', () => {
    // filter-logic picks its numeric-vs-date branch off `typeof value[0]`, so
    // stringifying [10, 20] would turn a number range into a date comparison.
    const filters: ColumnFiltersState = [
      { id: 'profit', value: [{ operator: 'between', value: [10, 20.5] }] },
    ];

    const restored =
      deserializeFilters<ColumnFiltersState>(serializeFilters(filters)) ?? [];
    expect(restored).toEqual(filters);
    const range = (restored[0].value as { value: unknown[] }[])[0].value;
    expect(typeof range[0]).toBe('number');
  });

  test('preserves string arrays for isAnyOf, including embedded separators', () => {
    const filters: ColumnFiltersState = [
      {
        id: 'pair',
        value: [{ operator: 'isAnyOf', value: ['BTC/USDT', 'a,b', 'c|d'] }],
      },
    ];

    expect(
      deserializeFilters<ColumnFiltersState>(serializeFilters(filters))
    ).toEqual(filters);
  });

  test('round-trips values containing the format separators', () => {
    const filters: ColumnFiltersState = [
      { id: 'name', value: [{ operator: 'contains', value: 'a:b|c' }] },
    ];

    expect(
      deserializeFilters<ColumnFiltersState>(serializeFilters(filters))
    ).toEqual(filters);
  });

  test('valueless operators round-trip without a value part', () => {
    const filters: ColumnFiltersState = [
      { id: 'note', value: [{ operator: 'isEmpty' }] },
    ];

    expect(serializeFilters(filters)).toBe('note:isEmpty');
    expect(deserializeFilters<ColumnFiltersState>('note:isEmpty')).toEqual(
      filters
    );
  });

  test('still reads links written by the previous format', () => {
    // Legacy: scalar value, unmarked. Normalized into the array shape, which
    // the filter fn treats identically.
    expect(deserializeFilters<ColumnFiltersState>('name:contains:BTC')).toEqual([
      { id: 'name', value: [{ operator: 'contains', value: 'BTC' }] },
    ]);
    // Legacy: multi-value operator as a comma-joined list.
    expect(
      deserializeFilters<ColumnFiltersState>(
        'pair:isAnyOf:BTC%2FUSDT,ETH%2FUSDT'
      )
    ).toEqual([
      {
        id: 'pair',
        value: [{ operator: 'isAnyOf', value: ['BTC/USDT', 'ETH/USDT'] }],
      },
    ]);
  });

  test('normalizes a legacy bare-scalar column filter', () => {
    expect(serializeFilters([{ id: 'name', value: 'BTC' }])).toBe(
      'name:contains:BTC'
    );
  });

  test('empty input serializes to nothing and reads back as null', () => {
    expect(serializeFilters([])).toBe('');
    expect(serializeFilters(undefined)).toBe('');
    expect(deserializeFilters('')).toBeNull();
    expect(deserializeFilters(null)).toBeNull();
  });
});
