import React from 'react';

import { StrategySettings } from '@/features/bots/bot-types/dca/form/sections';
import type { BotFormTabComponentProps } from '@/features/bots/widgets/BotForm/types';
import type { DcaBot } from '@/types/dcaBot';

export const StrategySettingsTab = React.memo<BotFormTabComponentProps>(({
  currentExchange,
  formData,
  updateFormData,
  errors,
  bot,
  handleUpdateBalances,
}) => (
  <div className="space-y-md sm:space-y-lg lg:space-y-xl">
    <StrategySettings
      currentExchange={currentExchange}
      formData={formData}
      updateFormData={updateFormData}
      errors={errors}
      bot={(bot as DcaBot | null) ?? null}
      {...(handleUpdateBalances
        ? { onUpdateBalances: handleUpdateBalances }
        : {})}
    />
  </div>
));
StrategySettingsTab.displayName = 'StrategySettingsTab';

export default StrategySettingsTab;
