import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { BotPageBoundary } from '@/components/bots/workbench/BotPageBoundary';
import { BotWorkbench } from '@/components/bots/workbench/BotWorkbench';
import { dcaPageDescriptor } from '@/components/bots/workbench/descriptors';
import { logger } from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';
import { BotTypesEnum, type DCABacktestingResultHistory } from '@/types';

const TradingBotEditWidget = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const hasBotId = Boolean(id);
  const safeBotId = id ?? '';

  const handleLoadBacktest = useCallback(
    (backtest: DCABacktestingResultHistory) => {
      try {
        // Stage the backtest settings for the fresh form on /bot/new
        // (same one-shot channel as "Copy to live"); the new form reads
        // it via useBotConfigPreload.
        sessionStorage.setItem(
          'botConfig',
          JSON.stringify({
            type: BotTypesEnum.dca,
            settings: backtest.settings,
          })
        );
        toast.success('Backtest settings loaded into new bot form');
        navigate('/bot/new');
      } catch (error) {
        logger.error('[TradingBotEdit] Failed to load backtest settings', {
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
      descriptor={dcaPageDescriptor}
      mode="edit"
      botId={safeBotId}
      hasBotId={hasBotId}
      onLoadBacktestIntoForm={handleLoadBacktest}
    />
  );
};

const TradingBotEdit = () => (
  <BotPageBoundary descriptor={dcaPageDescriptor} mode="edit">
    <TradingBotEditWidget />
  </BotPageBoundary>
);

export default TradingBotEdit;
