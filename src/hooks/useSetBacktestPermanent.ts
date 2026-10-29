import { useMutation, useQueryClient } from '@tanstack/react-query';

import { GraphQLClient, type ReturnResult } from '@/lib/api';
import { dealQueries } from '@/lib/api/GraphQLQueries-deal-queries';
import { logger } from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { BotTypesEnum } from '@/types';
import { patchLocalBacktest } from '@/utils/backtest/patchLocal';

export interface SetBacktestPermanentInput {
  id: string;
  savePermanent: boolean;
  type: BotTypesEnum;
}

export type SetBacktestPermanentResult = ReturnResult<string>;

const isHedgeType = (type: BotTypesEnum) =>
  type === BotTypesEnum.hedgeDca || type === BotTypesEnum.hedgeCombo;

// Map each bot family to its mutation builder + the list query key whose
// cached rows should be patched in place. Mirrors legacy
// main-dash, which calls one mutation per bot type.
const MUTATION_BY_TYPE: Record<
  BotTypesEnum,
  | {
      builder: (input: { id: string; savePermanent: boolean }) => {
        query: string;
        variables: unknown;
      };
      responseField: string;
      listQueryKey: string;
    }
  | undefined
> = {
  [BotTypesEnum.dca]: {
    builder: dealQueries.setBacktestPermanentStatus,
    responseField: 'setBacktestPermanentStatus',
    listQueryKey: 'getBacktests',
  },
  [BotTypesEnum.combo]: {
    builder: dealQueries.setComboBacktestPermanentStatus,
    responseField: 'setComboBacktestPermanentStatus',
    listQueryKey: 'getComboBacktests',
  },
  [BotTypesEnum.grid]: {
    builder: dealQueries.setGridBacktestPermanentStatus,
    responseField: 'setGridBacktestPermanentStatus',
    listQueryKey: 'getGridBacktests',
  },
  [BotTypesEnum.hedgeDca]: {
    builder: dealQueries.setHedgeDCABacktestPermanentStatus,
    responseField: 'setHedgeDCABacktestPermanentStatus',
    listQueryKey: 'getHedgeDCABacktests',
  },
  [BotTypesEnum.hedgeCombo]: {
    builder: dealQueries.setHedgeComboBacktestPermanentStatus,
    responseField: 'setHedgeComboBacktestPermanentStatus',
    listQueryKey: 'getHedgeComboBacktests',
  },
  [BotTypesEnum.terminal]: undefined,
};

/**
 * Mutation hook to toggle a backtest's "save permanently" flag, so the
 * backtest is not auto-deleted by the cleanup job. Works for DCA, Combo,
 * Grid and the two hedge variants via the matching GraphQL mutation.
 */
export function useSetBacktestPermanent() {
  const queryClient = useQueryClient();
  const { tokens } = useAuthStore();
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);

  return useMutation<
    SetBacktestPermanentResult,
    Error,
    SetBacktestPermanentInput
  >({
    mutationKey: ['set-backtest-permanent'],
    mutationFn: async ({ id, savePermanent, type }) => {
      if (!tokens?.accessToken) {
        throw new Error('Authentication required to update backtest.');
      }
      if (!id) {
        throw new Error('Backtest ID is required.');
      }

      const config = MUTATION_BY_TYPE[type];
      if (!config) {
        throw new Error(`Unsupported bot type for backtest: ${type}`);
      }

      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const client = new GraphQLClient(
        endpoint,
        tokens.accessToken,
        !isLiveTrading
      );

      const { query, variables } = config.builder({ id, savePermanent });

      const response = await client.request<
        Record<string, SetBacktestPermanentResult>
      >(query, variables as Record<string, unknown>);

      const payload =
        (response?.[config.responseField] as
          | SetBacktestPermanentResult
          | undefined) ?? (response as unknown as SetBacktestPermanentResult);

      if (!payload || payload.status !== 'OK') {
        const reason =
          payload?.reason ?? 'Failed to update backtest save status.';
        logger.error('[useSetBacktestPermanent] Update failed', { id, reason });
        throw new Error(reason);
      }

      logger.info('[useSetBacktestPermanent] Updated successfully', {
        id,
        type,
        savePermanent,
      });
      return payload;
    },
    onSuccess: async (_data, variables) => {
      const { id, savePermanent, type } = variables;
      const config = MUTATION_BY_TYPE[type];

      // Patch the cached list rows IN PLACE instead of invalidating —
      // invalidation forces a refetch that flips the table into its loading
      // state ("reload") and, because the list hooks merge the local copy
      // over the remote one, the stale local `savePermanent` would overwrite
      // the freshly-toggled value. Legacy updates its list state in place for
      // the same reason. (No-op for hedge, whose list isn't React-Query backed
      // — the list view refreshes via its runner instead.)
      if (config) {
        queryClient.setQueriesData<ReturnResult<{ _id?: string }[]>>(
          { queryKey: [config.listQueryKey] },
          (old) => {
            if (!old || old.status !== 'OK' || !Array.isArray(old.data)) {
              return old;
            }
            return {
              ...old,
              data: old.data.map((row) =>
                row && row._id === id ? { ...row, savePermanent } : row
              ),
            };
          }
        );
      }

      // Keep the IndexedDB copy in sync so the merged value stays correct on
      // re-render and survives a full reload.
      await patchLocalBacktest(id, isHedgeType(type), (payload) => {
        if (payload['savePermanent'] === savePermanent) return false;
        payload['savePermanent'] = savePermanent;
        return true;
      });
    },
    onError: (error) => {
      logger.error('[useSetBacktestPermanent] Failed to update', {
        error: error.message,
      });
      toast.error(`Cannot update backtest: ${error.message}`);
    },
  });
}
