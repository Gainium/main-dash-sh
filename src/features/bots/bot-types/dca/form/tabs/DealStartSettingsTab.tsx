import React from 'react';

import { DealStartSettings } from '@/features/bots/bot-types/dca/form/sections';
import { tabPropsEqualIgnoringHot } from '@/features/bots/widgets/BotForm/tabPropsEqual';
import type { BotFormTabComponentProps } from '@/features/bots/widgets/BotForm/types';

// DealStartSettings reads formData/errors/alerts/currentExchange from the form
// store/query hooks, so this tab no longer forwards them and its memo bails on
// keystrokes via the shared comparator.
export const DealStartSettingsTab = React.memo<BotFormTabComponentProps>(
  () => (
    <div className="space-y-md">
      <DealStartSettings />
    </div>
  ),
  tabPropsEqualIgnoringHot
);
DealStartSettingsTab.displayName = 'DealStartSettingsTab';

export default DealStartSettingsTab;
