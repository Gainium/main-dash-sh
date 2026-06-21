/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useMemo, useState } from 'react';

export interface PortfolioContextValue {
  selectedExchanges: string[];
  setSelectedExchanges: (exchangeIds: string[]) => void;
}

export const PortfolioContext = createContext<
  PortfolioContextValue | undefined
>(undefined);

interface PortfolioProviderProps {
  children: React.ReactNode;
}

export const PortfolioProvider: React.FC<PortfolioProviderProps> = ({
  children,
}) => {
  const [selectedExchanges, setSelectedExchanges] = useState<string[]>(['ALL']);

  // Memoize so the context value keeps a stable identity across renders.
  // Without this, every PortfolioProvider render produced a fresh object,
  // re-rendering all consumers; PortfolioValue then compared its
  // exchange-selection array by reference and called setState in an effect,
  // driving an infinite render loop (React #185) on /overview.
  const value: PortfolioContextValue = useMemo(
    () => ({
      selectedExchanges,
      setSelectedExchanges,
    }),
    [selectedExchanges]
  );

  return (
    <PortfolioContext.Provider value={value}>
      {children}
    </PortfolioContext.Provider>
  );
};
