import { useMemo } from 'react';

import {
  useTradingPairsFromContext,
  useTransformedExchangesFromContext,
} from '@/contexts/ExchangeDataContext';
import { addSymbolToPositions } from '@/features/trading-terminal/components/exchangeOrderColumns';
import { useMarkPrices } from '@/features/trading-terminal/utils/useMarkPrices';
import { useExchangePositions } from '@/hooks/useExchangeOrdersPositions';
import { isFuturesExchange } from '@/utils/exchangeUtils';

import { summarizeFutures, type FuturesAccountInput } from './futuresSummary';

/**
 * Wires the Portfolio futures card to the data the terminal's Positions tab
 * already uses (same query, same ticker feed, same P&L helper), so the two
 * pages can't disagree. Nothing is fetched for users without a futures
 * account: `getAllOpenPositions` calls every futures exchange live.
 */
export function useFuturesSummary() {
  const { exchanges } = useTransformedExchangesFromContext();
  const { pairsByExchange } = useTradingPairsFromContext();

  const accounts = useMemo<FuturesAccountInput[]>(
    () =>
      exchanges
        .filter((ex) => ex.type === 'exchange' && isFuturesExchange(ex.provider))
        .map((ex) => ({
          id: ex.id,
          name: ex.name,
          provider: ex.provider,
          balance: ex.balance,
        })),
    [exchanges]
  );
  const hasFutures = accounts.length > 0;

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
    accounts,
    summary,
    isLoading: positionsQ.isLoading,
    error: positionsQ.error,
    refetch: positionsQ.refetch,
  };
}
