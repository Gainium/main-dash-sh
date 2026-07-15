import React from 'react';

import { StopLossSettings } from '@/features/bots/bot-types/dca/form/sections';
import type { BotFormTabComponentProps } from '@/features/bots/widgets/BotForm/types';

export const StopLossSettingsTab = React.memo<BotFormTabComponentProps>(({
  currentExchange,
  formData,
  updateFormData,
  errors,
}) => (
  <div className="space-y-md sm:space-y-lg lg:space-y-xl">
    <StopLossSettings
      currentExchange={currentExchange}
      formData={formData}
      updateFormData={updateFormData}
      errors={errors}
    />
  </div>
));
StopLossSettingsTab.displayName = 'StopLossSettingsTab';

export default StopLossSettingsTab;
