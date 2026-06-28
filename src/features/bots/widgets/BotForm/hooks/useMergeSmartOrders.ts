import { useMutation, useQueryClient } from '@tanstack/react-query';

import { GraphQLClient, type ReturnResult } from '@/lib/api';
import { dealQueries } from '@/lib/api/GraphQLQueries-deal-queries';
import { logger } from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';

export interface MergeSmartOrdersInput {
  botId: string;
  dealIds: string[];
}

export type MergeSmartOrdersResult = ReturnResult<string>;

export function useMergeSmartOrders() {
  const queryClient = useQueryClient();
  const { tokens } = useAuthStore();
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);

  return useMutation<MergeSmartOrdersResult, Error, MergeSmartOrdersInput>({
    mutationKey: ['merge-smart-orders'],
    mutationFn: async ({ botId, dealIds }) => {
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
    onSuccess: (_data, variables) => {
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
