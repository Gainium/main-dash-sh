import type { LucideIcon } from 'lucide-react';
import React, { Fragment, useCallback } from 'react';
import { useStore } from 'zustand';
import {
  useOptionalBotFormStoreApi,
  type BotFormMode,
  type BotFormTabId,
} from '@/contexts/bots/form/BotFormProvider';
import {
  EMPTY_BOT_FORM_STORE,
  type BotFormStore,
} from '@/contexts/bots/form/botFormStore';
import type {
  BotFormSectionHeaderControlsProps,
  BotFormTabComponentProps,
  BotFormTabDescriptor,
} from '@/features/bots/widgets/BotForm/types';

// Bot form extensions — lets a host build add whole sections to the bot form,
// keep its own draft inside the form (so it rides the form's Save), and
// decorate a bot's header. Unregistered (the default) ⇒ the form, the drawer
// and the save flow behave exactly as before.
//
//   registerBotFormSection({ id: 'notes', label: 'Notes', icon, Component });
//   registerBotFormSaveHook({ key: 'notes', afterSave: async (ctx) => … });
//   registerBotHeaderDecorator({ key: 'notes', useDecoration: (ctx) => … });

// ---------------------------------------------------------------------
// Extension draft state (lives in the form store)
// ---------------------------------------------------------------------

export interface BotFormExtensionValueHandle<T> {
  /** The draft, or undefined until its owner seeds it. */
  value: T | undefined;
  /**
   * Replace the draft. `markDirty` flags the form as having unsaved changes
   * (enables Save); seeding from saved state must not.
   * `T` must not itself be a function.
   */
  setValue: (
    next: T | ((prev: T | undefined) => T),
    options?: { markDirty?: boolean }
  ) => void;
  /** False outside a bot form. */
  available: boolean;
}

/** An extension's draft inside the surrounding bot form. */
export function useBotFormExtensionValue<T>(
  key: string
): BotFormExtensionValueHandle<T> {
  const store = useOptionalBotFormStoreApi();
  const value = useStore(
    store ?? EMPTY_BOT_FORM_STORE,
    (s) => s.extensionState[key]
  ) as T | undefined;
  const setValue = useCallback(
    (
      next: T | ((prev: T | undefined) => T),
      options?: { markDirty?: boolean }
    ) => {
      if (!store) return;
      store.setState((prev) => {
        const current = prev.extensionState[key] as T | undefined;
        const resolved =
          typeof next === 'function'
            ? (next as (p: T | undefined) => T)(current)
            : next;
        return {
          extensionState: { ...prev.extensionState, [key]: resolved },
          ...(options?.markDirty ? { isDirty: true } : {}),
        };
      });
    },
    [store, key]
  );
  return { value, setValue, available: !!store };
}

// ---------------------------------------------------------------------
// Save hooks
// ---------------------------------------------------------------------

export interface BotFormSaveHookContext {
  mode: BotFormMode;
  botType: string;
  /** Saved bot id; undefined in `validate` while creating. */
  botId?: string | undefined;
  /** The hook's draft (`extensionState[key]`). */
  value: unknown;
  /** Write the hook's draft (e.g. field errors) without marking dirty. */
  setValue: (value: unknown) => void;
  /** A bot setting's current form value (the active bot type's slice, then
   *  the form's own fields such as `name`). */
  getField: (field: string) => unknown;
}

export interface BotFormSaveHook {
  /** Also the `extensionState` key the hook reads. */
  key: string;
  /**
   * Runs before the bot is saved. Return a message to block the save (the
   * form shows it as a toast); put field-level detail into the draft.
   */
  validate?: (ctx: BotFormSaveHookContext) => string | null;
  /**
   * Runs after the bot was created / updated, with its id. Throw to report a
   * failure: the bot stays saved, the form stays dirty and the message is
   * shown.
   */
  afterSave?: (
    ctx: BotFormSaveHookContext & { botId: string }
  ) => Promise<void>;
}

const saveHooks: BotFormSaveHook[] = [];

/** Register (or replace, by `key`) a bot form save hook. Call at boot. */
export function registerBotFormSaveHook(hook: BotFormSaveHook): void {
  const index = saveHooks.findIndex((h) => h.key === hook.key);
  if (index >= 0) saveHooks[index] = hook;
  else saveHooks.push(hook);
}

interface SaveRunContext {
  mode: BotFormMode;
  botType: string;
  botId?: string | undefined;
}

function hookContext(
  store: BotFormStore,
  hook: BotFormSaveHook,
  run: SaveRunContext
): BotFormSaveHookContext {
  return {
    ...run,
    value: store.getState().extensionState[hook.key],
    setValue: (value) =>
      store.setState((prev) => ({
        extensionState: { ...prev.extensionState, [hook.key]: value },
      })),
    getField: (field) => {
      const { formData } = store.getState();
      const type = String(formData.type);
      const slice =
        type === 'combo'
          ? formData.combo
          : type === 'grid'
            ? formData.grid
            : formData.dca;
      const value = (slice as Record<string, unknown> | undefined)?.[field];
      // Form-level fields (e.g. `name`) live outside the type's slice.
      return value !== undefined
        ? value
        : (formData as unknown as Record<string, unknown>)[field];
    },
  };
}

/** First blocking message from the registered validators, or null. */
export function validateBotFormExtensions(
  store: BotFormStore,
  run: SaveRunContext
): string | null {
  for (const hook of saveHooks) {
    const message = hook.validate?.(hookContext(store, hook, run)) ?? null;
    if (message) return message;
  }
  return null;
}

/** Runs every `afterSave`; returns the failure messages (empty = all ok). */
export async function runBotFormAfterSave(
  store: BotFormStore,
  run: SaveRunContext & { botId: string }
): Promise<string[]> {
  const failures: string[] = [];
  for (const hook of saveHooks) {
    if (!hook.afterSave) continue;
    try {
      await hook.afterSave({ ...hookContext(store, hook, run), botId: run.botId });
    } catch (error) {
      failures.push(
        error instanceof Error && error.message ? error.message : String(error)
      );
    }
  }
  return failures;
}

// ---------------------------------------------------------------------
// Form sections
// ---------------------------------------------------------------------

export interface BotFormSectionContext {
  botType: string;
  mode: BotFormMode;
  isTerminal: boolean;
  isNestedLeg: boolean;
}

export interface BotFormSectionExtension {
  /** Rendered as section id `ext-<id>` (header path `section:ext-<id>`). */
  id: string;
  label: string;
  icon: LucideIcon;
  description?: string;
  tooltipText?: string;
  /** Insert before this built-in section; appended when absent/missing. */
  before?: BotFormTabId;
  /** Plain function (not a hook). Default: visible. */
  isVisible?: (ctx: BotFormSectionContext) => boolean;
  Component: React.ComponentType<BotFormTabComponentProps>;
  /**
   * The section's own header switch (rendered where built-in sections show
   * their enable switch, with the collapse chevron passed in). The section's
   * `Component` decides what its body shows while off.
   */
  HeaderControls?: React.ComponentType<BotFormSectionHeaderControlsProps>;
}

const sections: BotFormSectionExtension[] = [];

/** Register (or replace, by `id`) a bot form section. Call at boot. */
export function registerBotFormSection(section: BotFormSectionExtension): void {
  const index = sections.findIndex((s) => s.id === section.id);
  if (index >= 0) sections[index] = section;
  else sections.push(section);
}

/** `descriptors` plus the registered sections visible in `ctx`. */
export function withBotFormExtensionSections(
  descriptors: BotFormTabDescriptor[],
  ctx: BotFormSectionContext
): BotFormTabDescriptor[] {
  if (sections.length === 0) return descriptors;
  const out = [...descriptors];
  for (const section of sections) {
    if (section.isVisible && !section.isVisible(ctx)) continue;
    const descriptor: BotFormTabDescriptor = {
      id: `ext-${section.id}`,
      label: section.label,
      icon: section.icon,
      Component: section.Component,
      isDca: true,
      isTerminal: false,
      ...(section.description ? { description: section.description } : {}),
      ...(section.tooltipText ? { tooltipText: section.tooltipText } : {}),
      ...(section.HeaderControls
        ? { HeaderControls: section.HeaderControls }
        : {}),
    };
    const at = section.before
      ? out.findIndex((d) => d.id === section.before)
      : -1;
    if (at >= 0) out.splice(at, 0, descriptor);
    else out.push(descriptor);
  }
  return out;
}

// ---------------------------------------------------------------------
// Bot header decorators
// ---------------------------------------------------------------------

export interface BotHeaderContext {
  botId?: string | undefined;
  botType?: string | undefined;
  /** `drawer`: the bot drawer title bar; `form`: the bot form's header. */
  surface: 'drawer' | 'form';
}

export interface BotHeaderDecoration {
  /** Extra classes for the header container. */
  className?: string;
  /** Rendered next to the bot's title. */
  adornment?: React.ReactNode;
}

export interface BotHeaderDecorator {
  key: string;
  /**
   * Hook returning the decoration, or null. Registered once at boot and
   * called on every render of every decorated header, so it must obey the
   * rules of hooks.
   */
  useDecoration: (ctx: BotHeaderContext) => BotHeaderDecoration | null;
}

const headerDecorators: BotHeaderDecorator[] = [];

/** Register (or replace, by `key`) a bot header decorator. Call at boot. */
export function registerBotHeaderDecorator(decorator: BotHeaderDecorator): void {
  const index = headerDecorators.findIndex((d) => d.key === decorator.key);
  if (index >= 0) headerDecorators[index] = decorator;
  else headerDecorators.push(decorator);
}

/** Merged decoration of every registered decorator. */
export function useBotHeaderDecoration(ctx: BotHeaderContext): {
  className: string | undefined;
  adornment: React.ReactNode;
} {
  // Registered once at boot — stable order, so a fixed hook list.
  const results = headerDecorators.map((d) => d.useDecoration(ctx));
  const classNames = results
    .map((r) => r?.className)
    .filter((c): c is string => !!c);
  const adornments = results
    .map((r) => r?.adornment)
    .filter((a) => a !== undefined && a !== null && a !== false);
  return {
    className: classNames.length ? classNames.join(' ') : undefined,
    adornment: adornments.length
      ? adornments.map((a, i) => <Fragment key={i}>{a}</Fragment>)
      : null,
  };
}
