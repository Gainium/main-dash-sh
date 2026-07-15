import { memo } from 'react';

import { GridRangeSettings } from '@/features/bots/bot-types/grid/form/sections';
import type { BotFormTabComponentProps } from '@/features/bots/widgets/BotForm/types';

export const GridRangeSettingsTab = memo<BotFormTabComponentProps>(() => (
  <div className="space-y-md sm:space-y-lg lg:space-y-xl">
    <GridRangeSettings />
  </div>
));
GridRangeSettingsTab.displayName = 'GridRangeSettingsTab';

export default GridRangeSettingsTab;
