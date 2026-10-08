import { test, expect } from '@playwright/test';

import { OrderSizeTypeEnum } from '@/types';
import { convertOrderSizesForUnit } from '@/utils/bots/dca/order-size-convert';

/**
 * Flipping a spot DCA leg to short moves its sizes from quote to base. The
 * number must be converted with the unit: carrying "10" across turned a
 * 10 USDT order into a 10 BTC one.
 */

test('quote sizes are divided by the price when the unit becomes base', () => {
  const out = convertOrderSizesForUnit(
    { baseOrderSize: '10', orderSize: '10' },
    OrderSizeTypeEnum.quote,
    OrderSizeTypeEnum.base,
    80000,
    8
  );
  expect(out).toEqual({ baseOrderSize: '0.00012500', orderSize: '0.00012500' });
});

test('usd sizes convert to base like quote sizes', () => {
  const out = convertOrderSizesForUnit(
    { baseOrderSize: '100', orderSize: '50' },
    OrderSizeTypeEnum.usd,
    OrderSizeTypeEnum.base,
    2000,
    6
  );
  expect(out).toEqual({ baseOrderSize: '0.050000', orderSize: '0.025000' });
});

test('base sizes are multiplied by the price when the unit becomes quote', () => {
  const out = convertOrderSizesForUnit(
    { baseOrderSize: '0.5', orderSize: '0.25' },
    OrderSizeTypeEnum.base,
    OrderSizeTypeEnum.quote,
    2000,
    2
  );
  expect(out).toEqual({ baseOrderSize: '1000.00', orderSize: '500.00' });
});

test('without a price the sizes are zeroed, never carried over', () => {
  for (const price of [undefined, 0, NaN]) {
    const out = convertOrderSizesForUnit(
      { baseOrderSize: '10', orderSize: '10' },
      OrderSizeTypeEnum.quote,
      OrderSizeTypeEnum.base,
      price,
      8
    );
    expect(out).toEqual({ baseOrderSize: '0.00000000', orderSize: '0.00000000' });
  }
});

test('same unit or unrelated units are left alone', () => {
  const sizes = { baseOrderSize: '10', orderSize: '10' };
  expect(
    convertOrderSizesForUnit(sizes, OrderSizeTypeEnum.base, OrderSizeTypeEnum.base, 80000, 8)
  ).toBeNull();
  expect(
    convertOrderSizesForUnit(sizes, OrderSizeTypeEnum.quote, OrderSizeTypeEnum.usd, 80000, 2)
  ).toBeNull();
});
