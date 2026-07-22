import { useCallback, useEffect, useState } from 'react';

import { BotPageBoundary } from '@/components/bots/workbench/BotPageBoundary';
import { BotWorkbench } from '@/components/bots/workbench/BotWorkbench';
import { dcaPageDescriptor } from '@/components/bots/workbench/descriptors';
import { useBotConfigPreload } from '@/hooks/useBotConfigPreload';
import { useGraphQL } from '@/hooks/useGraphQL';
import { botQueries } from '@/lib/api/GraphQLQueries-bot-queries';
import { logger } from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';
import { mapBotSettingsToFormData } from '@/mappers/bots/dca/map-bot-settings-to-form-data';
import {
  BotTypesEnum,
  type DCABacktestingResultHistory,
  type DCABot,
} from '@/types';
import type { BotFormData } from '@/types/bots/form';
import { useSearchParams } from 'react-router-dom';

const TradingBotNewWidget = () => {
  // Preloaded form seed from sessionStorage.botConfig (set by the
  // curated-presets widget, BotCard "Copy to live", etc.) plus URL hints.
  // Returns null when nothing is staged or a `?clone=` URL wins.
  const preload = useBotConfigPreload();

  // Clone-from-bot via `?load=<id>`: fetch the source DCA bot, map its
  // settings to form data, append "(Clone)" to the name, and seed the form.
  // Uses the shared `useGraphQL` hook (same as the combo/grid new pages) so
  // the fetch runs in the correct paper/live trading context — a raw
  // GraphQLClient would default to live and return "Bot not found" when
  // cloning a paper bot.
  const [searchParams] = useSearchParams();
  const loadFromBotId = searchParams.get('load');
  const loadQuery = useGraphQL<DCABot>(
    'getDCABot',
    botQueries.getDCABot({ id: loadFromBotId ?? '' }),
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
      toast.error('Failed to load bot to clone');
      setLoadHandled(true);
      return;
    }

    const payload = loadQuery.data;
    if (!payload) return;

    if (payload.status !== 'OK' || !payload.data) {
      toast.error(payload.reason || 'Could not load bot to clone');
      setLoadHandled(true);
      return;
    }

    try {
      const bot = payload.data;
      const { formData } = mapBotSettingsToFormData(
        BotTypesEnum.dca,
        bot.settings,
        { bot }
      );
      const base = formData.name?.trim();
      setLoadedFormData({
        ...formData,
        name: base ? `${base} (Clone)` : 'Bot (Clone)',
      });
    } catch (err) {
      logger.error('[TradingBotNew] Failed to map loaded bot settings', {
        error: err instanceof Error ? err.message : String(err),
        id: loadFromBotId,
      });
      toast.error('Failed to load bot settings');
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

  // Also hold the seed while a curated/URL exchange provider is still
  // resolving against the (async-loading) exchanges store — otherwise the
  // form seeds before the provider→UUID lookup can run. See
  // useBotConfigPreload's `exchangePending`.
  const isLoadingClone =
    (Boolean(loadFromBotId) && !loadHandled) ||
    Boolean(preload?.exchangePending);

  // "Load in settings" — in-place form reload with the backtest's settings.
  const handleLoadBacktest = useCallback(
    (backtest: DCABacktestingResultHistory) => {
      try {
        const { formData: mappedFormData } = mapBotSettingsToFormData(
          BotTypesEnum.dca,
          {
            settings: backtest.settings,
            exchangeUUID: backtest.exchangeUUID,
          }
        );
        setLoadedFormData(mappedFormData);
        setFormReloadKey((prev) => prev + 1);
        toast.success('Backtest settings loaded into bot form');
      } catch (error) {
        logger.error('[TradingBotNew] Failed to load backtest settings', {
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
      descriptor={dcaPageDescriptor}
      mode="create"
      initialFormData={initialFormData}
      formReloadKey={formReloadKey}
      isSeedPending={isLoadingClone}
      onLoadBacktestIntoForm={handleLoadBacktest}
    />
  );
};

const TradingBotNew = () => (
  <BotPageBoundary descriptor={dcaPageDescriptor} mode="create">
    <TradingBotNewWidget />
  </BotPageBoundary>
);

export default TradingBotNew;
