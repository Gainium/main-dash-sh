import { useCallback, useMemo } from 'react';

import { useOptionalBotFormBinding } from '@/contexts/bots/form/BotFormProvider';
import { buildBotVars, pruneBotVars } from './botVarBindingUtils';
import type {
  BotVars,
  DCABotSettings,
  DCACustom,
  MultiTP,
  SettingsIndicators,
} from '@/types';

interface UseBotVarBindingResult {
  variableId: string | null;
  isBound: boolean;
  bindVariable: (variableId: string) => void;
  unbindVariable: () => void;
  botVars: BotVars | null;
}

export type MultipleTPVarBindingPath = `multiTp.${string}.${keyof MultiTP}`;
export type MultipleSLVarBindingPath = `multiSl.${string}.${keyof MultiTP}`;
export type IndicatorsVarBindingPath =
  `indicators.${string}.${keyof SettingsIndicators}`;
export type DCACustomVarBindingPath = `dcaCustom.${string}.${keyof DCACustom}`;

export type VarBindingPath =
  | keyof DCABotSettings
  | MultipleTPVarBindingPath
  | MultipleSLVarBindingPath
  | IndicatorsVarBindingPath
  | DCACustomVarBindingPath;

export const useBotVarBinding = (
  path: VarBindingPath
): UseBotVarBindingResult => {
  // Context-only read (mode + botVars + setter): a keystroke anywhere in the
  // form must not re-render every bound field.
  const maybeContext = useOptionalBotFormBinding();

  const botVars = maybeContext?.botVars ?? null;
  const setBotVars = maybeContext?.setBotVars;

  const variableId = useMemo(() => {
    // Deal-edit modes use per-deal resolved values, not the binding — hiding
    // the binding here prevents the chip from masking the editable input.
    // settings-readonly DOES want the binding resolved so the drawer can
    // show the chip instead of the raw value.
    if (
      maybeContext?.mode === 'deal-edit' ||
      maybeContext?.mode === 'deal-mass-edit'
    ) {
      return null;
    }
    return (
      botVars?.paths.find((entry) => entry.path === path)?.variable ?? null
    );
  }, [botVars, path, maybeContext?.mode]);

  const bindVariable = useCallback(
    (nextVariableId: string) => {
      if (!setBotVars) {
        return;
      }
      setBotVars((previous) => buildBotVars(previous, path, nextVariableId));
    },
    [path, setBotVars]
  );

  const unbindVariable = useCallback(() => {
    if (!setBotVars) {
      return;
    }
    setBotVars((previous) => pruneBotVars(previous, path));
  }, [path, setBotVars]);

  return {
    variableId,
    isBound: Boolean(variableId),
    bindVariable,
    unbindVariable,
    botVars,
  };
};

export { buildBotVars, pruneBotVars };

export default useBotVarBinding;
