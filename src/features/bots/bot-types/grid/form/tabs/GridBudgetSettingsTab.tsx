import { memo } from 'react';

import { GridBudgetSettings } from '@/features/bots/bot-types/grid/form/sections';
import type { BotFormTabComponentProps } from '@/features/bots/widgets/BotForm/types';

export const GridBudgetSettingsTab = memo<BotFormTabComponentProps>(
  ({ handleUpdateBalances }) => (
    <div className="space-y-md">
      <GridBudgetSettings
        {...(handleUpdateBalances
          ? {
              onUpdateBalances: () => {
                void handleUpdateBalances();
              },
            }
          : {})}
      />
    </div>
  )
);
GridBudgetSettingsTab.displayName = 'GridBudgetSettingsTab';

export default GridBudgetSettingsTab;
