import React from 'react';
import { DealActionsContext } from './dealActionsContext';
import {
  useDealActionHost,
  type DealActionHostOptions,
} from './useDealActionHost';

export interface DealActionsProviderProps extends DealActionHostOptions {
  children: React.ReactNode;
}

/** Hosts one surface's deal actions for the menus rendered inside it. */
export function DealActionsProvider({
  children,
  ...options
}: DealActionsProviderProps) {
  const { runner, dialogs } = useDealActionHost(options);
  return (
    <DealActionsContext.Provider value={runner}>
      {children}
      {dialogs}
    </DealActionsContext.Provider>
  );
}
