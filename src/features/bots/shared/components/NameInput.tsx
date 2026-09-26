import React from 'react';

import { FieldVariableBinding } from '@/components/ui/field-variable-binding';
import { Input } from '@/components/ui/input';
import SettingsRow from '@/components/widgets/shared/SettingsRow';
import {
  useBotFormActions,
  useBotFormAlerts,
  useBotFormTopLevelSelector,
} from '@/contexts/bots/form/BotFormProvider';

export const NameInput: React.FC = () => {
  // Narrow reads: the name, its alerts and the stable actions — not the whole
  // form (three whole-store subscriptions used to live here).
  const name = useBotFormTopLevelSelector('name');
  const { updateFormData, isFieldLocked } = useBotFormActions();
  const nameAlerts = useBotFormAlerts().name;

  return (
    <SettingsRow
      name="Bot Name"
      tooltip="Name for your bot configuration"
      alerts={nameAlerts ?? []}
      navId="name"
    >
      <div className="space-y-xs">
        <FieldVariableBinding
          path="name"
          varType="text"
          tooltip="Bind bot name"
          variant="inline"
          disabled={Boolean(isFieldLocked?.('name'))}
          onVariableSelected={(variable) => {
            if (variable?.value === undefined || variable.value === null) {
              return;
            }
            const nextValue =
              typeof variable.value === 'string'
                ? variable.value
                : String(variable.value);
            updateFormData('name', nextValue);
          }}
          onVariableResolved={(variable) => {
            if (
              !variable ||
              variable.value === undefined ||
              variable.value === null
            ) {
              return;
            }
            const nextValue =
              typeof variable.value === 'string'
                ? variable.value
                : String(variable.value);
            if (nextValue !== name) {
              updateFormData('name', nextValue);
            }
          }}
        >
          <Input
            id="grid-bot-name"
            value={name}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              updateFormData('name', event.target.value)
            }
            placeholder="Enter a descriptive bot name"
            className={
              (nameAlerts ?? []).some(
                (a) => a.variant === 'error'
              )
                ? 'border-destructive'
                : ''
            }
            disabled={Boolean(isFieldLocked?.('name'))}
          />
        </FieldVariableBinding>
        {/* Name errors are surfaced via SettingsRow alerts (validator-driven) */}
      </div>
    </SettingsRow>
  );
};
