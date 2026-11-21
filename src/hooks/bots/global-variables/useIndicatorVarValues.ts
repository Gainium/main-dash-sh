import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useOptionalBotFormBinding } from '@/contexts/bots/form/BotFormProvider';
import { globalVariablesStore } from '@/stores/globalVariablesStore';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import type { BotVars, SettingsIndicators } from '@/types';

import { resolveIndicatorVars } from './botVarBindingUtils';

/**
 * Indicator settings with every field bound to a global variable replaced by
 * that variable's value — what the bot engine evaluates. A bound field keeps
 * the literal it had when it was bound, so reading the settings directly shows
 * a value the bot no longer uses.
 *
 * Inside a bot form the bindings come from the form. Outside one (the bot
 * view's chart) pass the saved bot's `vars`; they take precedence when given.
 */
export const useIndicatorVarValues = (botVars?: BotVars | null) => {
  const binding = useOptionalBotFormBinding();
  const { tokens } = useAuthStore();
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);

  // Deal-edit modes use per-deal resolved values, not the binding (same rule
  // as useBotVarBinding).
  const paths = useMemo(() => {
    const source =
      botVars !== undefined
        ? botVars?.paths
        : binding?.mode === 'deal-edit' || binding?.mode === 'deal-mass-edit'
          ? []
          : binding?.botVars?.paths;
    return (source ?? []).filter((entry) =>
      entry.path.startsWith('indicators.')
    );
  }, [botVars, binding?.botVars, binding?.mode]);
  const ids = useMemo(
    () => [...new Set(paths.map((entry) => entry.variable))].sort(),
    [paths]
  );

  const { data: variables } = useQuery({
    queryKey: ['global-variables-by-ids', ids, isLiveTrading],
    enabled: ids.length > 0 && Boolean(tokens?.accessToken),
    queryFn: async () =>
      (await globalVariablesStore.getVariablesByIds(ids)) ?? [],
    staleTime: 5 * 60 * 1000,
  });

  return useCallback(
    (indicator: SettingsIndicators): SettingsIndicators =>
      resolveIndicatorVars(indicator, paths, variables ?? []),
    [paths, variables]
  );
};
