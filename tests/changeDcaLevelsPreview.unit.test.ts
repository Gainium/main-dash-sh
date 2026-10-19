import { test, expect } from '@playwright/test';

import { addedDcaLevels } from '@/features/bots/shared/runtime/dialogs/changeDcaLevelsLadder';

/**
 * "Change DCA levels" lists the levels a higher max adds and marks the ones
 * price is already past: the engine places those as limits at their ladder
 * price, which cross the book and fill at once.
 *
 * Ladder: long, opening price 100, step 2%, volume scale 2, quote sizes
 * 100 / 200 / 400 / 800.
 */
const LADDER = [
  { price: 98, qty: 100 / 98 },
  { price: 96, qty: 200 / 96 },
  { price: 94, qty: 400 / 94 },
  { price: 92, qty: 800 / 92 },
  { price: 90, qty: 1600 / 90 },
];

test('lists only the levels between the current and the new max', () => {
  const added = addedDcaLevels(LADDER, 3, 5, true, 95);
  expect(added.map((l) => [l.level, l.price])).toEqual([
    [4, 92],
    [5, 90],
  ]);
});

test('a long level above the market fills now; one below rests', () => {
  const added = addedDcaLevels(LADDER, 3, 5, true, 91);
  expect(added.map((l) => l.crossed)).toEqual([true, false]);
});

test('a short level below the market fills now', () => {
  const short = [
    { price: 102, qty: 1 },
    { price: 104, qty: 1 },
  ];
  expect(addedDcaLevels(short, 0, 2, false, 103).map((l) => l.crossed)).toEqual(
    [true, false]
  );
});

test('nothing is marked without a market price, and lowering adds nothing', () => {
  expect(addedDcaLevels(LADDER, 3, 4, true, undefined)[0]?.crossed).toBe(false);
  expect(addedDcaLevels(LADDER, 3, 2, true, 80)).toEqual([]);
});
