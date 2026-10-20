import { describe, expect, test } from 'vitest';

import { creditsInUse } from '@/lib/botList/creditsInUse';

/**
 * Spec 128 — bot lists show credits only for bots that hold a credit lock.
 * `isActive` is the row flag the bot transforms already derive: for DCA/Combo
 * it stays true on a stopped bot that still runs open deals (main-app keeps the
 * lock until the last deal closes); for Grid it is false once closed/archived.
 */
describe('creditsInUse (spec 128)', () => {
  test('§1.3 a bot holding credits shows its cost', () => {
    expect(creditsInUse({ isActive: true, cost: 3.5 })).toBe(3.5);
  });

  test('§1.3 a holding bot without a backend cost reads 0', () => {
    expect(creditsInUse({ isActive: true, cost: undefined })).toBe(0);
  });

  test('§1.1 a closed/archived bot keeps no credits even with a leftover cost', () => {
    expect(creditsInUse({ isActive: false, cost: 3.5 })).toBeUndefined();
    expect(creditsInUse({ isActive: undefined, cost: 2 })).toBeUndefined();
  });

  test('§1.4 sort/filter value: "> 0" selects exactly the holders', () => {
    const rows = [
      { id: 'running', isActive: true, cost: 2 },
      { id: 'stopped-with-open-deals', isActive: true, cost: 1 },
      { id: 'closed', isActive: false, cost: 4 },
      { id: 'archived', isActive: false, cost: 5 },
    ];
    const holders = rows.filter((r) => (creditsInUse(r) ?? 0) > 0).map((r) => r.id);
    expect(holders).toEqual(['running', 'stopped-with-open-deals']);
  });
});
