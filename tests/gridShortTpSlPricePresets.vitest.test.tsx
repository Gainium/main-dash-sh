/**
 * Runner note: renders React components in jsdom, so it is a Vitest file. Run
 * from the parent with `NODE_ENV=development`:
 * `NODE_ENV=development npx vitest run core/tests/gridShortTpSlPricePresets.vitest.test.tsx`
 *
 * Spec: `main-dash-redesign/specs/093.grid-short-tp-sl-price-presets.md`.
 *
 * A short grid takes profit as the price falls and stops out as it rises
 * (the engine's `tpSl()`), so its "Target price" shortcuts must point the
 * other way from a long grid's: take profit −5% / −10% / custom −N%, stop
 * loss +5% / +10% / custom +N% (§1.1). Long grids are unchanged (§1.3).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

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
  useGridForm: () => ({
    formState: { formData: useForm(), updateFormData: store.set, errors: {} },
    quoteAsset: 'USDC',
    latestPrice: 100,
  }),
}));

vi.mock('@/context/TradingTerminalUtilsContext', () => ({
  useTradingTerminalUtils: () => ({
    coordinates: null,
    setCoordinates: () => {},
    activePickerField: null,
    setActivePickerField: undefined,
  }),
}));

import { GridTakeProfitSettings } from '@/features/bots/bot-types/grid/form/sections/GridTakeProfitSettings';
import { GridStopLossSettings } from '@/features/bots/bot-types/grid/form/sections/GridStopLossSettings';

const SHORT_FUTURES = {
  futures: true,
  futuresStrategy: 'SHORT',
  // The engine ignores `strategy` on a non-neutral futures grid; the
  // reporter's short grids carry `strategy: LONG`.
  strategy: 'LONG',
};
const LONG_FUTURES = { futures: true, futuresStrategy: 'LONG', strategy: 'LONG' };
const SHORT_SPOT = { futures: false, strategy: 'SHORT' };
const NEUTRAL_FUTURES_SHORT_STRATEGY = {
  futures: true,
  futuresStrategy: 'NEUTRAL',
  strategy: 'SHORT',
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const mount = (Component: React.FC, side: Form) => {
  store.form = {
    startPrice: '100',
    tpSl: true,
    tpSlCondition: 'priceReached',
    sl: true,
    slCondition: 'priceReached',
    ...side,
  };
  store.writes = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  const host = container;
  act(() => {
    root = createRoot(host);
    root.render(<Component />);
  });
};

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const host = () => container as HTMLDivElement;
const presetButtons = () =>
  Array.from(host().querySelectorAll('button')).filter((b) =>
    /%$/.test(b.textContent ?? '')
  );
const presetLabels = () => presetButtons().map((b) => b.textContent);
const chipSign = () =>
  host().querySelector('label span[aria-hidden="true"]')?.textContent;
const written = (field: string) =>
  store.writes.filter(([f]) => f === field).map(([, v]) => Number(v));
const preset = (label: string) =>
  presetButtons().find((b) => b.textContent === label) as HTMLButtonElement;
const click = (label: string) =>
  act(() => {
    preset(label).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
const typeCustom = (text: string) => {
  const input = host().querySelector('label input') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value'
  )?.set as (this: HTMLInputElement, value: string) => void;
  act(() => {
    input.focus();
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => {
    input.blur();
  });
};
const isActive = (label: string) =>
  preset(label).className.includes('text-primary-foreground');

describe('Grid take profit price shortcuts', () => {
  it.each([
    ['short futures (strategy LONG)', SHORT_FUTURES],
    ['short spot', SHORT_SPOT],
    ['neutral futures with strategy SHORT', NEUTRAL_FUTURES_SHORT_STRATEGY],
  ])('point below start on a %s grid (§1.1)', (_name, side) => {
    mount(GridTakeProfitSettings, side);
    expect(presetLabels()).toEqual(['-5%', '-10%']);
    expect(chipSign()).toBe('−');
    click('-10%');
    typeCustom('11');
    expect(written('tpTopPrice')).toEqual([90, 89]);
  });

  it('highlights the matching short preset (§1.1)', () => {
    mount(GridTakeProfitSettings, { ...SHORT_FUTURES, tpTopPrice: 95 });
    expect(isActive('-5%')).toBe(true);
    expect(isActive('-10%')).toBe(false);
  });

  it('is unchanged on a long grid (§1.3)', () => {
    mount(GridTakeProfitSettings, LONG_FUTURES);
    expect(presetLabels()).toEqual(['+5%', '+10%']);
    expect(chipSign()).toBe('+');
    click('+10%');
    typeCustom('11');
    expect(written('tpTopPrice')).toEqual([110, 111]);
  });
});

describe('Grid stop loss price shortcuts', () => {
  it('point above start on a short grid (§1.1)', () => {
    mount(GridStopLossSettings, SHORT_FUTURES);
    expect(presetLabels()).toEqual(['+5%', '+10%']);
    expect(chipSign()).toBe('+');
    click('+5%');
    typeCustom('12');
    expect(written('slLowPrice')).toEqual([105, 112]);
  });

  it('highlights the matching short preset (§1.1)', () => {
    mount(GridStopLossSettings, { ...SHORT_FUTURES, slLowPrice: 110 });
    expect(isActive('+10%')).toBe(true);
  });

  it('is unchanged on a long grid (§1.3)', () => {
    mount(GridStopLossSettings, LONG_FUTURES);
    expect(presetLabels()).toEqual(['-5%', '-10%']);
    expect(chipSign()).toBe('−');
    click('-5%');
    typeCustom('12');
    expect(written('slLowPrice')).toEqual([95, 88]);
  });
});
