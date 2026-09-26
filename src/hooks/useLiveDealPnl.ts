import { useEffect, useMemo, useState } from 'react';
import { logger } from '@/lib/loggerInstance';
import {
  computeDealUnrealizedPnlFromPrices,
  isActiveDealStatus,
  type DealPnlInput,
  type DealPnlResult,
} from '@/lib/utils/dealUnrealizedPnl';
import type { PriceData } from '@/lib/utils/unrealizedPnL';
import type { AllFees } from '@/types';
import { useLatestPrices } from './useLatestPrices';
import { useUserFees } from './useUserFeesService';

type FeeTargetDeal = {
  status?: string | null;
  exchangeUUID?: string | null;
  exchange?: string | null;
  symbol?: { symbol?: string } | string | null;
};

const SEP = '\u001f';

/**
 * A stable string for the set of (exchangeUUID, symbol) pairs of the ACTIVE
 * deals given. Effects key on this string, not on the deals array, so a deal
 * update that does not change the set never re-runs the fee lookup.
 */
export const feeTargetsKey = (deals: readonly FeeTargetDeal[]): string => {
  const targets = new Set<string>();
  for (const d of deals) {
    if (!isActiveDealStatus(d.status)) continue;
    const exchange = d.exchangeUUID || d.exchange;
    const symbol = typeof d.symbol === 'string' ? d.symbol : d.symbol?.symbol;
    if (exchange && symbol) targets.add(`${exchange}${SEP}${symbol}`);
  }
  return Array.from(targets).sort().join('\n');
};

const sameFees = (a: AllFees, b: AllFees) =>
  a.length === b.length &&
  a.every(
    (f, i) =>
      f.exchange === b[i].exchange &&
      f.symbol === b[i].symbol &&
      f.fee === b[i].fee
  );

/**
 * Maker fee rows (the canonical fee basis) for the active deals given.
 * Fetches only when the set of pairs changes, and sets state only when the
 * fee rows actually change.
 */
export function useDealFees(
  deals: readonly FeeTargetDeal[],
  enabled = true
): AllFees {
  const { fetchMultipleFees } = useUserFees();
  const key = useMemo(
    () => (enabled ? feeTargetsKey(deals) : ''),
    [deals, enabled]
  );
  const [fees, setFees] = useState<AllFees>([]);

  useEffect(() => {
    if (!key) return;
    const exchangeSymbolMap = new Map<string, Set<string>>();
    for (const entry of key.split('\n')) {
      const sep = entry.indexOf(SEP);
      if (sep < 0) continue;
      const exchange = entry.slice(0, sep);
      if (!exchangeSymbolMap.has(exchange)) {
        exchangeSymbolMap.set(exchange, new Set());
      }
      exchangeSymbolMap.get(exchange)?.add(entry.slice(sep + 1));
    }
    let cancelled = false;
    fetchMultipleFees({ exchangeSymbolMap })
      .then((rows) => {
        if (cancelled) return;
        const next: AllFees = (rows || [])
          .map((r) => ({
            exchange: r.exchangeUUID,
            symbol: r.symbol,
            fee: r.maker,
          }))
          .sort((a, b) =>
            a.exchange === b.exchange
              ? a.symbol.localeCompare(b.symbol)
              : a.exchange.localeCompare(b.exchange)
          );
        setFees((prev) => (sameFees(prev, next) ? prev : next));
      })
      .catch((error) => {
        logger.error('[useDealFees] Error fetching fees:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [key, fetchMultipleFees]);

  return fees;
}

/**
 * Live, fee-inclusive unrealized P&L for the deals ACTUALLY ON SCREEN (the
 * visible table page, the open drawer's rows, a widget's handful of cards).
 * Pass only those deals: the cost is O(deals) per price snapshot, and every
 * other row should show the server's stored value (`serverDealUnrealizedPnl`).
 *
 * Returns a map keyed by deal `_id`; a deal missing from the map has no live
 * value (closed, or no price/fee yet).
 */
export function useLiveDealPnl<T extends DealPnlInput & { _id?: string }>(
  visibleDeals: readonly T[],
  options: { combo?: boolean | ((deal: T) => boolean); enabled?: boolean } = {}
): Map<string, DealPnlResult> {
  const enabled = options.enabled !== false && visibleDeals.length > 0;
  const prices = useLatestPrices(enabled);
  const fees = useDealFees(visibleDeals as unknown as FeeTargetDeal[], enabled);
  const combo = options.combo;

  return useMemo(() => {
    const out = new Map<string, DealPnlResult>();
    if (!enabled || prices.length === 0 || fees.length === 0) return out;
    for (const deal of visibleDeals) {
      if (!deal._id) continue;
      const isCombo = typeof combo === 'function' ? combo(deal) : !!combo;
      const r = computeDealUnrealizedPnlFromPrices(
        deal,
        prices as PriceData[],
        fees,
        { combo: isCombo }
      );
      if (r) out.set(deal._id, r);
    }
    return out;
  }, [enabled, visibleDeals, prices, fees, combo]);
}
