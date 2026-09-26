import { TerminalButtonStack } from '@/components/ui/terminal-button-stack';
import SettingsRow from '@/components/widgets/shared/SettingsRow';
import {
  useBotFormActions,
  useBotFormSelector,
} from '@/contexts/bots/form/BotFormProvider';
import { ComboTpBase } from '@/types';
import React, { useMemo } from 'react';

type BaseStopLosslOnProps = {
  section?: 'tp' | 'sl';
};

export const BaseStopLosslOn: React.FC<BaseStopLosslOnProps> = ({
  section = 'sl',
}) => {
  const { updateFormData } = useBotFormActions();
  const useRiskReward = useBotFormSelector('useRiskReward');
  const comboTpBase = useBotFormSelector('comboTpBase');
  const riskRewardActive = useMemo(
    () => Boolean(useRiskReward),
    [useRiskReward]
  );
  const comboBaseValue = useMemo(
    () => (comboTpBase ?? ComboTpBase.full) as ComboTpBase,
    [comboTpBase]
  );

  return (
    <SettingsRow
      name={section === 'sl' ? 'Base Stop Loss On' : 'Base Take Profit On'}
      tooltip={
        section === 'sl'
          ? 'Apply the stop loss percentage to either the DCA capital already used or the maximum allocation configured for the combo bot. Used DCA adapts the stop loss as the position scales in; Max DCA keeps the reference fixed on the maximum allocation.'
          : 'Apply the take profit percentage to either the DCA capital already used or the maximum allocation configured for the combo bot. Used DCA adapts the take profit as the position scales in; Max DCA keeps the reference fixed on the maximum allocation.'
      }
    >
      <TerminalButtonStack
        value={(comboBaseValue ?? ComboTpBase.filled) as string}
        onValueChange={(nextValue) =>
          updateFormData('comboTpBase', nextValue as ComboTpBase)
        }
        options={[
          { value: ComboTpBase.filled, label: 'Used DCA' },
          { value: ComboTpBase.full, label: 'Max DCA' },
        ]}
        className="w-full"
        disabled={riskRewardActive}
      />
    </SettingsRow>
  );
};
