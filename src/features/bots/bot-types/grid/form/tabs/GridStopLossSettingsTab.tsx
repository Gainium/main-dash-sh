import { memo } from 'react';

import { GridStopLossSettings } from '@/features/bots/bot-types/grid/form/sections';
import type { BotFormTabComponentProps } from '@/features/bots/widgets/BotForm/types';

export const GridStopLossSettingsTab = memo<BotFormTabComponentProps>(() => (
  <div className="space-y-md">
    <GridStopLossSettings />
  </div>
));
GridStopLossSettingsTab.displayName = 'GridStopLossSettingsTab';

export default GridStopLossSettingsTab;
