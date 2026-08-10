import React from 'react';

import { DCASettings } from '@/features/bots/bot-types/dca/form/sections';
import type { BotFormTabComponentProps } from '@/features/bots/widgets/BotForm/types';

export const DCASettingsTab = React.memo<BotFormTabComponentProps>(({
  currentExchange,
  formData,
  updateFormData,
  errors,
  handleUpdateBalances,
}) => (
  <div className="space-y-md">
    <DCASettings
      currentExchange={currentExchange}
      formData={formData}
      updateFormData={updateFormData}
      errors={errors}
      {...(handleUpdateBalances
        ? { onUpdateBalances: handleUpdateBalances }
        : {})}
    />
  </div>
));
DCASettingsTab.displayName = 'DCASettingsTab';

export default DCASettingsTab;
