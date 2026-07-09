import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { BotPageBoundary } from '@/components/bots/workbench/BotPageBoundary';
import { BotWorkbench } from '@/components/bots/workbench/BotWorkbench';
import { comboPageDescriptor } from '@/components/bots/workbench/descriptors';
import { logger } from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';
import { BotTypesEnum, type DCABacktestingResultHistory } from '@/types';

const ComboBotEditWidget = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const hasBotId = Boolean(id);
  const safeBotId = id ?? '';

  const handleLoadBacktest = useCallback(
    (backtest: DCABacktestingResultHistory) => {
      try {
        // Stage the backtest settings for the fresh form on /combo/new (same
        // one-shot channel as "Copy to live"); the new form reads it via
        // useBotConfigPreload.
        sessionStorage.setItem(
          'botConfig',
          JSON.stringify({
            type: BotTypesEnum.combo,
            settings: backtest.settings,
          })
        );
        toast.success('Backtest settings loaded into new combo bot form');
        navigate('/combo/new');
      } catch (error) {
        logger.error('[ComboBotEdit] Failed to load backtest settings', {
          id: backtest._id,
          error: error instanceof Error ? error.message : String(error),
        });
        toast.error('Failed to load backtest settings into bot form');
      }
    },
    [navigate]
  );

  return (
    <BotWorkbench
      descriptor={comboPageDescriptor}
      mode="edit"
      botId={safeBotId}
      hasBotId={hasBotId}
      onLoadBacktestIntoForm={handleLoadBacktest}
    />
  );
};

const ComboBotEdit = () => (
  <BotPageBoundary descriptor={comboPageDescriptor} mode="edit">
    <ComboBotEditWidget />
  </BotPageBoundary>
);

export default ComboBotEdit;
