import { useCallback, useEffect, useState } from 'react';

import { BotPageBoundary } from '@/components/bots/workbench/BotPageBoundary';
import { BotWorkbench } from '@/components/bots/workbench/BotWorkbench';
import { dcaPageDescriptor } from '@/components/bots/workbench/descriptors';
import { useBotConfigPreload } from '@/hooks/useBotConfigPreload';
import { GraphQLClient } from '@/lib/api';
import { botQueries } from '@/lib/api/GraphQLQueries-bot-queries';
import { logger } from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';
import { mapBotSettingsToFormData } from '@/mappers/bots/dca/map-bot-settings-to-form-data';
import { useAuthStore } from '@/stores/authStore';
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
  // settings to form data, append "(Clone)" to the name, and seed the
  // form. Mirrors the hedge clone flow in HedgeBotFormProvider.
  const [searchParams] = useSearchParams();
  const loadFromBotId = searchParams.get('load');
  const [loadedFormData, setLoadedFormData] = useState<
    Partial<BotFormData> | null
  >(null);
  const [loadFromBotPending, setLoadFromBotPending] = useState(
    Boolean(loadFromBotId)
  );

  useEffect(() => {
    if (!loadFromBotId) return;
    let cancelled = false;
    setLoadFromBotPending(true);

    const endpoint =
      import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
    const token = useAuthStore.getState().tokens?.accessToken;
    const client = new GraphQLClient(endpoint, token ?? 'demo');
    const { query, variables } = botQueries.getDCABot({ id: loadFromBotId });

    client
      .request<{
        getDCABot: { status: string; reason?: string; data?: DCABot };
      }>(query, variables)
      .then((response) => {
        if (cancelled) return;
        const payload = response.getDCABot;
        if (payload?.status === 'OK' && payload.data) {
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
            setLoadedFormData(null);
          }
        } else {
          toast.error(payload?.reason || 'Could not load bot to clone');
          setLoadedFormData(null);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        logger.error('[TradingBotNew] getDCABot for clone failed', {
          error: err instanceof Error ? err.message : String(err),
          id: loadFromBotId,
        });
        toast.error(
          err instanceof Error ? err.message : 'Failed to load bot to clone'
        );
        setLoadedFormData(null);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadFromBotPending(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadFromBotId]);

  const [formReloadKey, setFormReloadKey] = useState(0);

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
  const isSeedPending = Boolean(loadFromBotId) && loadFromBotPending;

  return (
    <BotWorkbench
      descriptor={dcaPageDescriptor}
      mode="create"
      initialFormData={initialFormData}
      formReloadKey={formReloadKey}
      isSeedPending={isSeedPending}
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
