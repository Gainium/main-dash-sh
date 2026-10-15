import { useMemo } from 'react';
import { findPrice, findUSDRate, type PriceData } from '@/lib/utils/unrealizedPnL';
import { useLatestPrices, usePricesLive } from './useLatestPrices';

/** What a deal row needs to be valued at the current price. */
export interface DealPositionRef {
  active: boolean;
  /** Position size in base units (the table's Size column). */
  size: number;
  /** Pair as the price feed names it (e.g. `BTCUSDT`). */
  symbol: string;
  exchange: string;
  quoteAsset: string;
}

export interface DealPositionValue {
  /** |size| × current price, in the quote asset. */
  positionValue?: number | undefined;
  /** The same in USD, so a totals row can add up deals in different quotes. */
  positionValueUsd?: number | undefined;
  /** Priced from the previous session's price snapshot, not a live price. */
  positionValuePending?: boolean | undefined;
}

/**
 * Rows with the current value of each open deal's position: |size| × the last
 * price of its pair on its own exchange. Unlike Notional Value (size × average
 * entry) it moves with the market. Closed deals get 0 so totals and sorting
 * treat them as neutral; an open deal whose pair the feed does not carry stays
 * `undefined` rather than showing a made-up zero.
 *
 * `read` must be stable (module-level), or the rows are re-priced every render.
 */
export function useDealPositionValues<T extends object>(
  rows: readonly T[],
  read: (row: T) => DealPositionRef
): (T & DealPositionValue)[] {
  const enabled = useMemo(() => rows.some((r) => read(r).active), [rows, read]);
  const prices = useLatestPrices(enabled) as PriceData[];
  const live = usePricesLive(enabled);

  return useMemo(
    () =>
      rows.map((row) => {
        const ref = read(row);
        if (!ref.active) {
          return { ...row, positionValue: 0, positionValueUsd: 0 };
        }
        const price = prices.length
          ? findPrice(prices, ref.symbol, ref.exchange)
          : undefined;
        if (!price || !(price > 0) || !Number.isFinite(ref.size)) {
          return { ...row, positionValue: undefined, positionValueUsd: undefined };
        }
        const positionValue = Math.abs(ref.size) * price;
        const usdRate = findUSDRate(
          ref.quoteAsset,
          prices,
          ref.exchange as Parameters<typeof findUSDRate>[2]
        );
        return {
          ...row,
          positionValue,
          positionValueUsd: usdRate ? positionValue * usdRate : undefined,
          positionValuePending: !live,
        };
      }),
    [rows, read, prices, live]
  );
}
