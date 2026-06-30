import { useMutation, useQueryClient } from '@tanstack/react-query';

import { dispatchBacktestDbEvent } from '@/constants/backtest';
import { GraphQLClient, type ReturnResult } from '@/lib/api';
import { dealQueries } from '@/lib/api/GraphQLQueries-deal-queries';
import { logger } from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { BotTypesEnum } from '@/types';
import {
  getById as getLocalBacktest,
  getHedgeById as getLocalHedgeBacktest,
  save as saveLocalBacktest,
  saveHedge as saveLocalHedgeBacktest,
} from '@/utils/backtest/db';

export interface SetBacktestPermanentInput {
  id: string;
  savePermanent: boolean;
  type: BotTypesEnum;
}

export type SetBacktestPermanentResult = ReturnResult<string>;

const isHedgeType = (type: BotTypesEnum) =>
  type === BotTypesEnum.hedgeDca || type === BotTypesEnum.hedgeCombo;

/**
 * Patch the locally-cached IndexedDB copy of a backtest so its
 * `savePermanent` flag matches the server. The list hooks merge the local
 * copy OVER the remote one (local wins by `_id`), so without this the toggle
 * would visually revert to the stale local value on the next render. Mirrors
 * legacy's in-place list update — no refetch. No-op if there's no local copy.
 */
const patchLocalBacktestSavePermanent = async (
  id: string,
  savePermanent: boolean,
  hedge: boolean
): Promise<void> => {
  try {
    const entry = hedge
      ? await getLocalHedgeBacktest(id, true)
      : await getLocalBacktest(id, true);
    if (!entry?.data) return;

    const parsed = JSON.parse(entry.data) as Record<string, unknown>;
    if (parsed['savePermanent'] === savePermanent) return;
    parsed['savePermanent'] = savePermanent;
    const data = JSON.stringify(parsed);
    const next = { ...entry, data, size: data.length };

    if (hedge) {
      await saveLocalHedgeBacktest(next as Parameters<typeof saveLocalHedgeBacktest>[0]);
    } else {
      await saveLocalBacktest(next as Parameters<typeof saveLocalBacktest>[0]);
    }
    dispatchBacktestDbEvent();
  } catch (e) {
    logger.warn('[useSetBacktestPermanent] Could not patch local copy', {
      id,
      error: (e as Error)?.message,
    });
  }
};

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
      await patchLocalBacktestSavePermanent(id, savePermanent, isHedgeType(type));
    },
    onError: (error) => {
      logger.error('[useSetBacktestPermanent] Failed to update', {
        error: error.message,
      });
      toast.error(`Cannot update backtest: ${error.message}`);
    },
  });
}
