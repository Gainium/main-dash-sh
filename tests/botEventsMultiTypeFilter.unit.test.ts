import { test, expect } from '@playwright/test';

import {
  EMPTY_BOT_EVENT_FILTERS,
  botEventTypesLabel,
  buildBotEventsQuery,
  countActiveBotEventFilters,
  parseBotEventTypes,
  type BotEventFilters,
} from '@/lib/botEventFilters';

// Bot Events tab: the Type filter is a multi-select whose result is the UNION
// of the chosen types, still AND-ed with From/To, Pair and search.
// - One type, or Errors + Warnings, fit the generic filter model (one AND
//   list), so they go out exactly as the single-select did — nothing that
//   works against today's backend depends on the new `types` input.
// - Any other mix (Orders + Errors, Deals + Warnings, …) is not expressible
//   in that model and is sent as `types` for the backend to OR.

const f = (patch: Partial<BotEventFilters>): BotEventFilters => ({
  ...EMPTY_BOT_EVENT_FILTERS,
  ...patch,
});

test('no type selected = all types: no type filter at all', () => {
  expect(buildBotEventsQuery(f({}))).toEqual({ category: undefined });
});

test('a single type is sent exactly as the single-select sent it', () => {
  expect(buildBotEventsQuery(f({ types: ['errors'] })).filterModel).toEqual({
    items: [{ id: 'type', field: 'type', operator: 'equals', value: 'error' }],
  });
  expect(buildBotEventsQuery(f({ types: ['warnings'] })).filterModel).toEqual({
    items: [
      { id: 'type', field: 'type', operator: 'equals', value: 'warning' },
    ],
  });
  expect(buildBotEventsQuery(f({ types: ['orders'] })).filterModel).toEqual({
    items: [
      {
        id: 'type',
        field: 'event',
        operator: 'isAnyOf',
        value: 'Order,Order error,Take Profit,Stop Loss',
      },
    ],
  });
  const deals = buildBotEventsQuery(f({ types: ['deals'] }));
  expect(deals.category).toBe('deals');
  expect(deals.filterModel).toBeUndefined();
  for (const t of ['errors', 'warnings', 'orders', 'deals'] as const) {
    expect(buildBotEventsQuery(f({ types: [t] })).types).toBeUndefined();
  }
});

test('Errors + Warnings is one "is any of" item — no backend change needed', () => {
  const q = buildBotEventsQuery(
    f({ types: ['warnings', 'errors'], symbol: 'BTCUSDT' })
  );
  expect(q.types).toBeUndefined();
  expect(q.category).toBeUndefined();
  expect(q.filterModel).toEqual({
    items: [
      {
        id: 'type',
        field: 'type',
        operator: 'isAnyOf',
        value: 'error,warning',
      },
      { id: 'symbol', field: 'symbol', operator: 'equals', value: 'BTCUSDT' },
    ],
  });
});

test('a mixed selection goes out as a `types` union, AND-ed with the rest', () => {
  const q = buildBotEventsQuery(
    f({
      types: ['errors', 'orders'],
      symbol: 'BTCUSDT',
      from: '2026-11-01T00:00',
    })
  );
  // Order follows the option list, not the click order.
  expect(q.types).toEqual(['orders', 'errors']);
  expect(q.category).toBeUndefined();
  expect(q.filterModel?.linkOperator).toBeUndefined();
  expect(q.filterModel?.items.map((i) => i.id)).toEqual(['from', 'symbol']);

  expect(buildBotEventsQuery(f({ types: ['deals', 'warnings'] }))).toEqual({
    category: undefined,
    types: ['deals', 'warnings'],
  });
});

test('search with a mixed selection matches the description only', () => {
  const q = buildBotEventsQuery(
    f({ types: ['orders', 'errors'], search: ' x-ABC ' })
  );
  expect(q.types).toEqual(['orders', 'errors']);
  expect(q.filterModel).toEqual({
    items: [
      {
        id: 'search-description',
        field: 'description',
        operator: 'contains',
        value: 'x-ABC',
      },
    ],
  });
  // Search alone keeps its name-or-description OR.
  expect(buildBotEventsQuery(f({ search: 'x' })).filterModel?.linkOperator).toBe(
    'or'
  );
});

test('stored / linked selections: old single values still load', () => {
  expect(parseBotEventTypes('errors')).toEqual(['errors']);
  expect(parseBotEventTypes('warnings')).toEqual(['warnings']);
  expect(parseBotEventTypes('all')).toEqual([]);
  expect(parseBotEventTypes('warnings,errors,warnings')).toEqual([
    'errors',
    'warnings',
  ]);
  expect(parseBotEventTypes(['deals', 'orders'])).toEqual(['orders', 'deals']);
  expect(parseBotEventTypes('bogus')).toBeNull();
  expect(parseBotEventTypes(null)).toBeNull();
});

test('the Filters badge counts Type once however many are selected', () => {
  expect(countActiveBotEventFilters(f({ types: ['orders'] }))).toBe(1);
  expect(
    countActiveBotEventFilters(
      f({ types: ['orders', 'deals', 'errors'], symbol: 'BTCUSDT' })
    )
  ).toBe(2);
});

test('Type control label', () => {
  expect(botEventTypesLabel([])).toBe('All types');
  expect(botEventTypesLabel(['warnings'])).toBe('Warnings');
  expect(botEventTypesLabel(['errors', 'warnings'])).toBe('2 types');
});
