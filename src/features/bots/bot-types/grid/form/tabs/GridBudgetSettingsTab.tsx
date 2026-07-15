import { memo } from 'react';

import { GridBudgetSettings } from '@/features/bots/bot-types/grid/form/sections';
import type { BotFormTabComponentProps } from '@/features/bots/widgets/BotForm/types';

export const GridBudgetSettingsTab = memo<BotFormTabComponentProps>(() => (
  <div className="space-y-md sm:space-y-lg lg:space-y-xl">
    <GridBudgetSettings />
  </div>
));
GridBudgetSettingsTab.displayName = 'GridBudgetSettingsTab';

export default GridBudgetSettingsTab;
