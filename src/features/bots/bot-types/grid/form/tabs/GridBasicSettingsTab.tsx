import { memo } from 'react';

import { GridBasicSettings } from '@/features/bots/bot-types/grid/form/sections';
import type { BotFormTabComponentProps } from '@/features/bots/widgets/BotForm/types';

export const GridBasicSettingsTab = memo<BotFormTabComponentProps>(({
  currentExchange,
  exchangesLoading,
  handleUpdateBalances,
  mode,
  exchangesData,
}) => (
  <div className="space-y-md sm:space-y-lg lg:space-y-xl">
    <GridBasicSettings
      currentExchange={currentExchange}
      {...(typeof exchangesLoading === 'boolean' ? { exchangesLoading } : {})}
      {...(handleUpdateBalances
        ? {
            onUpdateBalances: () => {
              void handleUpdateBalances();
            },
          }
        : {})}
      mode={mode}
      exchangesData={exchangesData}
    />
  </div>
));
GridBasicSettingsTab.displayName = 'GridBasicSettingsTab';

export default GridBasicSettingsTab;
