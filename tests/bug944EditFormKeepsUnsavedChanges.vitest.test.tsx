/**
 * Runner note: `.vitest.test.tsx`, run from the parent:
 *   NODE_ENV=development npx vitest run core/tests/bug944EditFormKeepsUnsavedChanges.vitest.test.tsx
 *
 * On a running bot's Edit page, `bot` is replaced by a new object with the same
 * data again and again (the persisted store rehydrating, list refetches,
 * `bot sends settings` merges). Each new object used to hydrate the form again
 * from the saved settings and clear `isDirty`, so an unsaved edit snapped back
 * a few seconds after it was typed. See specs/054.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { BotFormData } from '@/types/bots/form';

// Minimal stand-in for BotFormProvider's form state: an external store the
// mocked `useBotFormState` subscribes to, with stable setters like the real one.
const form = vi.hoisted(() => {
  type Data = Record<string, unknown>;
  let snapshot = { formData: {} as Data, isDirty: false };
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
    reset: () => emit({ formData: {}, isDirty: false }),
    setFormData: (u: Data | ((p: Data) => Data)) =>
      emit({
        ...snapshot,
        formData: typeof u === 'function' ? u(snapshot.formData) : u,
      }),
    setIsDirty: (v: boolean) => emit({ ...snapshot, isDirty: v }),
    noop: () => undefined,
  };
});

vi.mock('@/contexts/bots/form/BotFormProvider', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useBotFormState: () => {
      const snap = useSyncExternalStore(form.subscribe, form.get);
      return {
        ...snap,
        setFormData: form.setFormData,
        setIsDirty: form.setIsDirty,
        setErrors: form.noop,
        setIsLoading: form.noop,
        setBotVars: form.noop,
      };
    },
  };
});

import {
  useBotFormInitialization,
  type BotSettingsMapper,
} from '@/hooks/bots/forms/useBotFormInitialization';
import { BotTypesEnum } from '@/types';

const mapper: BotSettingsMapper = (_type, settings) => {
  const s = settings as { settings?: { name?: string }; name?: string };
  const name = s.settings?.name ?? s.name ?? '';
  return {
    formData: {
      type: BotTypesEnum.dca,
      name,
      dca: { name },
    } as unknown as BotFormData,
  };
};

type Props = { bot: unknown; botSettings: unknown };

function Harness(props: Props) {
  useBotFormInitialization({
    botType: BotTypesEnum.dca,
    mode: 'edit',
    bot: props.bot,
    botSettings: props.botSettings,
    mapper,
  });
  return null;
}

const bot = (id: string, name: string) => ({ _id: id, settings: { name } });
const settings = (name: string) => ({ settings: { name }, exchangeUUID: 'x' });

let container: HTMLDivElement;
let root: Root;
const render = (p: Props) =>
  act(() => {
    root.render(createElement(Harness, p));
  });
const userTypes = (name: string) =>
  act(() => {
    form.setFormData((prev) => ({ ...prev, name }));
    form.setIsDirty(true);
  });
const name = () => form.get().formData['name'];

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  form.reset();
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
});

describe('bug 944: Edit form keeps unsaved changes (specs/054)', () => {
  it('§1.1 a new bot object with the same data does not revert an unsaved edit', async () => {
    const s = settings('Saved');
    await render({ bot: bot('b1', 'Saved'), botSettings: s });
    expect(name()).toBe('Saved');

    await userTypes('Edited');
    await render({ bot: bot('b1', 'Saved'), botSettings: s });

    expect(name()).toBe('Edited');
    expect(form.get().isDirty).toBe(true);
  });

  it('§1.1 a refetched settings payload for the same bot does not revert an unsaved edit', async () => {
    const b = bot('b1', 'Saved');
    await render({ bot: b, botSettings: settings('Saved') });
    await userTypes('Edited');
    await render({ bot: b, botSettings: settings('Saved') });
    expect(name()).toBe('Edited');
  });

  it('§1.3 after Save (isDirty cleared) the refetched settings are mapped', async () => {
    const b = bot('b1', 'Saved');
    await render({ bot: b, botSettings: settings('Saved') });
    await userTypes('Edited');
    // Save clears isDirty first; the form must not jump back to the old settings then.
    await act(() => form.setIsDirty(false));
    expect(name()).toBe('Edited');
    await render({ bot: bot('b1', 'Edited'), botSettings: settings('Edited') });
    expect(name()).toBe('Edited');
    expect(form.get().isDirty).toBe(false);
  });

  it('§1.3 a clean form still follows new server data', async () => {
    await render({ bot: bot('b1', 'Saved'), botSettings: settings('Saved') });
    await render({
      bot: bot('b1', 'Renamed'),
      botSettings: settings('Renamed'),
    });
    expect(name()).toBe('Renamed');
  });

  it('§3 the full settings payload is still applied when it arrives after bot.settings', async () => {
    const b = bot('b1', 'FromList');
    await render({ bot: b, botSettings: null });
    expect(name()).toBe('FromList');
    await userTypes('Edited');
    await render({ bot: b, botSettings: settings('FromSettings') });
    expect(name()).toBe('FromSettings');
  });

  it('§1.3 moving to a different bot hydrates it even when dirty', async () => {
    await render({ bot: bot('b1', 'One'), botSettings: settings('One') });
    await userTypes('Edited');
    await render({ bot: bot('b2', 'Two'), botSettings: settings('Two') });
    expect(name()).toBe('Two');
  });
});
