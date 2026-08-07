import React from 'react';

import { BotControllerSettings } from '@/features/bots/bot-types/dca/form/sections';
import type { BotFormTabComponentProps } from '@/features/bots/widgets/BotForm/types';

export const BotControllerSettingsTab = React.memo<BotFormTabComponentProps>(({
  formData,
  updateFormData,
}) => {
  return (
    <div className="space-y-lg lg:space-y-10">
      <BotControllerSettings
        formData={formData}
        updateFormData={updateFormData}
      />
    </div>
  );
});
BotControllerSettingsTab.displayName = 'BotControllerSettingsTab';

export default BotControllerSettingsTab;
