import { test, expect } from '@playwright/test';

import {
  ladderAhead,
  type LadderLevel,
} from '@/features/bots/shared/runtime/dialogs/executeNextDcaEligibility';

/**
 * Spec 017 §5 (main-app-sh `specs/017.execute-next-dca-order-controls.md`).
 *
 * The "Execute next DCA" confirmation must always be able to say how big the
 * order is, what it costs, and where the average lands. Its first version read
 * that from a RESTING exchange order, which meant it showed none of the three
 * on the two configurations that never rest safety orders at all:
 *
 *  - `dcaByMarket` — `placeOrders` skips every `dealRegular` send;
 *  - `dcaCondition: 'indicators'` — `createCurrentDealOrders` strips
 *    `dealRegular` entries entirely; the levels fire on a signal.
 *
 * So the dialog now merges real resting orders with the client-side projection
 * and picks the nearest rung out of both. These lock the merge, because every
 * way of getting it wrong misreports the size of a real order the user is
 * about to send.
 */

const level = (
  price: number,
  qty: number,
  projected = false
): LadderLevel => ({ price, qty, projected });

test('a long ladder reads downwards — the highest rung is next', () => {
  const ahead = ladderAhead(
    [level(96.22, 4.17), level(102.3, 1.97), level(99.47, 2.69)],
    true
  );

  expect(ahead.map((l) => l.price)).toEqual([102.3, 99.47, 96.22]);
});

test('a short ladder reads upwards — the lowest rung is next', () => {
  const ahead = ladderAhead(
    [level(112.4, 4.17), level(105.1, 1.97), level(108.8, 2.69)],
    false
  );

  expect(ahead.map((l) => l.price)).toEqual([105.1, 108.8, 112.4]);
});

test('a purely projected ladder still yields a next level with a size', () => {
  // The dcaByMarket / indicator case: nothing rests on the venue, so every
  // rung is projected. Before this merge the dialog had no size at all here
  // and silently dropped Amount, Estimated cost and Average price.
  const ahead = ladderAhead(
    [level(99.47, 2.69, true), level(102.3, 1.97, true)],
    true
  );

  expect(ahead.length).toBe(2);
  expect(ahead[0].price).toBe(102.3);
  expect(ahead[0].qty).toBe(1.97);
  expect(ahead[0].projected).toBe(true);
});

test('a real order and the projection that predicted it are ONE level', () => {
  // `useDealSmartOrders` already dedupes by price, but the dialog merges two
  // independently-sourced lists — double-counting here would show the user the
  // wrong rung as "next" and quote the level below it as the one after.
  const ahead = ladderAhead(
    [level(102.3, 1.97, true), level(102.3, 1.97, false), level(99.47, 2.69, true)],
    true
  );

  expect(ahead.length).toBe(2);
  expect(ahead[0].projected).toBe(false);
});

test('the real order wins on quantity, whichever order they arrive in', () => {
  // The venue's own quantity is authoritative — the projection is an estimate
  // built from settings, and rounding to the pair's step size can differ.
  const projectionFirst = ladderAhead(
    [level(102.3, 1.9, true), level(102.3, 1.97, false)],
    true
  );
  const realFirst = ladderAhead(
    [level(102.3, 1.97, false), level(102.3, 1.9, true)],
    true
  );

  expect(projectionFirst[0].qty).toBe(1.97);
  expect(realFirst[0].qty).toBe(1.97);
});

test('unusable rungs are dropped rather than quoted as a zero-size order', () => {
  const ahead = ladderAhead(
    [
      level(0, 1.97),
      level(102.3, 0),
      level(Number.NaN, 1.97),
      level(99.47, Number.POSITIVE_INFINITY),
      level(96.22, 4.17),
    ],
    true
  );

  expect(ahead.map((l) => l.price)).toEqual([96.22]);
});

test('an empty ladder yields nothing, not an undefined-shaped level', () => {
  expect(ladderAhead([], true)).toEqual([]);
});
