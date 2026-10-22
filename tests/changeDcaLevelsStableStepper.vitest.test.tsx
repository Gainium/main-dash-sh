/**
 * Runner note: renders a React component in jsdom, so it is a Vitest file.
 * Run from the parent with a development React build:
 *   NODE_ENV=development npx vitest run core/tests/changeDcaLevelsStableStepper.vitest.test.tsx
 *
 * Spec: `main-dash-redesign/specs/130.change-dca-levels-stable-stepper.md`.
 *
 * The Change DCA levels dialog is centred, so anything that grows below the
 * -/+ stepper moves the stepper up by half the growth. The new-levels preview
 * used to appear on the first + click and grow by one row per click; it now
 * occupies a fixed-height, scrollable box from the moment the dialog opens
 * (laid out but invisible until the first level is added).
 * jsdom has no layout, so these tests pin the structure that keeps the height
 * constant; the pixel check is in the spec's evidence.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

let levelCount = 0;

vi.mock(
  '@/features/bots/shared/runtime/dialogs/changeDcaLevelsPreview',
  () => ({
    useAddedDcaLevels: () => ({
      levels: Array.from({ length: levelCount }, (_, i) => ({
        level: 36 + i,
        price: 1 - i * 0.01,
        qty: 10 + i,
        crossed: false,
      })),
      market: undefined,
    }),
  })
);
vi.mock('@/hooks/useBaseFunding', () => ({
  useFundingPreview: () => ({ preview: null }),
}));

import { ChangeDcaLevelsDialog } from '@/features/bots/shared/runtime/dialogs/ChangeDcaLevelsDialog';

const previewDeal = {
  botId: 'bot',
  dealId: 'deal',
  kind: 'dca' as const,
  long: true,
  symbol: 'FORT-USDC',
  baseAsset: 'FORT',
  quoteAsset: 'USDC',
};

let container: HTMLDivElement;
let root: Root;

const render = (withPreview: boolean) =>
  act(() => {
    root.render(
      <ChangeDcaLevelsDialog
        open
        onOpenChange={() => {}}
        currentLevel={1}
        maxLevel={35}
        onConfirm={() => {}}
        {...(withPreview ? { previewDeal } : {})}
      />
    );
  });

const levelsBox = () =>
  document.querySelector<HTMLElement>('[data-testid="change-dca-new-levels"]');
const sectionClass = () =>
  document.querySelector('[data-testid="change-dca-new-levels-section"]')
    ?.className ?? '';

describe('Change DCA levels: the stepper does not move as levels are added', () => {
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    levelCount = 0;
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = '';
  });

  it('§3.1 reserves the fixed-height levels box before any level is added', () => {
    render(true);
    const box = levelsBox();
    expect(box).not.toBeNull();
    expect(box?.className).toMatch(/\bh-56\b/);
    expect(box?.className).toMatch(/\boverflow-y-auto\b/);
    expect(sectionClass()).toMatch(/\binvisible\b/);
  });

  it('§3.2 keeps the same box, rather than growing, as levels are added', () => {
    render(true);
    const before = levelsBox();
    levelCount = 12;
    render(true);
    const after = levelsBox();
    expect(after).toBe(before);
    expect(after?.className).toMatch(/\bh-56\b/);
    expect(
      after?.querySelectorAll('[data-testid="change-dca-new-level"]')
    ).toHaveLength(12);
    expect(sectionClass()).not.toMatch(/\binvisible\b/);
  });

  it('§3.3 renders no levels box when there is no deal to preview', () => {
    render(false);
    expect(levelsBox()).toBeNull();
  });
});
