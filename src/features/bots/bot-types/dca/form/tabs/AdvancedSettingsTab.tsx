import React from 'react';

import type { BotFormTabComponentProps } from '@/features/bots/widgets/BotForm/types';

export const AdvancedSettingsTab = React.memo<BotFormTabComponentProps>(() => {
  return (
    <div className="space-y-lg lg:space-y-10">
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-lg text-sm text-muted-foreground">
        Advanced settings have been moved to separate tabs:
        <ul className="mt-2 ml-4 list-disc space-y-1">
          <li>Bot Controller settings are now in the "Bot Controller" tab</li>
          <li>Experimental features are now in the "Experimental" tab</li>
        </ul>
      </div>
    </div>
  );
});
AdvancedSettingsTab.displayName = 'AdvancedSettingsTab';

export default AdvancedSettingsTab;
