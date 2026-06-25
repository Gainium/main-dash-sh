/**
 * Per-leg unrealized PnL (USD) for hedge bots, keyed by leg bot id, summed
 * from the server-computed deal values.
 *
 * Why: the client-side price calc (`computeHedgeUnPnl` → `transformDcaBotToBot`)
 * reads 0 for bots on exchanges absent from the price feed (e.g. Kraken
 * futures), so the hedge cards / table showed $0.00 unrealized. The backend
 * always values open deals correctly, so we sum `stats.unrealizedProfit` over
 * the user's OPEN hedge deals and let the list pages override the (wrong)
 * client unrealized with this.
 *
 * Returns a Map<legBotId, unrealizedUsd>. Sum the two leg ids for a wrapper's
 * combined unrealized.
 */
import { useMemo } from 'react';

import { DCADealStatusEnum } from '@/types';
import { useHedgeDeals } from './useHedgeDeals';

export function useHedgeLegUnrealized(
  isCombo: boolean,
  enabled = true
): Map<string, number> {
  const { deals } = useHedgeDeals(isCombo, {
    status: DCADealStatusEnum.open,
    enabled,
  });

  return useMemo(() => {
    const map = new Map<string, number>();
    for (const deal of deals) {
      // Only open deals carry a meaningful unrealized; the backend leaves a
      // stale value on closed ones.
      const active = ['open', 'start', 'error'].includes(
        String(deal.status).toLowerCase()
      );
      if (!active || !deal.botId) continue;
      const u = deal.stats?.unrealizedProfit ?? 0;
      map.set(deal.botId, (map.get(deal.botId) ?? 0) + u);
    }
    return map;
  }, [deals]);
}
