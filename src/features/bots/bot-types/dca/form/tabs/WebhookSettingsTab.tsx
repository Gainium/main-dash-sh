import { BotWebhookSettings } from '@/features/bots/bot-types/dca/form/sections';
import { tabPropsEqualIgnoringHot } from '@/features/bots/widgets/BotForm/tabPropsEqual';
import type { BotFormTabComponentProps } from '@/features/bots/widgets/BotForm/types';
import React from 'react';

// BotWebhookSettings reads pair/pairMetadata from the form store, so this tab no
// longer forwards formData and its memo bails on keystrokes via the comparator.
export const WebhookSettingsTab = React.memo<BotFormTabComponentProps>(
  () => (
    <div className="space-y-lg sm:space-y-xl lg:space-y-10">
      <BotWebhookSettings />
    </div>
  ),
  tabPropsEqualIgnoringHot
);
WebhookSettingsTab.displayName = 'WebhookSettingsTab';

export default WebhookSettingsTab;
