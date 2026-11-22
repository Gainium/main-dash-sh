import { useMemo } from 'react';
import { useGraphQL } from './useGraphQL';
import { otherQueries } from '@/lib/api/GraphQLQueries-other-queries';
import type { ReturnResult } from '@/lib/api';
import type { GeneralOpenOrder, GeneralOpenPosition } from '@/types';

export interface UseExchangeOrdersResult {
  orders: GeneralOpenOrder[];
  isLoading: boolean;
  error: Error | null;
  /** Set when the list is partial: names the accounts that could not be read. */
  partialReason: string | null;
  refetch: () => void;
}

export interface UseExchangePositionsResult {
  positions: GeneralOpenPosition[];
  isLoading: boolean;
  error: Error | null;
  /** Set when the list is partial: names the accounts that could not be read. */
  partialReason: string | null;
  refetch: () => void;
}

/**
 * Read an open-orders/positions answer. The backend reads every exchange
 * account and reports the ones it could not read in the envelope instead of
 * listing them as empty: NOTOK + `reason` when every requested account failed,
 * OK + `reason` when the list is partial. `useGraphQL` resolves on NOTOK, so
 * the caller has to look at the envelope itself.
 */
export function readOpenListAnswer<T>(
  answer: ReturnResult<T[]> | undefined
): { rows: T[]; notOkReason: string | null; partialReason: string | null } {
  if (answer?.status === 'NOTOK') {
    return {
      rows: [],
      notOkReason: answer.reason || 'Could not read the exchange',
      partialReason: null,
    };
  }
  return {
    rows: answer?.data ?? [],
    notOkReason: null,
    partialReason: (answer?.reason as string | null | undefined) || null,
  };
}

function answerError(
  queryError: unknown,
  notOkReason: string | null
): Error | null {
  if (queryError) return queryError as Error;
  return notOkReason ? new Error(notOkReason) : null;
}

/**
 * Raw open-orders fetch for the Trading Terminal "Exchange" tab. Mirrors the
 * legacy `getAllOpenOrders` call: `'all'` (or falsy) means no `exchangeUUID`
 * filter (input `undefined`), a specific id filters to that exchange.
 *
 * `useGraphQL` already pulls the token from the auth store and derives the
 * paper-context header from the live/paper toggle, so live/paper changes
 * auto-refetch with no extra wiring. The hook returns `ReturnResult<TData>`
 * (already unwrapped to the operation field's value); {@link readOpenListAnswer}
 * reads its status/reason as well as `data`.
 */
export function useExchangeOrders(
  exchangeUUID: string, // 'all' => no filter
  enabled = true
): UseExchangeOrdersResult {
  const gql = useMemo(() => {
    const input =
      exchangeUUID && exchangeUUID !== 'all' ? { exchangeUUID } : undefined;
    return otherQueries.getAllOpenOrders(input);
  }, [exchangeUUID]);

  const q = useGraphQL<GeneralOpenOrder[]>('getAllOpenOrders', gql, {
    enabled: enabled && !!exchangeUUID, // legacy: falsy uuid clears + returns
  });

  const read = useMemo(() => readOpenListAnswer(q.data), [q.data]);
  const error = useMemo(
    () => answerError(q.error, read.notOkReason),
    [q.error, read.notOkReason]
  );

  return {
    orders: read.rows,
    isLoading: q.isLoading,
    error,
    partialReason: read.partialReason,
    refetch: () => {
      void q.refetch();
    },
  };
}

/**
 * Raw open-positions fetch for the Trading Terminal "Exchange" tab. Same
 * conventions as {@link useExchangeOrders}.
 */
export function useExchangePositions(
  exchangeUUID: string,
  enabled = true
): UseExchangePositionsResult {
  const gql = useMemo(() => {
    const input =
      exchangeUUID && exchangeUUID !== 'all' ? { exchangeUUID } : undefined;
    return otherQueries.getAllOpenPositions(input);
  }, [exchangeUUID]);

  const q = useGraphQL<GeneralOpenPosition[]>('getAllOpenPositions', gql, {
    enabled: enabled && !!exchangeUUID,
  });

  const read = useMemo(() => readOpenListAnswer(q.data), [q.data]);
  const error = useMemo(
    () => answerError(q.error, read.notOkReason),
    [q.error, read.notOkReason]
  );

  return {
    positions: read.rows,
    isLoading: q.isLoading,
    error,
    partialReason: read.partialReason,
    refetch: () => {
      void q.refetch();
    },
  };
}
