import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  isServerDetailsCopy,
  mergeRemoteAndLocalRows,
} from '@/utils/backtest/localRows';
import { noDealClosed } from '@/components/bots/panels/contents/insights/columns/noDealClosed';
import { NoDealClosedCell } from '@/components/bots/panels/contents/insights/columns/NoDealClosedCell';

/**
 * The backtests list = the server's rows + this browser's own runs.
 * A downloaded copy of a server result (opening its deals) used to REPLACE
 * the server's row (name lost, "server side: no", no source) and, for a
 * result with a variant id (`<rowId>.baseline`), to show as a row of its
 * own created "now".
 */
type Row = {
  _id?: string;
  time?: number;
  serverSide?: boolean;
  hasLocalDetails?: boolean;
  settings?: { name?: string };
  source?: { kind: string };
};

describe('backtests list: the server row wins over a local copy', () => {
  const server: Row = {
    _id: 'a'.repeat(24),
    time: 2,
    serverSide: true,
    settings: { name: 'Max test · Sonnet' },
    source: { kind: 'max' },
  };
  const copy: Row = { _id: 'a'.repeat(24), time: 2, serverSide: false, hasLocalDetails: true };
  const own: Row = { _id: 'local-5-x', time: 5, serverSide: false };

  it('keeps the server fields and adds hasLocalDetails', () => {
    const [first, second] = mergeRemoteAndLocalRows<Row>([server], [copy, own]);
    expect(first).toBe(own);
    expect(second).toMatchObject({
      serverSide: true,
      settings: { name: 'Max test · Sonnet' },
      source: { kind: 'max' },
      hasLocalDetails: true,
    });
  });

  it('a local-only backtest is still listed; rows without id are kept', () => {
    const rows = mergeRemoteAndLocalRows<Row>([{ time: 1 }], [own]);
    expect(rows.map((r) => r._id ?? 'none')).toEqual(['local-5-x', 'none']);
  });
});

describe('backtests list: downloaded server copies are not local rows', () => {
  const s = (id: string, meta: Record<string, unknown> = {}) => ({ id, meta });
  it('marked fromServer, carrying a source, or a variant id', () => {
    expect(isServerDetailsCopy(s('a'.repeat(24), { fromServer: true }))).toBe(true);
    expect(isServerDetailsCopy(s('a'.repeat(24), { source: { kind: 'max' } }))).toBe(true);
    expect(isServerDetailsCopy(s(`${'6ac0d92c33ff5773e988b67b'}.baseline`))).toBe(true);
  });
  it('a backtest this browser ran is listed', () => {
    expect(isServerDetailsCopy(s('local-1791000000000-abc'))).toBe(false);
    expect(isServerDetailsCopy(s('a'.repeat(24), { exchange: 'binance' }))).toBe(false);
  });
});

describe('backtests list: no deal closed is not 0%', () => {
  it('detected from the counts; not when a deal closed or counts are missing', () => {
    expect(
      noDealClosed({ numerical: { all: 3, closed: 0 }, financial: { unrealizedPnL: 3.15655 } })
    ).toEqual({ open: 3, unrealized: 3.15655 });
    expect(noDealClosed({ numerical: { all: 4, closed: 3 } })).toBeNull();
    expect(noDealClosed({ numerical: { all: 0, closed: 0 } })).toBeNull();
    expect(noDealClosed({})).toBeNull();
  });
  it('the cell says so instead of a percentage', () => {
    const { container } = render(<NoDealClosedCell open={3} unrealized={3.15655} />);
    expect(container.textContent).toBe('No deal closed');
    expect(container.textContent).not.toContain('%');
  });
});
