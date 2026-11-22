import { describe, expect, it } from 'vitest';

import { readOpenListAnswer } from '@/hooks/useExchangeOrdersPositions';

const REASON =
  'Could not read 1 of 9 exchange accounts: bybitLinear ae62: answered NOTOK: API key is invalid.';

describe('readOpenListAnswer (spec 163)', () => {
  it('§2.1 NOTOK: empty list and the reason as the error', () => {
    const r = readOpenListAnswer({
      status: 'NOTOK',
      reason: REASON,
      data: null,
    });
    expect(r).toEqual({ rows: [], notOkReason: REASON, partialReason: null });
  });

  it('§2.1 NOTOK without a reason still reads as failed', () => {
    const r = readOpenListAnswer({
      status: 'NOTOK',
      reason: '',
      data: null,
    });
    expect(r.notOkReason).toBe('Could not read the exchange');
    expect(r.rows).toEqual([]);
  });

  it('§2.2 OK with reason: rows kept, reason exposed as partial', () => {
    const rows = [{ id: 1 }, { id: 2 }];
    const r = readOpenListAnswer({
      status: 'OK',
      reason: REASON as unknown as null,
      data: rows,
    });
    expect(r).toEqual({ rows, notOkReason: null, partialReason: REASON });
  });

  it('§2.3 OK without reason: identical to reading data', () => {
    const rows = [{ id: 1 }];
    const r = readOpenListAnswer({ status: 'OK', reason: null, data: rows });
    expect(r.rows).toBe(rows);
    expect(r.notOkReason).toBeNull();
    expect(r.partialReason).toBeNull();
  });

  it('§2.3 no answer yet: empty, no error', () => {
    expect(readOpenListAnswer(undefined)).toEqual({
      rows: [],
      notOkReason: null,
      partialReason: null,
    });
  });
});
