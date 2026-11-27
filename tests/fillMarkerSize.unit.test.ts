import { test, expect } from '@playwright/test';

import {
  fillMarkerSize,
  fillTooltip,
  fillUnderCrosshair,
  mergeFills,
  typicalFillNotional,
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

test('the typical (median) order keeps 20px; bigger grow, smaller shrink by sqrt', () => {
  const fills = [1, 1, 1, 4, 0.25].map((q, i) =>
    withFillValue(fill(String(i), 100, q))
  );
  const ref = typicalFillNotional(fills);
  expect(ref).toBe(100);
  expect(fillMarkerSize(100, ref)).toBe(20);
  // Ring width grows with sqrt(value): 2.25× → 1.5× wide; clamped to 14–30.
  expect(fillMarkerSize(225, ref)).toBe(30);
  expect(fillMarkerSize(400, ref)).toBe(30);
  expect(fillMarkerSize(49, ref)).toBe(14);
  expect(fillMarkerSize(25, ref)).toBe(14);
});

test('equal orders (a grid) all keep the old 20px', () => {
  const fills = [12.5, 12.5, 12.5].map((q, i) =>
    withFillValue(fill(String(i), 1.1, q))
  );
  const ref = typicalFillNotional(fills);
  for (const f of fills) expect(fillMarkerSize(f.notional, ref)).toBe(20);
});

test('fills without a quantity keep the old fixed size', () => {
  const bare = withFillValue(fill('a', 100));
  expect(bare.notional).toBeUndefined();
  expect(typicalFillNotional([bare])).toBe(0);
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

test('the crosshair finds the fill within the icon radius, across bars', () => {
  const day = 86_400;
  const fills = [
    { seconds: 10 * day + 500, price: 100, size: 30, text: 'A' },
    { seconds: 10 * day, price: 120, size: 14, text: 'B' },
  ];
  // 1 price unit and 1 hour per px: A's radius is 15 + 2 px.
  const hit = (t: number, p: number) =>
    fillUnderCrosshair(fills, t, p, day, 1, 3_600)?.text ?? null;
  expect(hit(10 * day, 110)).toBe('A');
  expect(hit(10 * day, 119)).toBe('B');
  expect(hit(10 * day, 140)).toBeNull();
  // A big icon is wider than one bar: the next bar (24px away) misses, but
  // with 4 h per px it is 6px away and still on the icon.
  expect(hit(11 * day, 100)).toBeNull();
  expect(fillUnderCrosshair(fills, 11 * day, 100, day, 1, 14_400)?.text).toBe(
    'A'
  );
});
