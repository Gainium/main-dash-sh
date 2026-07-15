import React from 'react';

import { TakeProfitSettings } from '@/features/bots/bot-types/dca/form/sections';
import { tabPropsEqualIgnoringHot } from '@/features/bots/widgets/BotForm/tabPropsEqual';
import type { BotFormTabComponentProps } from '@/features/bots/widgets/BotForm/types';

// TakeProfitSettings reads formData/errors from the bot form store (selectors +
// useBotFormErrors), so this tab no longer forwards them. The comparator ignores
// the per-keystroke-hot props so a keystroke elsewhere in the form doesn't
// re-render the whole Take Profit section.
export const TakeProfitSettingsTab = React.memo<BotFormTabComponentProps>(
  () => (
    <div className="space-y-md sm:space-y-lg lg:space-y-xl">
      <TakeProfitSettings />
    </div>
  ),
  tabPropsEqualIgnoringHot
);
TakeProfitSettingsTab.displayName = 'TakeProfitSettingsTab';

export default TakeProfitSettingsTab;
