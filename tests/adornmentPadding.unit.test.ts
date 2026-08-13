import { test, expect } from '@playwright/test';

import {
  ADORNMENT_GUTTER,
  ADORNMENT_PADDING_FLOOR,
  adornmentPaddingLeft,
} from '@/components/ui/adornment-padding';

/**
 * Widths below are real measurements taken from the running app (10.5px
 * semibold Inter, 24px coin icon, 6px gap), so the fixture tracks what users
 * actually see rather than an assumed font metric.
 */
const MEASURED = {
  BTC: 51,
  USDT: 59,
  'XYZ:SP500': 85,
  '1000PEPE': 81,
  FARTCOIN: 84,
  '1MBABYDOGE': 105,
};

test.describe('adornmentPaddingLeft', () => {
  test('an unmeasured adornment defers to the static class', () => {
    // Until the ref attaches there is nothing to compute from; returning
    // undefined leaves `pl-[4.5rem]` in charge instead of collapsing to 0.
    expect(adornmentPaddingLeft(0)).toBeUndefined();
    expect(adornmentPaddingLeft(-5)).toBeUndefined();
    expect(adornmentPaddingLeft(NaN)).toBeUndefined();
  });

  test('short labels keep the original 4.5rem, so nothing shifts', () => {
    // The regression guard: BTC/USDT must render exactly as before the change.
    // 51 + 14 = 65px, below the 72px the floor resolves to at a 16px root.
    for (const label of ['BTC', 'USDT'] as const) {
      const css = adornmentPaddingLeft(MEASURED[label]);
      expect(css, label).toBe(
        `max(${ADORNMENT_PADDING_FLOOR}, ${MEASURED[label] + ADORNMENT_GUTTER}px)`
      );
      // At the default root size the floor wins, i.e. no visual change.
      // USDT is the tight one at 59px and the reason the gutter is 12, not 14.
      expect(MEASURED[label] + ADORNMENT_GUTTER, label).toBeLessThanOrEqual(72);
    }
  });

  test('labels that used to overlap the value now reserve more room', () => {
    // Each of these exceeds the 42px the fixed padding left for a label, and
    // ran into the value before this change.
    for (const label of [
      'XYZ:SP500',
      '1000PEPE',
      'FARTCOIN',
      '1MBABYDOGE',
    ] as const) {
      const width = MEASURED[label];
      expect(adornmentPaddingLeft(width), label).toBe(
        `max(${ADORNMENT_PADDING_FLOOR}, ${width + ADORNMENT_GUTTER}px)`
      );
      // The computed value clears the adornment AND beats the floor, so it is
      // the branch `max()` actually selects.
      expect(width + ADORNMENT_GUTTER, label).toBeGreaterThan(72);
      expect(width + ADORNMENT_GUTTER, label).toBeGreaterThan(width);
    }
  });

  test('the floor stays in rem so it tracks the browser font size', () => {
    // Resolving the floor to px here would break the layout for anyone whose
    // browser font size is not 16px — the app sizes its boxes in rem.
    expect(ADORNMENT_PADDING_FLOOR).toMatch(/rem$/);
    expect(adornmentPaddingLeft(200)).toContain('rem');
  });

  test('a fractional measurement is rounded up, never down', () => {
    // Rounding down could leave the value a sub-pixel under the adornment.
    expect(adornmentPaddingLeft(84.2)).toBe(
      `max(${ADORNMENT_PADDING_FLOOR}, ${85 + ADORNMENT_GUTTER}px)`
    );
  });
});
