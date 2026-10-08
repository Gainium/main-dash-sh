import { createContext, useContext } from 'react';
import type { DealActionId } from './dealActionRegistry';
import type { DealRef } from './dealRef';

export interface DealActionRunner {
  /**
   * Run an action on one deal or a selection. Actions that ask first open
   * their dialog; single-deal actions take the first deal.
   */
  run: (id: DealActionId, deals: DealRef[], options?: DealRunOptions) => void;
}

export interface DealRunOptions {
  /**
   * Selected deals the action could not take (a bulk run on a mixed
   * selection); the summary reports them as skipped.
   */
  skipped?: number;
}

export const DealActionsContext = createContext<DealActionRunner | null>(null);

/** The runner of the nearest `<DealActionsProvider>`. */
export function useDealActionRunner(): DealActionRunner {
  const runner = useContext(DealActionsContext);
  if (!runner) {
    throw new Error(
      'Deal action menus must be rendered inside <DealActionsProvider>'
    );
  }
  return runner;
}
