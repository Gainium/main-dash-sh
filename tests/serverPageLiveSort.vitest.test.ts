/**
 * Spec 147 (main-dash-redesign specs/): a server-paged table sorted by a column
 * whose cells show a LIVE value (open-deal Unrealized P&L / %) shows its page in
 * the order of those values. The server's sort and paging are unchanged.
 *
 * Run from the parent: NODE_ENV=development npx vitest run core/tests/serverPageLiveSort.vitest.test.ts
 */
import { describe, expect, it } from 'vitest';
import {
  createTable,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import {
  resortsServerPage,
  withServerFields,
} from '../src/components/ui/data-table/serverSide';
import {
  DRAWER_OPEN_DEAL_SERVER_FIELDS,
  OPEN_DEAL_SERVER_FIELDS,
} from '../src/lib/botList/dealListServerFields';

type Row = { sym: string; live: number; createdAt: number };

// The page as the server returned it for "-stats.unrealizedPercentNet": in SAVED
// order. The live values (what the cells show) disagree.
const page: Row[] = [
  { sym: 'AIN', live: 0.8, createdAt: 1 },
  { sym: 'CCD', live: 0.79, createdAt: 5 },
  { sym: 'B2', live: 0.37, createdAt: 2 },
  { sym: 'RSR', live: 0.05, createdAt: 9 },
  { sym: 'ADI', live: 0.1, createdAt: 3 },
  { sym: 'MET', live: 0.62, createdAt: 4 },
  { sym: 'SAFE', live: 0.06, createdAt: 8 },
  { sym: 'TIE', live: 0.37, createdAt: 7 },
];

const columns = withServerFields<ColumnDef<Row>>(
  [
    { id: 'unrealizedProfitPercentage', accessorFn: (r) => r.live },
    { id: 'createdTime', accessorFn: (r) => r.createdAt },
  ],
  {
    unrealizedProfitPercentage: OPEN_DEAL_SERVER_FIELDS.unrealizedProfitPercentage,
    createdTime: OPEN_DEAL_SERVER_FIELDS.createdTime,
  }
);

/** What DataTable does in server mode, with the spec-147 switch. */
const pageOrder = (sorting: SortingState) => {
  const table = createTable<Row>({
    data: page,
    columns,
    state: { sorting },
    onStateChange: () => {},
    renderFallbackValue: null,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    manualFiltering: true,
    manualSorting: !resortsServerPage(sorting, columns),
  });
  return table.getRowModel().rows.map((r) => r.original.sym);
};

describe('spec 147: server page re-sorted by the live value on screen', () => {
  it('§4.4 open-deal unrealized P&L columns are marked live, in both deal tables', () => {
    expect(OPEN_DEAL_SERVER_FIELDS.unrealizedProfit.liveSort).toBe(true);
    expect(OPEN_DEAL_SERVER_FIELDS.unrealizedProfitPercentage.liveSort).toBe(true);
    expect(DRAWER_OPEN_DEAL_SERVER_FIELDS.unrealizedPnl.liveSort).toBe(true);
    expect(DRAWER_OPEN_DEAL_SERVER_FIELDS.unrealizedPnlPercentage.liveSort).toBe(true);
    // the server sort field is unchanged (§1 out of scope)
    expect(OPEN_DEAL_SERVER_FIELDS.unrealizedProfitPercentage.sort).toBe('stats.unrealizedPercentNet');
    expect(OPEN_DEAL_SERVER_FIELDS.cost.liveSort).toBeFalsy();
  });

  it('§4.2 desc: the page reads in live-value order; ties keep the server order', () => {
    expect(pageOrder([{ id: 'unrealizedProfitPercentage', desc: true }])).toEqual([
      'AIN', 'CCD', 'MET', 'B2', 'TIE', 'ADI', 'SAFE', 'RSR',
    ]);
  });

  it('§4.2 asc keeps the direction', () => {
    expect(pageOrder([{ id: 'unrealizedProfitPercentage', desc: false }])).toEqual([
      'RSR', 'SAFE', 'ADI', 'B2', 'TIE', 'MET', 'CCD', 'AIN',
    ]);
  });

  it('§4.3 any other sort key leaves the server order alone', () => {
    const server = page.map((r) => r.sym);
    expect(pageOrder([{ id: 'createdTime', desc: true }])).toEqual(server);
    expect(pageOrder([])).toEqual(server);
  });
});
