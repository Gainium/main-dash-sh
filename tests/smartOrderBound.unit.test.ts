import { test, expect } from '@playwright/test';

import { smartOrderProjectionBound } from '@/utils/bots/dca/smart-order-bound';

/**
 * Smart orders on, two kept on the exchange: two DCA orders rest, the rest of
 * the ladder is projected past them. A resting limit add-funds order priced
 * below both must not become the bound — it is not a ladder level.
 */
const placed = [
  { typeOrder: 'dealTP', price: 0.1381 },
  { typeOrder: 'dealRegular', price: 0.131 },
  { typeOrder: 'dealRegular', price: 0.1295 },
];
const addFunds = {
  typeOrder: 'dealRegular',
  price: 0.1237,
  addFundsId: '1ec09389-a5b3-4366-95b6-8dbb99c01564',
};

test('long: the bound is the lowest resting DCA order', () => {
  expect(smartOrderProjectionBound(placed, true)).toBe(0.1295);
});

test('long: a resting add-funds limit below the DCA orders does not move the bound', () => {
  expect(smartOrderProjectionBound([...placed, addFunds], true)).toBe(0.1295);
});

test('short: mirrored, and an add-funds order above does not move it', () => {
  const short = [
    { typeOrder: 'dealRegular', price: 101 },
    { typeOrder: 'dealRegular', price: 102 },
    { typeOrder: 'dealRegular', price: 110, addFundsId: 'x' },
  ];
  expect(smartOrderProjectionBound(short, false)).toBe(102);
});

test('no resting DCA order: nothing bounds the projection', () => {
  expect(smartOrderProjectionBound([addFunds], true)).toBe(Infinity);
  expect(smartOrderProjectionBound([], false)).toBe(0);
});
