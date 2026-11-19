import { describe, expect, it } from 'vitest';

import { dcaLadderStanding } from '@/features/bots/shared/runtime/dialogs/executeNextDcaEligibility';

/**
 * "Change DCA levels" bounds on a deal that has taken Add Funds.
 *
 * An Add Funds fill increments `levels.complete` and grows `levels.all`, but it
 * is not one of the bot's configured DCA levels (main-app `nextLadderLevel`).
 * The dialog's floor must be the configured levels that filled, and its max
 * the deal's own ladder size, or lowering the max by one re-sends the deal's
 * current `ordersCount` and nothing changes.
 */
describe('dcaLadderStanding', () => {
  it('a deal without Add Funds keeps the levels arithmetic', () => {
    expect(
      dcaLadderStanding({
        levels: { complete: 4, all: 6 },
        settings: { dcaCondition: 'percentage', ordersCount: '5' },
      })
    ).toEqual({ filled: 3, max: 5 });
  });

  it('an Add Funds fill does not raise the floor, and the max is the ladder size', () => {
    // 42 ladder fills + base + one Add Funds fill; the 43rd level rests.
    expect(
      dcaLadderStanding({
        levels: { complete: 44, all: 45 },
        funds: [{ price: 0.0005929, qty: 42166 }],
        settings: { dcaCondition: 'percentage', ordersCount: 43 },
      })
    ).toEqual({ filled: 42, max: 43 });
  });

  it('each Add Funds fill is subtracted', () => {
    expect(
      dcaLadderStanding({
        levels: { complete: 53, all: 53 },
        funds: [
          { price: 1, qty: 1 },
          { price: 1, qty: 1 },
        ],
        settings: { dcaCondition: 'percentage', ordersCount: '50' },
      })
    ).toEqual({ filled: 50, max: 50 });
  });

  it('an addition flagged as consuming a level still counts as filled', () => {
    expect(
      dcaLadderStanding({
        levels: { complete: 3, all: 5 },
        funds: [{ price: 1, qty: 1, consumesLadderLevel: true }],
        settings: { dcaCondition: 'percentage', ordersCount: 4 },
      })
    ).toEqual({ filled: 2, max: 4 });
  });

  it('the max never drops below the levels that filled', () => {
    expect(
      dcaLadderStanding({
        levels: { complete: 6, all: 6 },
        funds: [{ price: 1, qty: 1 }],
        settings: { dcaCondition: 'percentage', ordersCount: 1 },
      })
    ).toEqual({ filled: 4, max: 4 });
  });

  it('an indicator or custom ladder keeps the levels-based max', () => {
    expect(
      dcaLadderStanding({
        levels: { complete: 3, all: 6 },
        funds: [{ price: 1, qty: 1 }],
        settings: { dcaCondition: 'indicators', ordersCount: 2 },
      })
    ).toEqual({ filled: 1, max: 5 });
  });

  it('without the deal settings the max falls back to the levels', () => {
    expect(dcaLadderStanding({ levels: { complete: 44, all: 45 } })).toEqual({
      filled: 43,
      max: 44,
    });
  });

  it('a missing levels object reads as a fresh deal', () => {
    expect(dcaLadderStanding({})).toEqual({ filled: 0, max: 0 });
  });
});
