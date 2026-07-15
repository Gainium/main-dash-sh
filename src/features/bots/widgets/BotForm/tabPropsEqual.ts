import type { BotFormTabComponentProps } from './types';

/**
 * React.memo comparator for section-tab components whose subtree reads the
 * per-keystroke-HOT `formData` and `errors` from the bot form STORE (via
 * `useBotFormSelector` / `useBotFormErrors` / `useBotFormTopLevelSelector`)
 * instead of from these props. It compares only the 12 referentially-stable
 * props and deliberately IGNORES `formData` and `errors`, so a keystroke — which
 * mints new `formData`/`errors` identities but leaves the stable props untouched
 * — no longer busts the tab's memo and re-renders the whole section.
 *
 * ONLY valid for a tab once its entire subtree has stopped consuming `formData`
 * / `errors` from props. A tab that still forwards either prop downstream would
 * freeze that stale value if given this comparator.
 */
export const tabPropsEqualIgnoringHot = (
  a: BotFormTabComponentProps,
  b: BotFormTabComponentProps
): boolean =>
  a.currentExchange === b.currentExchange &&
  a.updateFormData === b.updateFormData &&
  a.mode === b.mode &&
  a.isFieldLocked === b.isFieldLocked &&
  a.getBalance === b.getBalance &&
  a.bot === b.bot &&
  a.handleUpdateBalances === b.handleUpdateBalances &&
  a.exchangesData === b.exchangesData &&
  a.exchangesLoading === b.exchangesLoading &&
  a.activeTab === b.activeTab &&
  a.onTabChange === b.onTabChange &&
  a.features === b.features;
