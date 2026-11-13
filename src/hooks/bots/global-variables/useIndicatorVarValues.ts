import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useOptionalBotFormBinding } from '@/contexts/bots/form/BotFormProvider';
import { globalVariablesStore } from '@/stores/globalVariablesStore';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import type { SettingsIndicators } from '@/types';

/**
 * Indicator settings with every field bound to a global variable replaced by
 * that variable's value — what the bot engine evaluates. A bound field keeps
 * the literal it had when it was bound, so reading the settings directly shows
 * a value the bot no longer uses.
 */
export const useIndicatorVarValues = () => {
  const binding = useOptionalBotFormBinding();
  const { tokens } = useAuthStore();
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);

  // Deal-edit modes use per-deal resolved values, not the binding (same rule
  // as useBotVarBinding).
  const paths = useMemo(
    () =>
      binding?.mode === 'deal-edit' || binding?.mode === 'deal-mass-edit'
        ? []
        : (binding?.botVars?.paths ?? []).filter((entry) =>
            entry.path.startsWith('indicators.')
          ),
    [binding?.botVars, binding?.mode]
  );
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
    (indicator: SettingsIndicators): SettingsIndicators => {
      if (!paths.length || !variables?.length) {
        return indicator;
      }
      const prefix = `indicators.${indicator.uuid}.`;
      let resolved: SettingsIndicators | null = null;
      for (const entry of paths) {
        if (!entry.path.startsWith(prefix)) {
          continue;
        }
        const variable = variables.find((v) => v.id === entry.variable);
        if (!variable) {
          continue;
        }
        resolved ??= { ...indicator };
        (resolved as unknown as Record<string, unknown>)[
          entry.path.slice(prefix.length)
        ] = variable.value;
      }
      return resolved ?? indicator;
    },
    [paths, variables]
  );
};
