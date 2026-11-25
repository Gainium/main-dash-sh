import { useMemo } from 'react';
import { botQueries } from '@/lib/api/GraphQLQueries-bot-queries';
import { useGraphQL } from '@/hooks/useGraphQL';
import { useShareContext } from '@/hooks/useShareContext';
import { IS_CLOUD } from '@/config/mode';
import type { DealHeldOrder } from '@/types';

const EMPTY: DealHeldOrder[] = [];

/**
 * A deal's held orders: orders the exchange refuses this far from the price,
 * which the bot places once the price is near. The live deal (socket
 * `bot deal update`) carries them when the bot changes the set; until then a
 * small query reads them. A backend without the field fails that query only,
 * and the chart simply shows no held orders.
 */
export function useDealHeldOrders(args: {
  botId: string;
  dealId: string;
  isCombo: boolean;
  liveHeld: DealHeldOrder[] | null | undefined;
  enabled?: boolean;
}): DealHeldOrder[] {
  const { botId, dealId, isCombo, liveHeld, enabled = true } = args;
  const { shareId } = useShareContext();
  const gql = botQueries.getDealHeldOrders(
    { botId, id: dealId ? [dealId] : [] },
    isCombo
  );
  const result = useGraphQL<{
    deals?: { _id: string; heldOrders?: DealHeldOrder[] | null }[];
    // Own cache key: the full by-id deal query shares variables with this one.
  }>(isCombo ? 'dealHeldOrders:combo' : 'dealHeldOrders:dca', gql, {
    enabled:
      IS_CLOUD &&
      enabled &&
      Boolean(botId && dealId) &&
      liveHeld === undefined,
    shareId,
    retry: false,
    staleTime: 60_000,
  });
  return useMemo(() => {
    if (liveHeld !== undefined) return liveHeld ?? EMPTY;
    if (result.data?.status !== 'OK') return EMPTY;
    const deal = result.data.data?.deals?.find((d) => d._id === dealId);
    return deal?.heldOrders ?? EMPTY;
  }, [liveHeld, result.data, dealId]);
}
