/**
 * Runner note: `.vitest.test.tsx`, run from the parent:
 *   NODE_ENV=development npx vitest run core/tests/smartOrdersCountKeptOnOrdersCountEdit.vitest.test.tsx
 *
 * specs/099 — editing "DCA orders" must not rewrite "Smart orders count".
 * Mounts the REAL BotFormProvider and the REAL SmartOrdersControl, then drives
 * `ordersCount` exactly as the DCA orders input does while a user retypes it
 * (clearing the field emits the clamped minimum, 1, before the new digits).
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock('@/components/ui/field-variable-binding', () => ({
  FieldVariableBinding: ({ children }: { children: React.ReactNode }) =>
    children,
}));

import {
  BotFormProvider,
  useBotFormActions,
  useBotFormErrors,
  useBotFormGetFormData,
} from '@/contexts/bots/form/BotFormProvider';
import { DCA_FORM_DEFAULTS } from '@/contexts/bots/form/formDefaults';
import { SmartOrdersControl } from '@/features/bots/bot-types/dca/form/sections/DCASettings';
import { BotFormRegistryContext } from '@/features/bots/widgets/BotForm/context';
import { BotTypesEnum } from '@/types';
import type { BotFormData } from '@/types/bots/form';

const probe: {
  actions: ReturnType<typeof useBotFormActions> | null;
  getFormData: (() => BotFormData) | null;
  errors: Record<string, string>;
} = { actions: null, getFormData: null, errors: {} };

const Harness = () => {
  const actions = useBotFormActions();
  const getFormData = useBotFormGetFormData();
  const errors = useBotFormErrors() as Record<string, string>;
  useEffect(() => {
    probe.actions = actions;
    probe.getFormData = getFormData;
    probe.errors = errors;
  });
  return createElement(SmartOrdersControl, {
    idPrefix: 'scaled',
    updateFormData: actions.updateFormData,
    errors,
  });
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

const mount = async (dca: Partial<BotFormData['dca']>) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  const r = createRoot(host);
  root = r;
  await act(async () => {
    r.render(
      createElement(
        MemoryRouter,
        null,
        createElement(
          BotFormRegistryContext.Provider,
          {
            value: {
              botExperience: { id: BotTypesEnum.dca } as never,
              widgetId: 'test',
            },
          },
          createElement(BotFormProvider, {
            mode: 'edit',
            botType: BotTypesEnum.dca,
            initialFormData: { dca: { ...DCA_FORM_DEFAULTS, ...dca } },
            children: createElement(Harness),
          })
        )
      )
    );
  });
};

const need = <T,>(value: T | null, what: string): T => {
  if (value === null) throw new Error(`${what} missing`);
  return value;
};

const setOrdersCount = async (value: number) => {
  await act(async () => {
    need(probe.actions, 'actions').updateFormData('ordersCount', value);
  });
};
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 300));
  });

const stored = () => need(probe.getFormData, 'getFormData')().dca.activeOrdersCount;
const shown = () =>
  (need(host, 'host').querySelector('#scaled-smart-orders-count') as HTMLInputElement)
    .value;

// A saved bot as the API returns it: numeric counts.
const SAVED_BOT = {
  ordersCount: 35 as unknown as string,
  activeOrdersCount: 5 as unknown as string,
  useSmartOrders: true,
};

describe('smart orders count survives a DCA orders edit (specs/099)', () => {
  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
  });
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
    probe.actions = null;
    probe.getFormData = null;
    probe.errors = {};
  });

  it('§1.1 retyping DCA orders 35 → (cleared) → 3 → 35 keeps smart orders count 5', async () => {
    await mount(SAVED_BOT);
    expect(Number(stored())).toBe(5);
    expect(shown()).toBe('5');

    for (const v of [1, 3, 35]) {
      await setOrdersCount(v);
    }
    await settle();

    expect(Number(stored())).toBe(5);
    expect(shown()).toBe('5');
    expect(probe.errors['activeOrdersCount']).toBeUndefined();
  });

  it('§1.2 DCA orders below the smart count keeps the value and flags an error', async () => {
    await mount(SAVED_BOT);
    await setOrdersCount(3);
    await settle();

    expect(Number(stored())).toBe(5);
    // The field must show what will be saved, not a clamped stand-in.
    expect(shown()).toBe('5');
    expect(probe.errors['activeOrdersCount']).toMatch(/3 or less/);
    // ...and the error is visible on the control itself.
    expect(need(host, 'host').textContent).toMatch(/3 or less/);
  });

  it('§1.3 raising DCA orders back clears the error with the value intact', async () => {
    await mount(SAVED_BOT);
    await setOrdersCount(3);
    await settle();
    await setOrdersCount(35);
    await settle();

    expect(Number(stored())).toBe(5);
    expect(probe.errors['activeOrdersCount']).toBeUndefined();
  });
});
