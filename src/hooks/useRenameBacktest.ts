import { useMutation, useQueryClient } from '@tanstack/react-query';

import { GraphQLClient, type ReturnResult } from '@/lib/api';
import { dealQueries } from '@/lib/api/GraphQLQueries-deal-queries';
import { logger } from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { BotTypesEnum } from '@/types';
import { patchLocalBacktest } from '@/utils/backtest/patchLocal';

export interface RenameBacktestInput {
  id: string;
  name: string;
  type: BotTypesEnum;
  /** False for a row kept only in this browser — nothing to update server-side. */
  stored: boolean;
}

// List query whose rows carry the name; hedge lists aren't React-Query backed.
const LIST_QUERY_KEY: Partial<Record<BotTypesEnum, string>> = {
  [BotTypesEnum.dca]: 'getBacktests',
  [BotTypesEnum.combo]: 'getComboBacktests',
  [BotTypesEnum.grid]: 'getGridBacktests',
};

const isHedgeType = (type: BotTypesEnum) =>
  type === BotTypesEnum.hedgeDca || type === BotTypesEnum.hedgeCombo;

const setSettingsName = (holder: unknown, name: string): boolean => {
  if (!holder || typeof holder !== 'object') return false;
  const settings = (holder as Record<string, unknown>)['settings'];
  if (!settings || typeof settings !== 'object') return false;
  const s = settings as Record<string, unknown>;
  if (s['name'] === name) return false;
  s['name'] = name;
  return true;
};

/**
 * Rename a backtest from its history row via `setBacktestTextFields`, and
 * keep this browser's local copy in step (the only copy for a row that was
 * never stored server-side). Hedge names live on both legs.
 */
export function useRenameBacktest() {
  const queryClient = useQueryClient();
  const { tokens } = useAuthStore();
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);

  return useMutation<undefined, Error, RenameBacktestInput>({
    mutationKey: ['rename-backtest'],
    mutationFn: async ({ id, name, type, stored }) => {
      if (!id) throw new Error('Backtest ID is required.');

      if (stored) {
        if (!tokens?.accessToken) {
          throw new Error('Authentication required to rename backtest.');
        }
        const endpoint =
          import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
        const client = new GraphQLClient(
          endpoint,
          tokens.accessToken,
          !isLiveTrading
        );
        const { query, variables } = dealQueries.setBacktestTextFields({
          id,
          name,
          type,
        });
        const response = await client.request<{
          setBacktestTextFields: ReturnResult<string>;
        }>(query, variables);
        const payload = response?.setBacktestTextFields;
        if (!payload || payload.status !== 'OK') {
          throw new Error(payload?.reason ?? 'Failed to rename backtest.');
        }
      }

      const hedge = isHedgeType(type);
      await patchLocalBacktest(id, hedge, (payload) => {
        if (!hedge) return setSettingsName(payload, name);
        const long = setSettingsName(payload['long'], name);
        const short = setSettingsName(payload['short'], name);
        return long || short;
      });
      return undefined;
    },
    onSuccess: (_data, { type }) => {
      const key = LIST_QUERY_KEY[type];
      if (key) queryClient.invalidateQueries({ queryKey: [key] });
    },
    onError: (error) => {
      logger.error('[useRenameBacktest] Rename failed', {
        error: error.message,
      });
      toast.error(`Cannot rename backtest: ${error.message}`);
    },
  });
}
