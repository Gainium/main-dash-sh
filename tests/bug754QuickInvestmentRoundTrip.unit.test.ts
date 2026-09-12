import { test, expect } from '@playwright/test';

import {
  QUICK_SETUP_PRESETS,
  computeInvestmentDivisor,
  computeInvestmentFromDca,
  distributeInvestmentToDca,
  type QuickSetupDcaLike,
} from '@/features/bots/widgets/BotForm/components/quickSetupPresets';

/**
 * Spec: `main-dash-redesign/specs/015.quick-investment-field-overwrites-what-you-type.md`.
 *
 * Quick setup has no `investment` field. It splits the figure the user types
 * into `baseOrderSize` / `orderSize` and reads it back as
 * `base + order x (divisor - 1)`. Giving both the same rounded per-order
 * number quantized the achievable total to `divisor x 10^-precision` — 0.50
 * USDT on the Mid-term preset — so almost nothing typed survived the round
 * trip, and what came back was written into the field the user was still
 * typing in.
 *
 * §4.2 locks the round trip; §4.3 locks the reason it is safe to carry the
 * remainder on the base order — the base is never left smaller than a safety
 * order, so it clears the venue per-order minimum whenever the safety orders
 * do.
 */

const ladder = (preset: (typeof QUICK_SETUP_PRESETS)[number]): QuickSetupDcaLike =>
  ({
    ordersCount: preset.values.ordersCount,
    volumeScale: preset.values.volumeScale,
    baseOrderSize: '0',
    orderSize: '0',
  }) as unknown as QuickSetupDcaLike;

/** What the Investment field renders: `formatNumber` in balance-input.tsx. */
const asDisplayed = (value: number, precision: number): string => {
  if (!Number.isFinite(value) || value === 0) return '0';
  const fixed = value.toFixed(Math.max(0, precision));
  if (!fixed.includes('.')) return fixed;
  return fixed.replace(/0+$/, '').replace(/\.$/, '');
};

for (const preset of QUICK_SETUP_PRESETS) {
  const dca = ladder(preset);
  const divisor = computeInvestmentDivisor(
    preset.values.ordersCount,
    preset.values.volumeScale
  );

  test(`${preset.id}: the typed total survives the round trip`, () => {
    const precision = 2;
    const unit = Math.pow(10, -precision);
    // A sweep across the grid the old even split quantized to, so the cases
    // that used to be unrepresentable are all in here. The old split was off
    // by up to half a *ladder* unit (`divisor x 10^-precision`); the bound
    // here is half a *display* unit (§4.2, §5.2).
    let displayMismatches = 0;
    const samples = 2000;
    for (let i = 0; i <= samples; i++) {
      const typed = Math.round((divisor + i * 0.37) * 100) / 100;
      const sizes = distributeInvestmentToDca(typed, dca, precision);
      const back = computeInvestmentFromDca({
        ...dca,
        ...sizes,
      } as QuickSetupDcaLike);
      expect(
        Math.abs(back - typed),
        `typed ${typed} came back as ${back}`
      ).toBeLessThanOrEqual(unit / 2 + 1e-9);
      if (asDisplayed(back, precision) !== asDisplayed(typed, precision)) {
        displayMismatches++;
      }
    }
    // §5.2: where the reachable grid straddles the typed figure the field
    // settles one cent away. It was >84% of every figure before.
    expect(displayMismatches / (samples + 1)).toBeLessThan(0.01);
  });

  test(`${preset.id}: the reporter's keystrokes — 10 stays 10`, () => {
    const sizes = distributeInvestmentToDca(10, dca, 2);
    const back = computeInvestmentFromDca({
      ...dca,
      ...sizes,
    } as QuickSetupDcaLike);
    expect(asDisplayed(back, 2)).toBe('10');
  });

  test(`${preset.id}: base order is never below a safety order`, () => {
    for (const precision of [2, 5, 8]) {
      for (let i = 0; i <= 200; i++) {
        const typed = Math.round((divisor + i * 0.53) * 1e8) / 1e8;
        const { baseOrderSize, orderSize } = distributeInvestmentToDca(
          typed,
          dca,
          precision
        );
        expect(
          Number(baseOrderSize),
          `typed ${typed} at ${precision}dp -> base ${baseOrderSize} < order ${orderSize}`
        ).toBeGreaterThanOrEqual(Number(orderSize));
      }
    }
  });

  test(`${preset.id}: at "Min to run" every order clears the venue minimum`, () => {
    // `minInvestment` in QuickBotForm: orderMinimum x divisor, rounded up to
    // the display precision. Below it the form already raises an alert; at or
    // above it, no order may be under the minimum.
    for (const orderMinimum of [0.1, 1, 5, 10]) {
      const precision = 2;
      const factor = Math.pow(10, precision);
      const minInvestment =
        Math.ceil(orderMinimum * divisor * factor) / factor;
      for (const typed of [
        minInvestment,
        minInvestment + 0.01,
        minInvestment + 0.24,
        minInvestment + 0.5,
        minInvestment * 2,
      ]) {
        const { baseOrderSize, orderSize } = distributeInvestmentToDca(
          typed,
          dca,
          precision
        );
        expect(
          Number(orderSize),
          `min ${orderMinimum}, typed ${typed} -> safety order ${orderSize}`
        ).toBeGreaterThanOrEqual(orderMinimum);
        expect(
          Number(baseOrderSize),
          `min ${orderMinimum}, typed ${typed} -> base order ${baseOrderSize}`
        ).toBeGreaterThanOrEqual(orderMinimum);
      }
    }
  });

  test(`${preset.id}: the split never over-funds the typed total`, () => {
    for (let i = 0; i <= 200; i++) {
      const typed = Math.round((divisor + i * 0.71) * 100) / 100;
      const sizes = distributeInvestmentToDca(typed, dca, 2);
      const back = computeInvestmentFromDca({
        ...dca,
        ...sizes,
      } as QuickSetupDcaLike);
      // Only the final 2dp rounding of the base order may exceed it.
      expect(back, `typed ${typed} deployed ${back}`).toBeLessThanOrEqual(
        typed + 0.005 + 1e-9
      );
    }
  });
}

test('zero and garbage still produce zeroed sizes', () => {
  const [firstPreset] = QUICK_SETUP_PRESETS;
  if (!firstPreset) throw new Error('no quick-setup presets are defined');
  const dca = ladder(firstPreset);
  for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const { baseOrderSize, orderSize } = distributeInvestmentToDca(bad, dca, 2);
    expect(Number(baseOrderSize)).toBe(0);
    expect(Number(orderSize)).toBe(0);
  }
});

test('a ladder with no safety orders puts the whole total on the base order', () => {
  const dca = {
    ordersCount: '0',
    volumeScale: '1',
    baseOrderSize: '0',
    orderSize: '0',
  } as unknown as QuickSetupDcaLike;
  const { baseOrderSize } = distributeInvestmentToDca(37.5, dca, 2);
  expect(Number(baseOrderSize)).toBeCloseTo(37.5, 8);
});
