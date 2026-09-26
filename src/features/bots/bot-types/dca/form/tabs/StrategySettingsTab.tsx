import React from 'react';

import { StrategySettings } from '@/features/bots/bot-types/dca/form/sections';
import type { BotFormTabComponentProps } from '@/features/bots/widgets/BotForm/types';
import { tabPropsEqualIgnoringHot } from '@/features/bots/widgets/BotForm/tabPropsEqual';
import type { DcaBot } from '@/types/dcaBot';

export const StrategySettingsTab = React.memo<BotFormTabComponentProps>(({
  currentExchange,
  updateFormData,
  bot,
  handleUpdateBalances,
}) => {
  return (
  <div className="space-y-md">
    <StrategySettings
      currentExchange={currentExchange}
      updateFormData={updateFormData}
      bot={(bot as DcaBot | null) ?? null}
      {...(handleUpdateBalances
        ? { onUpdateBalances: handleUpdateBalances }
        : {})}
    />
  </div>
  );
}, tabPropsEqualIgnoringHot);
StrategySettingsTab.displayName = 'StrategySettingsTab';

export default StrategySettingsTab;
