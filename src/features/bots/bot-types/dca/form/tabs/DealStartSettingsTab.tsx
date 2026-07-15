import React from 'react';

import { DealStartSettings } from '@/features/bots/bot-types/dca/form/sections';
import type { BotFormTabComponentProps } from '@/features/bots/widgets/BotForm/types';

export const DealStartSettingsTab = React.memo<BotFormTabComponentProps>(({
  currentExchange,
  formData,
  updateFormData,
  errors,
}) => (
  <div className="space-y-md sm:space-y-lg lg:space-y-xl">
    <DealStartSettings
      currentExchange={currentExchange}
      formData={formData}
      updateFormData={updateFormData}
      errors={errors}
    />
  </div>
));
DealStartSettingsTab.displayName = 'DealStartSettingsTab';

export default DealStartSettingsTab;
