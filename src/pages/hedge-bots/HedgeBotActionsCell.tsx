/**
 * Per-row actions cell for the hedge bot tables: the shared bot table
 * actions, targeting the hedge wrapper (its id + `hedgeDca`/`hedgeCombo`
 * type), so start/stop, clone, archive and delete act on both legs at once.
 */
import React from 'react';

import { BotTableActions } from '@/components/bots/BotTableActions';
import type { BotTypesEnum, HedgeBot } from '@/types';

export interface HedgeBotActionsCellProps {
  bot: HedgeBot;
  botType: BotTypesEnum.hedgeDca | BotTypesEnum.hedgeCombo;
}

export const HedgeBotActionsCell: React.FC<HedgeBotActionsCellProps> = ({
  bot,
  botType,
}) => <BotTableActions source={bot} kind={botType} surface="hedgeRow" />;

export default HedgeBotActionsCell;
