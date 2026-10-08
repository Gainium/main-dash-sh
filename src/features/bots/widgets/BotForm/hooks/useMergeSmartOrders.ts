import { useMutation, useQueryClient } from '@tanstack/react-query';

import { GraphQLClient, type ReturnResult } from '@/lib/api';
import { dealQueries } from '@/lib/api/GraphQLQueries-deal-queries';
import { logger } from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';
import { POSITION_ENTRIES_QUERY_KEY } from '@/hooks/useSinglePosition';
import { findPositionDeal } from '@/lib/singlePosition/singlePosition';
import {
  adoptDeals,
  fetchBotOpenDeals,
  fetchSinglePositionSettings,
} from '@/lib/singlePosition/singlePositionApi';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';

export interface MergeSmartOrdersInput {
  botId: string;
  dealIds: string[];
  /**
   * The deals' pair. When given and the target bot is single-position with an
   * open deal on it, the deals are adopted into that position instead of
   * merged into a new deal (spec 139 §5.2.1).
   */
  symbol?: string | undefined;
}

export type MergeSmartOrdersResult = ReturnResult<string> & {
  /** Set when the deals were adopted into an existing position. */
  adoptedInto?: string;
};

/**
 * The single-position bot's open position the deals fold into, or null when
 * the plain merge applies (bot not single-position, no position on the pair,
 * or a backend without the feature).
 */
async function findAdoptionTarget(
  client: GraphQLClient,
  botId: string,
  symbol: string
): Promise<string | null> {
  const { backend, byBot } = await fetchSinglePositionSettings(client, [botId]);
  if (backend !== 'new' || !byBot[botId]?.singlePosition) return null;
  const position = findPositionDeal(await fetchBotOpenDeals(client, botId), symbol);
  return position?._id ?? null;
}

export function useMergeSmartOrders() {
  const queryClient = useQueryClient();
  const { tokens } = useAuthStore();
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);

  return useMutation<MergeSmartOrdersResult, Error, MergeSmartOrdersInput>({
    mutationKey: ['merge-smart-orders'],
    mutationFn: async ({ botId, dealIds, symbol }) => {
      if (!tokens?.accessToken) {
        throw new Error('Authentication required to merge smart orders.');
      }

      if (!botId) {
        throw new Error('Bot ID is required to merge smart orders.');
      }

      if (!Array.isArray(dealIds) || dealIds.length < 2) {
        throw new Error('Select at least two smart orders to merge.');
      }

      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const client = new GraphQLClient(
        endpoint,
        tokens.accessToken,
        !isLiveTrading
      );

      const targetDealId = symbol
        ? await findAdoptionTarget(client, botId, symbol).catch((error) => {
            logger.warn('[useMergeSmartOrders] Single-position check failed', {
              error: error instanceof Error ? error.message : String(error),
            });
            return null;
          })
        : null;
      if (targetDealId) {
        const sources = dealIds.filter((id) => id !== targetDealId);
        if (sources.length === 0) {
          throw new Error('Select at least one other deal to merge.');
        }
        const adopted = await adoptDeals(client, {
          botId,
          targetDealId,
          dealIds: sources,
        });
        logger.info('[useMergeSmartOrders] Adopted into open position', {
          botId,
          dealIdsCount: sources.length,
        });
        return {
          status: 'OK',
          reason: null,
          data: typeof adopted.data === 'string' ? adopted.data : '',
          adoptedInto: targetDealId,
        } as MergeSmartOrdersResult;
      }

      const { query, variables } = dealQueries.mergeDeals({
        botId,
        dealIds,
      });

      const response = await client.request<{
        mergeDeals: MergeSmartOrdersResult;
      }>(query, variables);

      const payload =
        (response?.mergeDeals as MergeSmartOrdersResult | undefined) ??
        (response as unknown as MergeSmartOrdersResult);

      if (!payload || payload.status !== 'OK') {
        const reason = payload?.reason ?? 'Failed to merge smart orders.';
        logger.error('[useMergeSmartOrders] Merge failed', {
          botId,
          dealIds,
          reason,
        });
        throw new Error(reason);
      }

      logger.info('[useMergeSmartOrders] Merge successful', {
        botId,
        dealIdsCount: dealIds.length,
      });

      return payload;
    },
    onSuccess: (data, variables) => {
      // Invalidate all deal-related queries to ensure UI updates
      queryClient.invalidateQueries({ queryKey: ['getDCADeals'] });
      queryClient.invalidateQueries({ queryKey: ['dcaDealList'] });
      queryClient.invalidateQueries({ queryKey: ['getBotDeals'] });
      queryClient.invalidateQueries({ queryKey: ['getComboDeals'] });
      // Hedge bots render their Deals tab from useHedgeDeals, which caches
      // under its own `hedge*DealList:all-pages` key (see useCacheKey). Without
      // invalidating it, a merge on a hedge bot leaves the drawer showing the
      // stale pre-merge list (old child deals, no merged parent) until a manual
      // refresh. Prefix-match invalidation refetches it immediately.
      queryClient.invalidateQueries({ queryKey: ['hedgeDcaDealList:all-pages'] });
      queryClient.invalidateQueries({
        queryKey: ['hedgeComboDealList:all-pages'],
      });

      logger.info('[useMergeSmartOrders] Queries invalidated', {
        dealCount: variables.dealIds.length,
      });

      if (data?.adoptedInto) {
        void queryClient.invalidateQueries({
          queryKey: [POSITION_ENTRIES_QUERY_KEY],
        });
        toast.success('Merged into the open position');
        return;
      }
      toast.success(`Successfully merged ${variables.dealIds.length} deals`);
    },
    onError: (error) => {
      logger.error('[useMergeSmartOrders] Merge operation failed', {
        error: error.message,
      });
      toast.error(error.message || 'Failed to merge deals');
    },
  });
}
