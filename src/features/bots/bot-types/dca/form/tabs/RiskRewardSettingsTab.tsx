import React from 'react';

import { RiskRewardRuntimeProvider } from '@/contexts/bots/dca/RiskRewardRuntimeContext';
import { RiskRewardSettings } from '@/features/bots/bot-types/dca/form/sections';
import { tabPropsEqualIgnoringHot } from '@/features/bots/widgets/BotForm/tabPropsEqual';
import type { BotFormTabComponentProps } from '@/features/bots/widgets/BotForm/types';

// RiskRewardSettings reads formData/errors/alerts from the form store (selectors
// + useBotFormErrors/useBotFormAlerts + useBotFormDcaTradingContext), so this tab
// no longer forwards them and its memo bails on keystrokes via the comparator.
export const RiskRewardSettingsTab = React.memo<BotFormTabComponentProps>(
  () => (
    <RiskRewardRuntimeProvider>
      <div className="space-y-md sm:space-y-lg lg:space-y-xl">
        <RiskRewardSettings />
      </div>
    </RiskRewardRuntimeProvider>
  ),
  tabPropsEqualIgnoringHot
);
RiskRewardSettingsTab.displayName = 'RiskRewardSettingsTab';

export default RiskRewardSettingsTab;
