import React from 'react';

import { StopLossSettings } from '@/features/bots/bot-types/dca/form/sections';
import type { BotFormTabComponentProps } from '@/features/bots/widgets/BotForm/types';
import { tabPropsEqualIgnoringHot } from '@/features/bots/widgets/BotForm/tabPropsEqual';

export const StopLossSettingsTab = React.memo<BotFormTabComponentProps>(({
  currentExchange,
  updateFormData,
}) => {
  return (
  <div className="space-y-md">
    <StopLossSettings
      currentExchange={currentExchange}
      updateFormData={updateFormData}
    />
  </div>
  );
}, tabPropsEqualIgnoringHot);
StopLossSettingsTab.displayName = 'StopLossSettingsTab';

export default StopLossSettingsTab;
