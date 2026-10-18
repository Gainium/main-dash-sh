import { test, expect } from '@playwright/test';

import { estimateLevelsBase } from '@/lib/baseFunding/estimateLevelsBase';

test.describe('estimateLevelsBase (add-DCA funding estimate)', () => {
  test('base-sized levels with volume scale', () => {
    // levels 3 and 4 of 1 × 2^(n-1): 4 + 8
    expect(
      estimateLevelsBase({
        fromLevel: 3,
        toLevel: 4,
        orderSize: 1,
        orderSizeType: 'base',
        volumeScale: 2,
        price: 100,
      })
    ).toBe(12);
  });

  test('quote-sized levels are converted at the given price', () => {
    expect(
      estimateLevelsBase({
        fromLevel: 1,
        toLevel: 2,
        orderSize: 100,
        orderSizeType: 'quote',
        volumeScale: 1,
        price: 50,
      })
    ).toBe(4);
  });

  test('no levels added counts nothing', () => {
    expect(
      estimateLevelsBase({
        fromLevel: 5,
        toLevel: 4,
        orderSize: 1,
        orderSizeType: 'base',
        volumeScale: 1,
        price: 100,
      })
    ).toBe(0);
  });

  test('sizes it cannot express are not estimated', () => {
    for (const orderSizeType of ['usd', 'percFree', 'percTotal']) {
      expect(
        estimateLevelsBase({
          fromLevel: 1,
          toLevel: 2,
          orderSize: 10,
          orderSizeType,
          volumeScale: 1,
          price: 100,
        })
      ).toBeNull();
    }
    expect(
      estimateLevelsBase({
        fromLevel: 1,
        toLevel: 2,
        orderSize: 10,
        orderSizeType: 'quote',
        volumeScale: 1,
        price: 0,
      })
    ).toBeNull();
  });
});
