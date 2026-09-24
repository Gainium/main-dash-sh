import { useContext, useMemo } from 'react';

import {
  useTradingPairsFromContext,
  useTransformedExchangesFromContext,
} from '@/contexts/ExchangeDataContext';
import { addSymbolToPositions } from '@/features/trading-terminal/components/exchangeOrderColumns';
import { useMarkPrices } from '@/features/trading-terminal/utils/useMarkPrices';
import { useExchangePositions } from '@/hooks/useExchangeOrdersPositions';
import { PortfolioContext } from '@/contexts/PortfolioContext';

import { selectFuturesAccounts, summarizeFutures } from './futuresSummary';

/**
 * Wires the Portfolio futures card to the data the terminal's Positions tab
 * already uses (same query, same ticker feed, same P&L helper), so the two
 * pages can't disagree. Nothing is fetched for users without a futures
 * account: `getAllOpenPositions` calls every futures exchange live.
 */
export function useFuturesSummary() {
  const { exchanges } = useTransformedExchangesFromContext();
  const { pairsByExchange } = useTradingPairsFromContext();

  const selection = useContext(PortfolioContext)?.selectedExchanges;

  // Every futures account decides whether to fetch at all; the selection only
  // decides what is shown, so switching it never issues a request.
  const allFutures = useMemo(
    () => selectFuturesAccounts(exchanges, undefined),
    [exchanges]
  );
  const accounts = useMemo(
    () => selectFuturesAccounts(exchanges, selection),
    [exchanges, selection]
  );
  const hasFutures = allFutures.length > 0;

  const positionsQ = useExchangePositions('all', hasFutures);
  const markPriceFor = useMarkPrices(hasFutures);

  const summary = useMemo(() => {
    const rows = addSymbolToPositions(
      positionsQ.error ? [] : positionsQ.positions,
      pairsByExchange,
      markPriceFor
    );
    return summarizeFutures({
      accounts,
      positions: rows,
      positionsKnown: !positionsQ.isLoading && !positionsQ.error,
    });
  }, [
    accounts,
    positionsQ.positions,
    positionsQ.isLoading,
    positionsQ.error,
    pairsByExchange,
    markPriceFor,
  ]);

  return {
    hasFutures,
    // False when the account selection leaves no futures account: hide.
    hasSelectedFutures: accounts.length > 0,
    accounts,
    summary,
    isLoading: positionsQ.isLoading,
    error: positionsQ.error,
    refetch: positionsQ.refetch,
  };
}
