import { describe, expect, it } from 'vitest';
import { mergeRemoteAndLocalRows } from '@/utils/backtest/localRows';

/**
 * A downloaded copy of a server result (opening its deals) used to REPLACE
 * the server's row in the backtests list: name lost, "server side: no".
 */
type Row = {
  _id?: string;
  time?: number;
  serverSide?: boolean;
  hasLocalDetails?: boolean;
  settings?: { name?: string };
};

describe('backtests list: the server row wins over a local copy', () => {
  const server: Row = { _id: 'a'.repeat(24), time: 2, serverSide: true, settings: { name: 'My backtest' } };
  const copy: Row = { _id: 'a'.repeat(24), time: 2, serverSide: false, hasLocalDetails: true };
  const own: Row = { _id: 'local-5-x', time: 5, serverSide: false };

  it('keeps the server fields and adds hasLocalDetails', () => {
    const [first, second] = mergeRemoteAndLocalRows<Row>([server], [copy, own]);
    expect(first).toBe(own);
    expect(second).toMatchObject({ serverSide: true, settings: { name: 'My backtest' }, hasLocalDetails: true });
  });

  it('a local-only backtest is still listed; rows without id are kept', () => {
    const rows = mergeRemoteAndLocalRows<Row>([{ time: 1 }], [own]);
    expect(rows.map((r) => r._id ?? 'none')).toEqual(['local-5-x', 'none']);
  });
});
