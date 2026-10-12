import React from 'react';
import { describe, test, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

import { ResponsiveAmount } from '@/components/ui/ResponsiveAmount';
import { fitPresentation } from '@/components/ui/fitPresentation';
import { formatAssetAmount } from '@/utils/formatters';
import { formatNumber } from '@/utils/numberFormatter';

// Spec: specs/103.deals-table-balances-compact-hides-amounts.md
//
// The deals tables' Initial / Current Balances cells printed every amount with
// the K/M widget-header formatter ("209K 1000PEPE", "1.76K USDT") whatever the
// column width, and nothing showed the exact value.

// jsdom has no layout: give every measured box the width under test.
let boxWidth = 0;
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({ width: boxWidth, height: 16, x: 0, y: 0, top: 0, left: 0, right: boxWidth, bottom: 16, toJSON: () => ({}) }) as DOMRect
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const renderAt = (width: number, props: React.ComponentProps<typeof ResponsiveAmount>) => {
  boxWidth = width;
  return render(<ResponsiveAmount {...props} />);
};

const pepe = { label: 'Base: ', value: 208945, precision: 0, asset: '1000PEPE' };

describe('spec 103 §1.4: amounts at the asset precision', () => {
  test('base at its step precision, with thousands separators', () => {
    // The old rendering, kept to pin why this was wrong.
    expect(formatNumber(208945, false)).toBe('209K');
    expect(formatAssetAmount(208945, 0)).toBe('208,945');
    expect(formatAssetAmount(4.212, 3)).toBe('4.212');
    expect(formatAssetAmount(780.6, 1)).toBe('780.6');
  });
  test('quote at the precision the cell passes (floored at 2 by the caller)', () => {
    expect(formatNumber(1758.4693051422917, false)).toBe('1.76K');
    expect(formatAssetAmount(1758.4693051422917, 2)).toBe('1,758.47');
  });
  test('trailing zeros are dropped, as V1 math.round did', () => {
    expect(formatAssetAmount(0, 3)).toBe('0');
    expect(formatAssetAmount(818.708375589273, 2)).toBe('818.71');
    expect(formatAssetAmount(818.7, 2)).toBe('818.7');
  });
  test('unknown precision: the exact value, up to 8 decimals, never exponent', () => {
    expect(formatAssetAmount(1758.4693051422917)).toBe('1,758.46930514');
    expect(formatAssetAmount(0.0034)).toBe('0.0034');
    expect(formatAssetAmount(208945)).toBe('208,945');
  });
});

describe('spec 103 §1.5: the dashboard value widgets choose exactly as before', () => {
  const steps = [
    { sizeClass: 'text-2xl', px: 24 },
    { sizeClass: 'text-sm', px: 14 },
  ];
  test('unmeasured → full at the smallest size', () => {
    expect(fitPresentation('$1,514.88', '$1.5K', 0, steps)).toEqual({ sizeClass: 'text-sm', text: '$1,514.88' });
  });
  test('largest size whose full text fits, else compact, else smallest compact', () => {
    expect(fitPresentation('$1,514.88', '$1.5K', 200, steps)).toEqual({ sizeClass: 'text-2xl', text: '$1,514.88' });
    expect(fitPresentation('$1,514.88', '$1.5K', 80, steps)).toEqual({ sizeClass: 'text-sm', text: '$1,514.88' });
    expect(fitPresentation('$1,514.88', '$1.5K', 75, steps)).toEqual({ sizeClass: 'text-2xl', text: '$1.5K' });
    expect(fitPresentation('$1,514.88', '$1.5K', 50, steps)).toEqual({ sizeClass: 'text-sm', text: '$1.5K' });
    expect(fitPresentation('$1,514.88', '$1.5K', 10, steps)).toEqual({ sizeClass: 'text-sm', text: '$1.5K' });
  });
});

describe('spec 103 §1.1–§1.3: width-fitted cell', () => {
  test('§1.1 full amount when the column fits, and no tooltip', async () => {
    renderAt(280, pepe);
    const el = await screen.findByText('Base: 208,945 1000PEPE');
    act(() => {
      fireEvent.mouseEnter(el.parentElement as HTMLElement);
    });
    expect(document.querySelector('[role=tooltip]')).toBeNull();
  });

  test('§1.2 compact amount when the column is narrow', async () => {
    renderAt(110, pepe);
    expect(await screen.findByText('Base: 209K 1000PEPE')).toBeTruthy();
  });

  test('§1.3 hovering a compacted amount shows the exact value and asset', async () => {
    renderAt(110, pepe);
    const el = await screen.findByText('Base: 209K 1000PEPE');
    act(() => {
      fireEvent.mouseEnter(el.parentElement as HTMLElement);
    });
    expect(document.querySelector('[role=tooltip]')?.textContent).toBe('208,945 1000PEPE');
  });
});
