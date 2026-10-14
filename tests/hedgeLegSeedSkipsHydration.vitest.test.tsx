/**
 * Runner note: `.vitest.test.tsx`, run from the parent:
 *   NODE_ENV=development npx vitest run core/tests/hedgeLegSeedSkipsHydration.vitest.test.tsx
 *
 * The hedge edit page mounts only the active leg. On a tab switch it snapshots
 * the outgoing leg's form data and remounts that leg with the snapshot as its
 * `initialFormData`, still passing the saved leg bot as `initialBot`. The
 * edit-mode hydration then mapped the saved bot over the snapshot on every
 * remount, so the leg's unsaved edits were lost. See specs/116.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { BotFormData } from '@/types/bots/form';

const form = vi.hoisted(() => {
  type Data = Record<string, unknown>;
  let snapshot = { formData: {} as Data, isDirty: false, isLoading: true };
  const listeners = new Set<() => void>();
  const emit = (next: typeof snapshot) => {
    snapshot = next;
    listeners.forEach((l) => l());
  };
  return {
    get: () => snapshot,
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    // A freshly mounted provider: `initialFormData` is already the form state.
    mount: (formData: Data) =>
      emit({ formData, isDirty: false, isLoading: true }),
    setFormData: (u: Data | ((p: Data) => Data)) =>
      emit({
        ...snapshot,
        formData: typeof u === 'function' ? u(snapshot.formData) : u,
      }),
    setIsDirty: (v: boolean) => emit({ ...snapshot, isDirty: v }),
    setIsLoading: (v: boolean) => emit({ ...snapshot, isLoading: v }),
    noop: () => undefined,
  };
});

vi.mock('@/contexts/bots/form/BotFormProvider', () => {
  const setters = {
    setFormData: form.setFormData,
    setIsDirty: form.setIsDirty,
    setErrors: form.noop,
    setIsLoading: form.setIsLoading,
    setBotVars: form.noop,
  };
  const storeApi = { getState: form.get, subscribe: form.subscribe };
  return {
    useBotFormContext: () => setters,
    useBotFormStoreApi: () => storeApi,
  };
});

import {
  useBotFormInitialization,
  type BotSettingsMapper,
} from '@/hooks/bots/forms/useBotFormInitialization';
import { BotTypesEnum } from '@/types';

const mapper: BotSettingsMapper = (_type, settings) => {
  const s = settings as { maxNumberOfOpenDeals?: string };
  return {
    formData: {
      type: BotTypesEnum.combo,
      maxNumberOfOpenDeals: s.maxNumberOfOpenDeals,
      // The hook deep-copies this block into `originalBot`; without it the
      // copy throws inside its try/catch and nothing is hydrated at all.
      combo: { maxNumberOfOpenDeals: s.maxNumberOfOpenDeals },
    } as unknown as BotFormData,
  };
};

type Props = { bot: unknown; skipHydration?: boolean };

function Harness({ bot, skipHydration }: Props) {
  useBotFormInitialization({
    botType: BotTypesEnum.combo,
    mode: 'edit',
    bot,
    mapper,
    ...(skipHydration !== undefined ? { skipHydration } : {}),
  });
  return null;
}

const savedLeg = { _id: 'leg-long', settings: { maxNumberOfOpenDeals: '1' } };
const openDeals = () => form.get().formData['maxNumberOfOpenDeals'];

let container: HTMLDivElement;
let root: Root;
const render = (p: Props) =>
  act(() => {
    root.render(createElement(Harness, p));
  });

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
});

describe('hedge leg remount keeps its tab-switch snapshot (specs/116)', () => {
  it('§4.1 a leg mounted with skipHydration keeps the snapshot and finishes loading', async () => {
    form.mount({ maxNumberOfOpenDeals: '3' });
    await render({ bot: savedLeg, skipHydration: true });

    expect(openDeals()).toBe('3');
    expect(form.get().isLoading).toBe(false);
  });

  it('§4.1 skipHydration is read on mount: a later flip does not hydrate that mount', async () => {
    form.mount({ maxNumberOfOpenDeals: '3' });
    await render({ bot: savedLeg, skipHydration: true });
    await render({
      bot: { ...savedLeg, settings: { maxNumberOfOpenDeals: '1' } },
      skipHydration: false,
    });

    expect(openDeals()).toBe('3');
  });

  it('§4.4 without skipHydration the saved bot is still mapped on mount', async () => {
    form.mount({ maxNumberOfOpenDeals: '3' });
    await render({ bot: savedLeg });

    expect(openDeals()).toBe('1');
    expect(form.get().isLoading).toBe(false);
  });
});
