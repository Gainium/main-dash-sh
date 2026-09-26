/**
 * Runner: Vitest. `npx vitest run core/tests/serverBotQuery.vitest.test.ts`
 * from the cloud parent.
 *
 * Spec: specs/065.large-account-ui-and-bot-list-paging.md §6 (parent repo).
 * The table query → server dataGridInput mapping used by server-paged bot lists.
 */
import { describe, expect, it } from 'vitest';
import {
  columnFilterToServerItems,
  tableQueryToServerBotQuery,
  toBotDataGridInput,
} from '@/lib/botList/serverBotQuery';
import { withServerFields } from '@/components/ui/data-table/serverSide';

const FIELDS = {
  name: { sort: 'settings.name', filter: 'settings.name' },
  created: { sort: 'created' },
  status: { sort: 'status', filter: 'status' },
};

describe('toBotDataGridInput (§6.1, §6.2, §6.4)', () => {
  it('pages 0-based and inverts the sort direction for the server', () => {
    expect(
      toBotDataGridInput({ pageIndex: 2, pageSize: 25, sort: { field: 'created', direction: 'desc' } })
    ).toEqual({ page: 2, pageSize: 25, sortModel: [{ field: 'created', sort: 'asc' }] });
  });

  it('maps the search box to a name "contains" filter', () => {
    expect(toBotDataGridInput({ pageIndex: 0, pageSize: 50, search: '  Farm-14 ' })).toEqual({
      page: 0,
      pageSize: 50,
      filterModel: { items: [{ field: 'settings.name', operator: 'contains', value: 'Farm-14' }] },
    });
  });
});

describe('tableQueryToServerBotQuery (§6.3)', () => {
  it('uses only columns that have a server field', () => {
    const q = tableQueryToServerBotQuery(
      {
        pageIndex: 1,
        pageSize: 25,
        sorting: [{ id: 'coinPair', desc: true }],
        columnFilters: [
          { id: 'status', value: ['open', 'error'] },
          { id: 'coinPair', value: ['BTC/USDT'] },
        ],
        globalFilter: 'x',
      },
      FIELDS
    );
    expect(q.sort).toBeNull();
    expect(q.filters).toEqual([{ field: 'status', operator: 'isAnyOf', value: 'open,error' }]);
    expect(q.search).toBe('x');
  });

  it('keeps the direction the user chose (inversion happens once, later)', () => {
    const q = tableQueryToServerBotQuery(
      { pageIndex: 0, pageSize: 25, sorting: [{ id: 'name', desc: true }], columnFilters: [], globalFilter: '' },
      FIELDS
    );
    expect(q.sort).toEqual({ field: 'settings.name', direction: 'desc' });
  });
});

describe('columnFilterToServerItems', () => {
  it('handles the operator shape and drops empties', () => {
    expect(columnFilterToServerItems('settings.name', { operator: 'contains', value: 'abc' })).toEqual([
      { field: 'settings.name', operator: 'contains', value: 'abc' },
    ]);
    expect(columnFilterToServerItems('status', { value: ['open'] })).toEqual([
      { field: 'status', operator: 'isAnyOf', value: 'open' },
    ]);
    expect(columnFilterToServerItems('x', '')).toEqual([]);
    expect(columnFilterToServerItems('x', { operator: 'contains', value: '' })).toEqual([]);
  });
});

describe('withServerFields', () => {
  it('annotates mapped columns by id or accessorKey and leaves the rest', () => {
    const cols = withServerFields(
      [{ accessorKey: 'name', meta: { description: 'd' } }, { id: 'status' }, { id: 'coinPair' }] as Array<{
        id?: string;
        accessorKey?: string;
        meta?: unknown;
      }>,
      FIELDS
    );
    expect(cols[0].meta).toEqual({ description: 'd', serverSortField: 'settings.name', serverFilterField: 'settings.name' });
    expect(cols[1].meta).toEqual({ serverSortField: 'status', serverFilterField: 'status' });
    expect(cols[2].meta).toBeUndefined();
  });
});
