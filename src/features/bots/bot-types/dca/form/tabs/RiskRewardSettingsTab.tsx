import React from 'react';

import { RiskRewardRuntimeProvider } from '@/contexts/bots/dca/RiskRewardRuntimeContext';
import { RiskRewardSettings } from '@/features/bots/bot-types/dca/form/sections';
import type { BotFormTabComponentProps } from '@/features/bots/widgets/BotForm/types';

export const RiskRewardSettingsTab = React.memo<BotFormTabComponentProps>(({
  currentExchange,
  formData,
  updateFormData,
  errors,
}) => (
  <RiskRewardRuntimeProvider>
    <div className="space-y-md sm:space-y-lg lg:space-y-xl">
      <RiskRewardSettings
        currentExchange={currentExchange}
        formData={formData}
        updateFormData={updateFormData}
        errors={errors}
      />
    </div>
  </RiskRewardRuntimeProvider>
));
RiskRewardSettingsTab.displayName = 'RiskRewardSettingsTab';

export default RiskRewardSettingsTab;
