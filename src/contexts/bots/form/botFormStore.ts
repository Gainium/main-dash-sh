import { createStore, type StoreApi } from 'zustand/vanilla';

import type {
  BotFormAlert,
  BotFormAlerts,
  BotFormData,
  BotFormErrors,
} from '@/types/bots/form';

/**
 * Per-keystroke-HOT bot-form state, lifted out of React into a zustand vanilla
 * store so a single field edit no longer mints a new context value and
 * re-renders every form section. One store instance is created per
 * `BotFormProvider` (see `createBotFormStore`); the provider hands the STABLE
 * store reference down through context and consumers subscribe to just the
 * slice they read via `useStore(store, selector)`.
 *
 * Only the four hot fields live here (`formData`, `errors`, `alerts`,
 * `isDirty`) plus `componentErrors` (the second half of the merged-alerts
 * pipeline, co-located so alerts can be merged in the consumer hook). Rarely
 * changing flags (mode, activeTab, edit locks, quick-setup mode, botVars, …)
 * stay as ordinary React state in the provider and ride the context value —
 * they simply never change on a keystroke.
 */
export interface BotFormStoreState {
  formData: BotFormData;
  errors: BotFormErrors;
  /** Raw alerts produced by hot validation (what `setAlerts` writes). */
  alerts: BotFormAlerts;
  /** Alerts registered imperatively by descendant components. */
  componentErrors: BotFormAlerts;
  isDirty: boolean;
}

export type BotFormStore = StoreApi<BotFormStoreState>;

export const createBotFormStore = (
  initialFormData: BotFormData
): BotFormStore =>
  createStore<BotFormStoreState>(() => ({
    formData: initialFormData,
    errors: {},
    alerts: {},
    componentErrors: {},
    isDirty: false,
  }));

/**
 * Stable no-op store for hooks that may run OUTSIDE a `BotFormProvider`
 * (`useOptionalBotFormState`). Keeping a real store means those hooks can
 * unconditionally call `useStore(...)` (hook-order safety) and still return
 * `undefined` when there is no surrounding provider.
 */
export const EMPTY_BOT_FORM_STORE: BotFormStore =
  createStore<BotFormStoreState>(() => ({
    // dca/combo/grid are present-but-empty so `useBotFormSelector`'s selector
    // can safely read `formData.dca[key]` and fall back to its default when the
    // hook is (mis)used outside a provider — it throws right after, but the
    // selector must not crash first.
    formData: { dca: {}, combo: {}, grid: {} } as BotFormData,
    errors: {},
    alerts: {},
    componentErrors: {},
    isDirty: false,
  }));

/**
 * Structural identity of a single alert: variant + message + navId. This is the
 * canonical fingerprint used for both dedup (in `mergeBotFormAlerts`) and cheap
 * change-detection (in the provider's validation guard, instead of
 * `JSON.stringify`). Two alerts with the same fingerprint are treated as equal.
 */
export const alertFingerprint = (
  alert: BotFormAlert | null | undefined
): string =>
  `${alert?.variant ?? ''}::${alert?.message ?? ''}::${alert?.navId ?? ''}`;

/**
 * Cheap equality for `BotFormErrors` (a flat `Record<field, string>`): same key
 * set + per-key string equality. Replaces a `JSON.stringify` compare on the hot
 * validation path.
 */
export const botFormErrorsEqual = (
  a: BotFormErrors,
  b: BotFormErrors
): boolean => {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  for (const key of aKeys) {
    if (
      (a as Record<string, string>)[key] !==
      (b as Record<string, string>)[key]
    ) {
      return false;
    }
  }
  return true;
};

/**
 * Cheap equality for `BotFormAlerts` (a `Record<field, BotFormAlert[]>`): same
 * key set, same per-key array length, and matching alert fingerprints in order.
 * Replaces a `JSON.stringify` compare on the hot validation path.
 */
export const botFormAlertsEqual = (
  a: BotFormAlerts,
  b: BotFormAlerts
): boolean => {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  for (const key of aKeys) {
    const aArr = (a as Record<string, BotFormAlert[] | undefined>)[key];
    const bArr = (b as Record<string, BotFormAlert[] | undefined>)[key];
    if (aArr === bArr) {
      continue;
    }
    if (!aArr || !bArr || aArr.length !== bArr.length) {
      return false;
    }
    for (let i = 0; i < aArr.length; i++) {
      // Full field-wise compare — `title`/`description` can change while the
      // dedup fingerprint (variant/message/navId) stays the same, and a
      // changed tooltip must still reach the store.
      const aAlert = aArr[i];
      const bAlert = bArr[i];
      if (
        aAlert.variant !== bAlert.variant ||
        aAlert.message !== bAlert.message ||
        aAlert.navId !== bAlert.navId ||
        aAlert.title !== bAlert.title ||
        aAlert.description !== bAlert.description
      ) {
        return false;
      }
    }
  }
  return true;
};

/**
 * Merge hot-validation alerts with imperatively-registered component errors.
 * Extracted verbatim from the provider's old `mergedAlerts` useMemo so the
 * consumer hooks (`useBotFormState`, `useOptionalBotFormState`) can compute it
 * from the store instead of the provider recomputing it on every keystroke.
 */
export const mergeBotFormAlerts = (
  alerts: BotFormAlerts,
  componentErrors: BotFormAlerts
): BotFormAlerts => {
  const result: BotFormAlerts = {};

  // Validation alerts first.
  for (const [key, value] of Object.entries(alerts)) {
    (result as Record<string, BotFormAlert[]>)[key] = value as BotFormAlert[];
  }

  // Component errors — merge with existing alerts if present.
  for (const [key, value] of Object.entries(componentErrors)) {
    const existing = (result as Record<string, BotFormAlert[] | undefined>)[
      key
    ];
    if (existing && Array.isArray(existing)) {
      const merged = [...existing, ...((value as BotFormAlert[]) ?? [])];
      const deduped: BotFormAlert[] = [];
      const seen = new Set<string>();
      for (const alert of merged) {
        const fingerprint = alertFingerprint(alert);
        if (!seen.has(fingerprint)) {
          seen.add(fingerprint);
          deduped.push(alert);
        }
      }
      (result as Record<string, BotFormAlert[]>)[key] = deduped;
    } else {
      (result as Record<string, BotFormAlert[]>)[key] = value as BotFormAlert[];
    }
  }

  return result;
};
