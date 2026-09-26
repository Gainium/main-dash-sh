import type { BotFormTabComponentProps } from './types';

/**
 * React.memo comparator for section tabs. The tab props no longer carry any
 * per-keystroke state (see BotFormTabComponentProps), so this is a plain
 * field-by-field compare of the stable props; it stays as a named comparator
 * so the tabs keep one explicit equality rule.
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
  a.onTabChange === b.onTabChange &&
  a.features === b.features;
