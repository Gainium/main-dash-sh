import { memo } from 'react';

import { GridStrategySettings } from '@/features/bots/bot-types/grid/form/sections';
import type { BotFormTabComponentProps } from '@/features/bots/widgets/BotForm/types';

export const GridStrategySettingsTab = memo<BotFormTabComponentProps>(() => (
  <div className="space-y-md sm:space-y-lg lg:space-y-xl">
    <GridStrategySettings />
  </div>
));
GridStrategySettingsTab.displayName = 'GridStrategySettingsTab';

export default GridStrategySettingsTab;
