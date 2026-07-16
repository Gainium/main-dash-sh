import { useCallback, useMemo } from 'react';

import type { BotFormMode } from '@/contexts/bots/form/BotFormProvider';
import { useLiveUpdate } from '@/contexts/LiveUpdateContext';
import {
  useBotCreate,
  useBotStatusToggle,
  useBotUpdate,
} from '@/hooks/useBotMutations';
import { ACTIVATION_EVENTS, trackActivation } from '@/lib/analytics/events';
import {
  GraphQLClient,
  DEFAULT_READ_TIMEOUT_MS,
} from '@/lib/api/GraphQLClient';
import { otherQueries } from '@/lib/api/GraphQLQueries-other-queries';
import type {
  CreateDCABotPayload,
  CreateGridBotPayload,
} from '@/mappers/bots/dca/map-form-data-to-payload';
import { useAuthStore } from '@/stores/authStore';
import { useBalanceStore } from '@/stores/live/balanceStore';
import { useUIStore } from '@/stores/uiStore';
import logger from '../../../lib/loggerInstance';
import { BotTypesEnum } from '@/types';

/**
 * Normalize bot type to one supported by mutation hooks (dca, grid, combo).
 * hedgeDca/terminal map to dca; hedgeCombo maps to combo.
 */
function normalizeBotTypeForMutation(type: BotTypesEnum): BotTypesEnum {
  switch (type) {
    case BotTypesEnum.hedgeDca:
    case BotTypesEnum.terminal:
      return BotTypesEnum.dca;
    case BotTypesEnum.hedgeCombo:
      return BotTypesEnum.combo;
    default:
      return type;
  }
}

export interface CreateMutationAdapter {
  mutateAsync: (
    payload: CreateDCABotPayload | CreateGridBotPayload
  ) => Promise<unknown>;
  isPending: boolean;
}

export type RefreshBalancesResult =
  | { status: 'ok'; message?: string }
  | { status: 'error'; reason: string }
  | { status: 'skipped'; reason: string };

export interface UseBotFormMutationsOptions {
  mode: BotFormMode;
  exchangeUUID?: string;
  debug?: boolean;
  botType: BotTypesEnum;
}

export interface UseBotFormMutationsResult {
  updateMutation: ReturnType<typeof useBotUpdate>;
  statusToggleMutation: ReturnType<typeof useBotStatusToggle>;
  createMutationAdapter?: CreateMutationAdapter;
  getBalances: (
    overrideExchangeUUID?: string,
    all?: boolean
  ) => Promise<RefreshBalancesResult>;
  updateBalances: (
    overrideExchangeUUID?: string,
    all?: boolean
  ) => Promise<RefreshBalancesResult>;
}

export const useBotFormMutations = (
  options: UseBotFormMutationsOptions
): UseBotFormMutationsResult => {
  const { mode, exchangeUUID, debug } = options;
  const mutationType = normalizeBotTypeForMutation(options.botType);
  const updateMutation = useBotUpdate(mutationType);
  const statusToggleMutation = useBotStatusToggle(mutationType);
  const createMutation = useBotCreate(mutationType);

  const { tokens } = useAuthStore();
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);
  const { balanceActions } = useLiveUpdate();
  const { updateBalances: _updateBalances, setBalanceError } = balanceActions;

  const createMutationAdapter = useMemo<
    CreateMutationAdapter | undefined
  >(() => {
    if (mode !== 'create') {
      return undefined;
    }

    return {
      mutateAsync: async (
        payload: CreateDCABotPayload | CreateGridBotPayload
      ) => {
        const result = await createMutation.mutateAsync(payload);
        // Fire bot_created with the un-normalized bot type so hedgeDca /
        // hedgeCombo / terminal remain distinguishable in the funnel.
        // Wrapping at this layer (instead of inside useBotCreate) is the
        // only way to preserve the original type — useBotCreate only sees
        // the normalized one (dca/grid/combo).
        trackActivation(ACTIVATION_EVENTS.bot_created, {
          bot_type: options.botType,
          trading_mode: isLiveTrading ? 'live' : 'paper',
        });
        return result;
      },
      isPending: createMutation.isPending,
    };
  }, [mode, createMutation, options.botType, isLiveTrading]);

  const getBalances = useCallback(
    async (
      overrideExchangeUUID?: string,
      all = false
    ): Promise<RefreshBalancesResult> => {
      const targetExchange = overrideExchangeUUID ?? exchangeUUID;

      if (!targetExchange && !all) {
        if (debug) {
          console.warn(
            '[BotFormMutations] No exchange UUID available for get balance'
          );
        }
        return {
          status: 'skipped',
          reason: 'No exchange selected',
        };
      }

      if (!tokens?.accessToken) {
        setBalanceError('Authentication required');
        if (debug) {
          console.warn(
            '[BotFormMutations] Missing access token, cannot get balance'
          );
        }
        return {
          status: 'error',
          reason: 'Authentication required',
        };
      }

      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const paperContext = !isLiveTrading;
      const client = new GraphQLClient(
        endpoint,
        tokens.accessToken,
        paperContext
      );

      let outcome: RefreshBalancesResult = {
        status: 'ok',
      };

      try {
        useBalanceStore.getState().setBalanceLoading(true);
        setBalanceError(null);

        const { query, variables } = otherQueries.getBalances({
          uuid: all ? '' : targetExchange,
          shouldSumBalance: false,
        });

        const response = (await client.request(query, variables, {
          timeoutMs: DEFAULT_READ_TIMEOUT_MS,
        })) as {
          getBalances: {
            status: string;
            reason?: string;
            data?: Array<{
              asset: string;
              free: string;
              locked: string;
              exchangeUUID: string;
            }>;
          };
        };

        const balanceData = response?.getBalances ?? response;
        if (balanceData?.status === 'OK' && balanceData?.data) {
          const balances = balanceData.data.map((balance) => ({
            asset: balance.asset,
            free: parseFloat(balance.free ?? '0'),
            locked: parseFloat(balance.locked ?? '0'),
            total:
              parseFloat(balance.free ?? '0') +
              parseFloat(balance.locked ?? '0'),
            exchangeUUID: balance.exchangeUUID,
          }));
          _updateBalances(balances);

          if (debug) {
            logger.info('[BotFormMutations] Balances retrieved', {
              exchange: targetExchange,
              assets: balances.length,
            });
          }

          outcome = {
            status: 'ok',
            message:
              balances.length > 0
                ? `Balances retrieved (${balances.length} assets)`
                : 'Balances retrieved',
          };
        } else {
          const reason = balanceData?.reason ?? 'Failed to get balances';
          setBalanceError(reason);
          if (debug) {
            console.error('[BotFormMutations] Balance get balance failed', {
              exchange: targetExchange,
              reason,
            });
          }

          outcome = {
            status: 'error',
            reason,
          };
        }
      } catch (error) {
        setBalanceError('Failed to get balances');
        if (debug) {
          console.error('[BotFormMutations] Error get balances', error);
        }
        outcome = {
          status: 'error',
          reason: 'Failed to get balances',
        };
      } finally {
        useBalanceStore.getState().setBalanceLoading(false);
      }

      return outcome;
    },
    [
      exchangeUUID,
      tokens?.accessToken,
      isLiveTrading,
      setBalanceError,
      _updateBalances,
      debug,
    ]
  );

  const updateBalances = useCallback(
    async (
      overrideExchangeUUID?: string,
      all = false
    ): Promise<RefreshBalancesResult> => {
      const targetExchange = overrideExchangeUUID ?? exchangeUUID;

      if (!targetExchange && !all) {
        if (debug) {
          console.warn(
            '[BotFormMutations] No exchange UUID available for balance refresh'
          );
        }
        return {
          status: 'skipped',
          reason: 'No exchange selected',
        };
      }

      if (!tokens?.accessToken) {
        setBalanceError('Authentication required');
        if (debug) {
          console.warn(
            '[BotFormMutations] Missing access token, cannot refresh balances'
          );
        }
        return {
          status: 'error',
          reason: 'Authentication required',
        };
      }

      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const paperContext = !isLiveTrading;
      const client = new GraphQLClient(
        endpoint,
        tokens.accessToken,
        paperContext
      );

      let outcome: RefreshBalancesResult = {
        status: 'ok',
      };

      try {
        useBalanceStore.getState().setBalanceLoading(true);
        setBalanceError(null);

        const { query: updateQuery, variables: updateVariables } =
          otherQueries.updateBalance();
        await client.request(updateQuery, updateVariables);

        return await getBalances(targetExchange, all);
      } catch (error) {
        setBalanceError('Failed to update balances');
        if (debug) {
          console.error('[BotFormMutations] Error refreshing balances', error);
        }
        outcome = {
          status: 'error',
          reason: 'Failed to update balances',
        };
      } finally {
        useBalanceStore.getState().setBalanceLoading(false);
      }

      return outcome;
    },
    [
      exchangeUUID,
      tokens?.accessToken,
      isLiveTrading,
      setBalanceError,
      getBalances,
      debug,
    ]
  );

  return {
    updateMutation,
    statusToggleMutation,
    ...(createMutationAdapter ? { createMutationAdapter } : {}),
    getBalances,
    updateBalances,
  };
};
