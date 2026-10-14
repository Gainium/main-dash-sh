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

import { serverDealUnrealizedPnl } from '@/lib/utils/dealUnrealizedPnl';
import { DCADealStatusEnum } from '@/types';
import { useHedgeDeals } from './useHedgeDeals';
import { useDealsWithLivePnl } from './useLiveDealPnl';

export type HedgeLegUnrealized = {
  /** Unrealized USD per leg bot id. */
  byLeg: Map<string, number>;
  /** Leg bot ids with at least one open deal whose value is not live. */
  pending: Set<string>;
};

export function useHedgeLegUnrealized(
  isCombo: boolean,
  enabled = true
): HedgeLegUnrealized {
  const { deals: storedDeals } = useHedgeDeals(isCombo, {
    status: DCADealStatusEnum.open,
    enabled,
  });
  // Live where the price feed carries the pair; the server's stored value,
  // marked pending, where it does not.
  const deals = useDealsWithLivePnl(storedDeals, { combo: isCombo, enabled });

  return useMemo(() => {
    const byLeg = new Map<string, number>();
    const pending = new Set<string>();
    for (const deal of deals) {
      // Only open deals carry a meaningful unrealized; the backend leaves a
      // stale value on closed ones.
      const active = ['open', 'start', 'error'].includes(
        String(deal.status).toLowerCase()
      );
      if (!active || !deal.botId) continue;
      const withLive = deal as typeof deal & {
        unrealizedUsd?: number;
        unrealizedPending?: boolean;
      };
      const u =
        withLive.unrealizedUsd ??
        serverDealUnrealizedPnl(deal)?.unrealizedUsd ??
        deal.stats?.unrealizedProfit ??
        0;
      byLeg.set(deal.botId, (byLeg.get(deal.botId) ?? 0) + u);
      if (withLive.unrealizedPending) pending.add(deal.botId);
    }
    return { byLeg, pending };
  }, [deals]);
}
