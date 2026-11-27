import { useCallback } from 'react';
import { useExchangeMutations } from '@/hooks/useExchangeMutations';
import { useExchangesStore } from '@/stores/exchangesStore';
import { hyperliquidSiblings } from '@/utils/hyperliquidRenewal';
import { logger } from '@/lib/loggerInstance';

export type PropagationResult = {
  updated: string[];
  failed: { uuid: string; name: string; error: string }[];
};

/**
 * Give a freshly approved agent key to connections on the same wallet. The
 * approval just deregistered the agent they held, so without this their bots
 * fail every order. Sequential on purpose: each save verifies against the
 * venue, and the user is waiting on the first one already.
 */
export function useHyperliquidAgentPropagation() {
  const { updateExchange } = useExchangeMutations();

  const updateLegs = useCallback(
    async (
      uuids: string[],
      wallet: string,
      secret: string
    ): Promise<PropagationResult> => {
      const result: PropagationResult = { updated: [], failed: [] };
      for (const uuid of uuids) {
        const name = useExchangesStore.getState().exchanges[uuid]?.name ?? uuid;
        try {
          await updateExchange.mutateAsync({ uuid, key: wallet, secret });
          result.updated.push(uuid);
        } catch (e) {
          logger.error('Hyperliquid agent propagation failed', { uuid, e });
          result.failed.push({
            uuid,
            name,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      return result;
    },
    [updateExchange]
  );

  /** Siblings of `wallet` other than `excludeUuid`, from the current store. */
  const siblingsOf = useCallback(
    (wallet: string, excludeUuid?: string | null) =>
      hyperliquidSiblings(
        wallet,
        Object.values(useExchangesStore.getState().exchanges),
        excludeUuid
      ),
    []
  );

  return { updateLegs, siblingsOf };
}
