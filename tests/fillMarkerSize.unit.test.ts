import { test, expect } from '@playwright/test';

import {
  fillMarkerSize,
  fillTooltip,
  fillUnderCrosshair,
  largestFillNotional,
  mergeFills,
  withFillValue,
} from '@/components/widgets/shared/TradingViewChart/fillMarkers';
import type { TransactionExtended } from '@/components/widgets/shared/TradingViewChart/types';

/**
 * Chart fill markers are sized by order value (qty × price) against the
 * largest fill, and describe themselves on hover. These lock the scale, the
 * merge of fills that share one marker spot, and the hover text.
 */
const fill = (
  id: string,
  price: number,
  qty?: number,
  side = 'buy'
): TransactionExtended => ({
  id,
  side,
  time: 1_700_000_000_000,
  price,
  ...(qty != null && { qty }),
});

test('the largest fill gets the biggest marker, smaller fills shrink by sqrt', () => {
  const big = withFillValue(fill('a', 100, 4)); // 400
  const small = withFillValue(fill('b', 100, 1)); // 100
  const ref = largestFillNotional([big, small]);
  expect(ref).toBe(400);
  expect(fillMarkerSize(big.notional, ref)).toBe(34);
  // 1/4 of the value → half the ratio on the sqrt scale.
  expect(fillMarkerSize(small.notional, ref)).toBe(24);
  expect(fillMarkerSize(small.notional, ref)).toBeLessThan(
    fillMarkerSize(big.notional, ref)
  );
});

test('fills without a quantity keep the old fixed size', () => {
  const bare = withFillValue(fill('a', 100));
  expect(bare.notional).toBeUndefined();
  expect(fillMarkerSize(bare.notional, 400)).toBe(20);
  expect(fillMarkerSize(100, 0)).toBe(20);
});

test('merged fills add up, so the marker reflects everything it hides', () => {
  const merged = mergeFills(
    withFillValue(fill('a', 100, 1)),
    withFillValue(fill('b', 110, 2))
  );
  expect(merged.qty).toBe(3);
  expect(merged.notional).toBe(320);
  expect(merged.fillCount).toBe(2);
  expect(fillTooltip({ ...merged, quoteAsset: 'USDT' })).toBe(
    'Buy ×2 3 · 320 USDT'
  );
});

test('a single fill reads side, qty, price and value', () => {
  const t = withFillValue({
    ...fill('a', 270.45, 0.0739, 'sell'),
    quoteAsset: 'USDT',
  });
  expect(fillTooltip(t)).toBe('Sell 0.0739 @ 270.45 · 19.99 USDT');
});

test('the crosshair finds the fill in its bar within the icon radius', () => {
  const day = 86_400;
  const fills = [
    { seconds: 10 * day, price: 100, size: 30, text: 'A' },
    { seconds: 10 * day, price: 120, size: 14, text: 'B' },
  ];
  // 1 price unit per px: A's radius is 15 + 2.
  expect(fillUnderCrosshair(fills, 10 * day + 500, 110, day, 1)?.text).toBe('A');
  expect(fillUnderCrosshair(fills, 10 * day, 119, day, 1)?.text).toBe('B');
  expect(fillUnderCrosshair(fills, 10 * day, 140, day, 1)).toBeNull();
  expect(fillUnderCrosshair(fills, 11 * day, 100, day, 1)).toBeNull();
});
