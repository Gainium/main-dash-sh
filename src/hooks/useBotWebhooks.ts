import { botQueries } from '@/lib/api/GraphQLQueries-bot-queries';
import { toast } from '@/lib/toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GraphQLClient, type ReturnResult } from '../lib/api';
import { logger } from '../lib/loggerInstance';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import type { BotWebhookOption } from '../types/webhook';
import { useGraphQL } from './useGraphQL';

/**
 * Outgoing webhook options for a bot. These are persisted via a dedicated
 * mutation (`updateBotWebhookOptions`), independent of the main bot save —
 * mirrors main-dash's webhookDialog. The query key is namespaced per bot so
 * each form instance loads/refreshes its own options.
 */
export function useBotWebhookOptions(botId: string | undefined) {
  return useGraphQL<BotWebhookOption[]>(
    `getBotWebhookOptions_${botId ?? ''}`,
    botQueries.getBotWebhookOptions({ botId: botId ?? '' }),
    { enabled: !!botId }
  );
}

/**
 * Persist the full set of outgoing webhook options for a bot. The backend
 * replaces the stored list with `options`, so callers pass the complete
 * array (after add/edit/delete), exactly like the legacy dialog.
 */
export function useUpdateBotWebhookOptions(botId: string | undefined) {
  const queryClient = useQueryClient();
  const { tokens } = useAuthStore();
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);

  return useMutation({
    mutationFn: async (options: BotWebhookOption[]) => {
      if (!tokens?.accessToken) {
        throw new Error('Authentication required');
      }
      if (!botId) {
        throw new Error('Save the bot first to configure outgoing webhooks');
      }

      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const paperContext = !isLiveTrading;
      const client = new GraphQLClient(
        endpoint,
        tokens.accessToken,
        paperContext
      );

      const { query, variables } = botQueries.updateBotWebhookOptions({
        options,
        botId,
      });

      const result = await client.request<{
        updateBotWebhookOptions: ReturnResult<BotWebhookOption[]>;
      }>(query, variables);

      if (result.updateBotWebhookOptions.status !== 'OK') {
        throw new Error(
          result.updateBotWebhookOptions.reason ||
            'Failed to update webhook options'
        );
      }

      return result.updateBotWebhookOptions.data ?? [];
    },
    onSuccess: (data) => {
      // Seed the query cache with the server-returned list so the UI reflects
      // the persisted state without a refetch round-trip.
      queryClient.setQueriesData<ReturnResult<BotWebhookOption[]>>(
        { queryKey: [`getBotWebhookOptions_${botId ?? ''}`] },
        (old) =>
          old
            ? { ...old, status: 'OK', reason: null, data }
            : { status: 'OK', reason: null, data }
      );
    },
    onError: (err) => {
      logger.error('[BotWebhooks] Failed to update webhook options:', err);
      toast.error(
        err instanceof Error
          ? err.message
          : 'Failed to update webhook options'
      );
    },
  });
}
