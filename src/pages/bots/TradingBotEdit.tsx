import { useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { BotWorkbench } from '@/components/bots/workbench/BotWorkbench';
import { TradingTerminalUtilsProvider } from '@/context/TradingTerminalUtilsContext';
import { useBotModeGuard } from '@/hooks/bots/base/useBotModeGuard';
import { logger } from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';
import { indicatorStore } from '@/stores/indicatorStore';
import {
  BotTypesEnum,
  type DCABacktestingResultHistory,
} from '@/types';
import { exampleOrdersStore } from '@/utils/bots/dca/example-orders';

const TradingBotEditWidget = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const hasBotId = Boolean(id);
  const safeBotId = id ?? '';

  // Keep this bot's real paper/live mode authoritative over the global
  // toggle so a refresh doesn't flip it (and surface a clear error when the
  // bot exists in neither mode instead of "Unknown exchange"). Thread 4872.
  const modeGuard = useBotModeGuard(safeBotId, BotTypesEnum.dca, {
    enabled: hasBotId,
  });

  useEffect(() => {
    return () => {
      indicatorStore.reset();
      exampleOrdersStore.reset();
    };
  }, []);

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
      mode="edit"
      botId={safeBotId}
      hasBotId={hasBotId}
      notFound={modeGuard.notFound}
      onLoadBacktestIntoForm={handleLoadBacktest}
    />
  );
};

const TradingBotEdit = () => {
  return (
    <TradingTerminalUtilsProvider>
      <TradingBotEditWidget />
    </TradingTerminalUtilsProvider>
  );
};

export default TradingBotEdit;
