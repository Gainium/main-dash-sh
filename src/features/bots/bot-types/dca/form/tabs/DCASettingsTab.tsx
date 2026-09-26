import React from 'react';

import { DCASettings } from '@/features/bots/bot-types/dca/form/sections';
import type { BotFormTabComponentProps } from '@/features/bots/widgets/BotForm/types';
import { tabPropsEqualIgnoringHot } from '@/features/bots/widgets/BotForm/tabPropsEqual';

export const DCASettingsTab = React.memo<BotFormTabComponentProps>(({
  currentExchange,
  updateFormData,
  handleUpdateBalances,
}) => {
  return (
  <div className="space-y-md">
    <DCASettings
      currentExchange={currentExchange}
      updateFormData={updateFormData}
      {...(handleUpdateBalances
        ? { onUpdateBalances: handleUpdateBalances }
        : {})}
    />
  </div>
  );
}, tabPropsEqualIgnoringHot);
DCASettingsTab.displayName = 'DCASettingsTab';

export default DCASettingsTab;
