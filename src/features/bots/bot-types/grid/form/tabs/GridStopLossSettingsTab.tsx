import { memo } from 'react';

import { GridStopLossSettings } from '@/features/bots/bot-types/grid/form/sections';
import type { BotFormTabComponentProps } from '@/features/bots/widgets/BotForm/types';

export const GridStopLossSettingsTab = memo<BotFormTabComponentProps>(() => (
  <div className="space-y-md sm:space-y-lg lg:space-y-xl">
    <GridStopLossSettings />
  </div>
));
GridStopLossSettingsTab.displayName = 'GridStopLossSettingsTab';

export default GridStopLossSettingsTab;
