import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { BotWorkbench } from '@/components/bots/workbench/BotWorkbench';
import { comboPageDescriptor } from '@/components/bots/workbench/descriptors';
import { TradingTerminalUtilsProvider } from '@/context/TradingTerminalUtilsContext';
import { useBotConfigPreload } from '@/hooks/useBotConfigPreload';
import { useGraphQL } from '@/hooks/useGraphQL';
import { botQueries } from '@/lib/api/GraphQLQueries-bot-queries';
import { logger } from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';
import { mapBotSettingsToFormData } from '@/mappers/bots/dca/map-bot-settings-to-form-data';
import { indicatorStore } from '@/stores/indicatorStore';
import {
  BotTypesEnum,
  type ComboBot,
  type DCABacktestingResultHistory,
  type DCABot,
} from '@/types';
import type { BotFormData } from '@/types/bots/form';
import { exampleOrdersStore } from '@/utils/bots/dca/example-orders';

const ComboBotNewWidget = () => {
  // Preloaded form seed from sessionStorage.botConfig plus URL hints.
  const preload = useBotConfigPreload();

  // Clone-from-list flow: `/combo/new?load=<id>` fetches the source bot, maps
  // its settings to formData, and seeds the form with a "(Clone)" name suffix.
  const [searchParams] = useSearchParams();
  const loadFromBotId = searchParams.get('load');
  const loadQuery = useGraphQL<ComboBot>(
    'getComboBot',
    botQueries.getComboBot({ id: loadFromBotId ?? '' }),
    { enabled: Boolean(loadFromBotId) }
  );

  const [loadedFormData, setLoadedFormData] = useState<
    Partial<BotFormData> | undefined
  >(undefined);
  const [loadHandled, setLoadHandled] = useState(false);
  const [formReloadKey, setFormReloadKey] = useState(0);

  useEffect(() => {
    if (!loadFromBotId || loadHandled) return;
    if (loadQuery.isLoading) return;

    if (loadQuery.error) {
      toast.error('Failed to load bot configuration');
      setLoadHandled(true);
      return;
    }

    const payload = loadQuery.data;
    if (!payload) return;

    if (payload.status !== 'OK' || !payload.data) {
      toast.error(payload.reason || 'Failed to load bot configuration');
      setLoadHandled(true);
      return;
    }

    try {
      const bot = payload.data;
      const { formData } = mapBotSettingsToFormData(
        BotTypesEnum.combo,
        bot.settings,
        { bot: bot as unknown as DCABot }
      );
      const base = formData.name?.trim();
      setLoadedFormData({
        ...formData,
        name: base ? `${base} (Clone)` : 'Combo bot (Clone)',
      });
    } catch (err) {
      logger.error('[ComboBotNew] Failed to map cloned bot settings', {
        error: err instanceof Error ? err.message : String(err),
      });
      toast.error('Failed to load bot configuration');
    } finally {
      setLoadHandled(true);
    }
  }, [
    loadFromBotId,
    loadHandled,
    loadQuery.isLoading,
    loadQuery.error,
    loadQuery.data,
  ]);

  const isLoadingClone = Boolean(loadFromBotId) && !loadHandled;

  useEffect(() => {
    return () => {
      indicatorStore.reset();
      exampleOrdersStore.reset();
    };
  }, []);

  // "Load in settings" — in-place form reload with the backtest's settings.
  const handleLoadBacktest = useCallback(
    (backtest: DCABacktestingResultHistory) => {
      try {
        const { formData: mappedFormData } = mapBotSettingsToFormData(
          BotTypesEnum.combo,
          {
            settings: backtest.settings,
            exchangeUUID: backtest.exchangeUUID,
          }
        );
        setLoadedFormData(mappedFormData);
        setFormReloadKey((prev) => prev + 1);
        toast.success('Backtest settings loaded into combo bot form');
      } catch (error) {
        logger.error('[ComboBotNew] Failed to load backtest settings', {
          id: backtest._id,
          error: error instanceof Error ? error.message : String(error),
        });
        toast.error('Failed to load backtest settings into bot form');
      }
    },
    []
  );

  const initialFormData = loadedFormData ?? preload?.initialFormData;

  return (
    <BotWorkbench
      descriptor={comboPageDescriptor}
      mode="create"
      initialFormData={initialFormData}
      formReloadKey={formReloadKey}
      isSeedPending={isLoadingClone}
      onLoadBacktestIntoForm={handleLoadBacktest}
    />
  );
};

const ComboBotNew = () => {
  return (
    <TradingTerminalUtilsProvider>
      <ComboBotNewWidget />
    </TradingTerminalUtilsProvider>
  );
};

export default ComboBotNew;
