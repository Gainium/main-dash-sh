import { test, expect } from '@playwright/test';

import { isStoredBacktest } from '@/lib/shareLinks';

/**
 * Spec 053 §4.1 — Share is only offered on a backtest the server holds.
 *
 * A run whose remote save returned no id is kept in the browser under a
 * synthetic `<SYMBOL>-<time>` id (useBacktestPersistence), stamped with the
 * owner's userId. The share mutations can only answer "Backtest not found"
 * for it, so the id shape is what tells the two apart. `serverSide` is not a
 * persistence flag (it means "ran on the server").
 */
test.describe('isStoredBacktest', () => {
  test('a server ObjectId is stored', () => {
    expect(isStoredBacktest({ _id: '6aaa73f572531abfde503d20' })).toBe(true);
    expect(isStoredBacktest({ _id: '6AAA73F572531ABFDE503D20' })).toBe(true);
  });

  test('a browser-only <SYMBOL>-<time> id is not stored', () => {
    expect(isStoredBacktest({ _id: 'BIRBUSDT-1789555701479' })).toBe(false);
    // symbols may themselves contain '-'
    expect(isStoredBacktest({ _id: 'BTC-USDT-1789555701479' })).toBe(false);
    expect(isStoredBacktest({ _id: 'BIRBUSDT-1789555701479', shareId: null })).toBe(false);
  });

  test('an existing share link counts as stored whatever the id', () => {
    // the share hook returns an existing shareId without asking the server
    expect(
      isStoredBacktest({ _id: 'BIRBUSDT-1789555701479', shareId: 'f3a50c15-3593-41f0-8fae-f01a3bc933f1' })
    ).toBe(true);
    expect(isStoredBacktest({ _id: 'x', shareId: '  ' })).toBe(false);
  });

  test('missing input is not stored', () => {
    expect(isStoredBacktest(null)).toBe(false);
    expect(isStoredBacktest(undefined)).toBe(false);
    expect(isStoredBacktest({})).toBe(false);
    expect(isStoredBacktest({ _id: '' })).toBe(false);
    // 24 chars but not hex
    expect(isStoredBacktest({ _id: 'zzzzzzzzzzzzzzzzzzzzzzzz' })).toBe(false);
  });
});
