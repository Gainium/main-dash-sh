import React from 'react';

import { BotControllerSettings } from '@/features/bots/bot-types/dca/form/sections';
import type { BotFormTabComponentProps } from '@/features/bots/widgets/BotForm/types';
import { tabPropsEqualIgnoringHot } from '@/features/bots/widgets/BotForm/tabPropsEqual';

export const BotControllerSettingsTab = React.memo<BotFormTabComponentProps>(({
  updateFormData,
}) => {
  return (
    <div className="space-y-lg lg:space-y-10">
      <BotControllerSettings
        updateFormData={updateFormData}
      />
    </div>
  );
}, tabPropsEqualIgnoringHot);
BotControllerSettingsTab.displayName = 'BotControllerSettingsTab';

export default BotControllerSettingsTab;
