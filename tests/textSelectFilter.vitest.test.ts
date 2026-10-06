/**
 * Runner: Vitest. `npx vitest run core/tests/textSelectFilter.vitest.test.ts`
 * from the cloud parent.
 *
 * Name-like columns (bot names, variable names) offer a pick list — "Is any
 * of" / "Is none of" — on top of the text operators. Picking a name must
 * match that name exactly, "Not contains" must survive, and a server-paged
 * table must send both negations instead of marking them "not applied".
 */
import { describe, expect, it } from 'vitest';
import { FILTER_OPERATORS } from '@/components/ui/data-table/filter-components';
import { createEnhancedColumnFilter } from '@/components/ui/data-table/filter-logic';
import { translateSingleFilter } from '@/lib/botList/serverFilters';
import { previewPage } from '@/lib/botList/windowPage';
import {
  CLOSED_DEAL_SERVER_FIELDS,
  dealBotNameOptions,
  withDealFilterOptions,
} from '@/lib/botList/dealListServerFields';

const names = ['Coinbase', 'Coinbase 2', 'Bybit grid', 'Kraken'];
const rows = names.map((botName) => ({ original: { botName }, botName }));
const filter = createEnhancedColumnFilter({
  filterType: 'textSelect',
  getOptionValue: (r: unknown) => (r as { botName: string }).botName,
});
const apply = (operator: string, value: unknown) =>
  rows
    .filter((r) =>
      filter(
        { getValue: () => r.botName, original: r.original },
        'botName',
        { operator, value }
      )
    )
    .map((r) => r.botName);

describe('textSelect operator set', () => {
  it('leads with the pick list and keeps every text operator', () => {
    const ids = FILTER_OPERATORS.textSelect.map((o) => o.id);
    expect(ids.slice(0, 2)).toEqual(['isAnyOf', 'isNoneOf']);
    for (const op of FILTER_OPERATORS.string.map((o) => o.id))
      expect(ids).toContain(op);
  });
});

describe('textSelect client-side matching', () => {
  it('isAnyOf on a picked name matches that name only', () => {
    expect(apply('isAnyOf', ['Coinbase'])).toEqual(['Coinbase']);
    expect(apply('isAnyOf', ['Coinbase', 'Kraken'])).toEqual(['Coinbase', 'Kraken']);
  });
  it('isNoneOf excludes exactly the picked names', () => {
    expect(apply('isNoneOf', ['Coinbase'])).toEqual(['Coinbase 2', 'Bybit grid', 'Kraken']);
  });
  it('notContains still works', () => {
    expect(apply('notContains', 'co')).toEqual(['Bybit grid', 'Kraken']);
  });
});

describe('server translation of text filters', () => {
  const spec = { field: 'botName', kind: 'text' as const };
  it('sends isNoneOf and notContains', () => {
    expect(translateSingleFilter(spec, { operator: 'isNoneOf', value: ['A', 'B'] })).toEqual([
      { field: 'botName', operator: 'isNoneOf', value: 'A,B' },
    ]);
    expect(translateSingleFilter(spec, { operator: 'notContains', value: ' co ' })).toEqual([
      { field: 'botName', operator: 'notContains', value: 'co' },
    ]);
  });
});

describe('window preview of text filters', () => {
  const deals = names.map((botName, i) => ({ _id: `d${i}`, botName }));
  const page = (op: string, value: string) =>
    previewPage(deals, {
      pageIndex: 0,
      pageSize: 50,
      filters: [{ field: 'botName', operator: op, value }],
    }).rows.map((d) => d.botName);
  it('applies isNoneOf / notContains / startsWith / endsWith', () => {
    expect(page('isNoneOf', 'Coinbase,Kraken')).toEqual(['Coinbase 2', 'Bybit grid']);
    expect(page('notContains', 'co')).toEqual(['Bybit grid', 'Kraken']);
    expect(page('startsWith', 'by')).toEqual(['Bybit grid']);
    expect(page('endsWith', ' 2')).toEqual(['Coinbase 2']);
  });
});

describe('server-paged Bot Name options', () => {
  it('offers the loaded deals’ bots plus the caller’s bots', () => {
    expect(dealBotNameOptions([[{ botName: 'Kraken' }, { botName: null }]], ['Coinbase'])).toEqual([
      'Coinbase',
      'Kraken',
    ]);
  });
  it('lands on the botName column only', () => {
    const f = withDealFilterOptions(CLOSED_DEAL_SERVER_FIELDS, { botNames: ['X'] });
    expect(f['botName']?.filterOptions).toEqual(['X']);
    expect(f['symbol']?.filterOptions).toBeUndefined();
  });
});
