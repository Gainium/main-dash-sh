import { createContext, useContext, type ReactNode } from 'react';

import type { BotTypesEnum } from '@/types';

/**
 * Cross-cutting page context provided by BotPageBoundary. No regular page
 * needs to read this today — it exists because the boundary hoists the
 * page-shape concerns (guard result, mode) out of the six widgets and
 * declares them once. Future consumers: telemetry, the form, hedge.
 */
export interface BotPageContextValue {
  botType: BotTypesEnum;
  /** '' in create. */
  botId: string;
  mode: 'create' | 'edit';
  /** Guard result; false in create / when the guard is disabled. */
  notFound: boolean;
  /** Guard probes in flight; false in create. */
  isResolving: boolean;
}

const BotPageContext = createContext<BotPageContextValue | undefined>(
  undefined
);

export function useBotPageContext(): BotPageContextValue {
  const ctx = useContext(BotPageContext);
  if (ctx === undefined) {
    throw new Error(
      'useBotPageContext must be used within a BotPageBoundary provider'
    );
  }
  return ctx;
}

/**
 * Pure render wrapper — no hook cost, so it cannot perturb hook order in the
 * consuming tree.
 */
export function BotPageContextProvider({
  value,
  children,
}: {
  value: BotPageContextValue;
  children: ReactNode;
}) {
  return (
    <BotPageContext.Provider value={value}>{children}</BotPageContext.Provider>
  );
}

export { BotPageContext };
