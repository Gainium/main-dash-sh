import React from 'react';

import { BasicSettings } from '@/features/bots/bot-types/dca/form/sections';
import type { BotFormTabComponentProps } from '@/features/bots/widgets/BotForm/types';

export const BasicSettingsTab = React.memo<BotFormTabComponentProps>(({
  currentExchange,
  formData,
  updateFormData,
  errors,
  exchangesData,
  exchangesLoading,
  handleUpdateBalances,
  mode,
  isFieldLocked,
}) => (
  <div className="space-y-md sm:space-y-lg lg:space-y-xl">
    <BasicSettings
      currentExchange={currentExchange}
      formData={formData}
      updateFormData={updateFormData}
      exchangesData={exchangesData}
      {...(typeof exchangesLoading === 'boolean' ? { exchangesLoading } : {})}
      errors={errors}
      {...(handleUpdateBalances
        ? { onUpdateBalances: handleUpdateBalances }
        : {})}
      mode={mode}
      isFieldLocked={isFieldLocked}
    />
  </div>
));
BasicSettingsTab.displayName = 'BasicSettingsTab';

export default BasicSettingsTab;
