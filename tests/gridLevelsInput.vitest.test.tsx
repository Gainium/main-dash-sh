/**
 * Runner note: renders a React component in jsdom, so it is a Vitest file. Run
 * from the parent with `NODE_ENV=development` (a production React build has no
 * `React.act`):
 * `NODE_ENV=development npx vitest run core/tests/gridLevelsInput.vitest.test.tsx`
 *
 * Spec: `main-dash-redesign/specs/082.grid-levels-zero-freezes-tab.md`.
 *
 * The Grid levels field stored whatever `Number()` made of the text: `20.1`
 * as 20.1, and an empty field or `20,` as 0. A stored 0 is what sent the
 * chart's geometric ladder into an endless loop (§3). The field now stores
 * only whole numbers ≥ 1 and says why it ignores anything else (§1.2), the
 * message goes away as soon as the text is valid again (§1.3), and whole
 * numbers behave as before (§1.4).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const LEVELS_MESSAGE = 'Levels must be a positive integer.';

type Form = Record<string, unknown>;
const store = {
  form: {} as Form,
  listeners: new Set<() => void>(),
  writes: [] as Array<[string, unknown]>,
  set(field: string, value: unknown) {
    store.writes.push([field, value]);
    store.form = { ...store.form, [field]: value };
    store.listeners.forEach((l) => l());
  },
};
const useForm = () =>
  React.useSyncExternalStore(
    (l) => {
      store.listeners.add(l);
      return () => store.listeners.delete(l);
    },
    () => store.form
  );

vi.mock('@/contexts/bots/form/BotFormProvider', () => ({
  useBotFormSelector: (field: string) => useForm()[field],
  useOptionalBotFormState: () => undefined,
  useOptionalBotFormContext: () => undefined,
  useOptionalBotFormBinding: () => null,
  useOptionalBotFormTopLevelSelector: () => undefined,
}));

vi.mock('@/hooks/bots/grid/useGridForm', () => ({
  useGridForm: () => {
    const formData = useForm();
    const levels = Number(formData.levels);
    // The form's own levels rule (utils/bots/grid/validation.ts).
    const errors =
      !Number.isInteger(levels) || levels <= 0
        ? { levels: LEVELS_MESSAGE }
        : {};
    return {
      formState: { formData, updateFormData: store.set, errors },
      quoteAsset: 'USDT',
      latestPrice: 85000,
    };
  },
}));

vi.mock('@/context/TradingTerminalUtilsContext', () => ({
  useTradingTerminalUtils: () => ({
    coordinates: null,
    setCoordinates: () => {},
    activePickerField: null,
    setActivePickerField: () => {},
  }),
}));

import { GridRangeSettings } from '@/features/bots/bot-types/grid/form/sections/GridRangeSettings';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  store.form = {
    pair: ['BTCUSDT'],
    startPrice: '85000',
    topPrice: '105000',
    lowPrice: '64000',
    levels: 20,
    gridStep: '2.5108',
    gridType: 'geometric',
  };
  store.writes = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<GridRangeSettings />);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const field = () => container.querySelector('#grid-levels') as HTMLInputElement;
const showsMessage = () => container.textContent?.includes(LEVELS_MESSAGE);
const storedLevels = () =>
  store.writes.filter(([f]) => f === 'levels').map(([, v]) => v);
const storedSteps = () =>
  store.writes.filter(([f]) => f === 'gridStep').map(([, v]) => v);

const setter = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  'value'
)?.set as (this: HTMLInputElement, value: string) => void;
const typeText = (text: string) =>
  act(() => {
    setter.call(field(), text);
    field().dispatchEvent(new Event('input', { bubbles: true }));
  });
const blur = () =>
  act(() => {
    field().blur();
    field().dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });

describe('Grid levels field', () => {
  it("stores only whole numbers through the reporter's sequence (§1.2, §1.3)", () => {
    const sequence = ['20', '20.', '20.1', '20.12', '20.1', '20.', '20,', '20,1\\', '20,1', '20,', '20'];
    const seen: Array<[string, boolean]> = [];
    for (const text of sequence) {
      typeText(text);
      expect(field().value).toBe(text);
      seen.push([text, Boolean(showsMessage())]);
    }

    for (const v of storedLevels()) {
      expect(Number.isInteger(v) && (v as number) >= 1).toBe(true);
    }
    // The first `20` is the field's current text, so only the return to 20 writes.
    expect(storedLevels()).toEqual([20]);
    expect(seen).toEqual([
      ['20', false],
      ['20.', true],
      ['20.1', true],
      ['20.12', true],
      ['20.1', true],
      ['20.', true],
      ['20,', true],
      ['20,1\\', true],
      ['20,1', true],
      ['20,', true],
      ['20', false],
    ]);
  });

  it('never stores 0 for an emptied field, and accepts the retyped count (§1.1, §1.2)', () => {
    typeText('2');
    typeText('');
    expect(storedLevels()).not.toContain(0);
    expect(showsMessage()).toBe(true);
    typeText('2');
    typeText('25');
    expect(storedLevels()).toEqual([2, 2, 25]);
    expect(showsMessage()).toBe(false);
  });

  it('recalculates the grid step only from whole numbers (§1.2, §1.4)', () => {
    typeText('20.1');
    typeText('20,');
    expect(storedSteps()).toEqual([]);
    typeText('10');
    expect(storedSteps()).toEqual([
      (((105000 / 64000) ** (1 / 10) - 1) * 100).toFixed(4),
    ]);
  });

  it('leaving the field with an invalid draft shows the last valid count (§1.3)', () => {
    typeText('20.1');
    expect(showsMessage()).toBe(true);
    blur();
    expect(field().value).toBe('20');
    expect(showsMessage()).toBe(false);
  });
});
