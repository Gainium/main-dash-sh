import { memo } from 'react';

import { GridTakeProfitSettings } from '@/features/bots/bot-types/grid/form/sections';
import type { BotFormTabComponentProps } from '@/features/bots/widgets/BotForm/types';

export const GridTakeProfitSettingsTab = memo<BotFormTabComponentProps>(() => (
  <div className="space-y-md">
    <GridTakeProfitSettings />
  </div>
));
GridTakeProfitSettingsTab.displayName = 'GridTakeProfitSettingsTab';

export default GridTakeProfitSettingsTab;
