import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { BotPageBoundary } from '@/components/bots/workbench/BotPageBoundary';
import { BotWorkbench } from '@/components/bots/workbench/BotWorkbench';
import { gridPageDescriptor } from '@/components/bots/workbench/descriptors';
import { useBotConfigPreload } from '@/hooks/useBotConfigPreload';
import { useGraphQL } from '@/hooks/useGraphQL';
import { botQueries } from '@/lib/api/GraphQLQueries-bot-queries';
import { logger } from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';
import { mapGridBotSettingsToFormData } from '@/mappers/bots/grid/map-grid-bot-settings-to-form-data';
import { type Bot } from '@/types';
import type { BotFormData } from '@/types/bots/form';

const GridBotNewWidget = () => {
  // Preloaded form seed from sessionStorage.botConfig (curated-presets widget,
  // wizard slot, More-strategies overlay) plus URL hints.
  const preload = useBotConfigPreload();

  // Clone-from-template via `/grid/new?load=<id>`: fetch the source bot, map
  // its settings to BotFormData, append "(Clone)" to the name, and seed the
  // form. Mirrors the hedge flow in HedgeBotFormProvider.
  const [searchParams] = useSearchParams();
  const loadFromBotId = searchParams.get('load');
  const loadQueryInput = useMemo(
    () => botQueries.getBot({ id: loadFromBotId ?? '' }),
    [loadFromBotId]
  );
  const loadQuery = useGraphQL<Bot>('getBot', loadQueryInput, {
    enabled: Boolean(loadFromBotId),
  });

  const [loadErrorHandled, setLoadErrorHandled] = useState(false);
  useEffect(() => {
    if (!loadFromBotId || loadErrorHandled) return;
    if (loadQuery.isLoading) return;
    const status = loadQuery.data?.status;
    if (loadQuery.error || (status && status !== 'OK')) {
      toast.error('Failed to load bot to clone — starting from scratch');
      setLoadErrorHandled(true);
    }
  }, [
    loadFromBotId,
    loadQuery.isLoading,
    loadQuery.data,
    loadQuery.error,
    loadErrorHandled,
  ]);

  const clonedInitialFormData = useMemo<Partial<BotFormData> | undefined>(() => {
    if (!loadFromBotId) return undefined;
    const sourceBot =
      loadQuery.data?.status === 'OK' ? loadQuery.data.data : null;
    if (!sourceBot) return undefined;
    try {
      const { formData } = mapGridBotSettingsToFormData(sourceBot.settings, {
        bot: {
          exchange: sourceBot.exchange,
          exchangeUUID: sourceBot.exchangeUUID,
          settings: sourceBot.settings as unknown as Record<string, unknown>,
        },
      });
      const base = formData.name?.trim();
      return { ...formData, name: base ? `${base} (Clone)` : '(Clone)' };
    } catch (err) {
      logger.error('[GridBotNew] Failed to map source bot for clone', { err });
      return undefined;
    }
  }, [loadFromBotId, loadQuery.data]);

  // While the source bot is loading, hold the form mount so the seed lands on
  // first render (grid has no formReloadKey pattern). Once the fetch resolves
  // (success or error) we mount normally.
  const isLoadingClone =
    Boolean(loadFromBotId) && loadQuery.isLoading && !loadErrorHandled;

  const initialFormData = clonedInitialFormData ?? preload?.initialFormData;

  return (
    <BotWorkbench
      descriptor={gridPageDescriptor}
      mode="create"
      initialFormData={initialFormData}
      formReloadKey={0}
      isSeedPending={isLoadingClone}
      // Grid's backtest table is Delete-only — no "Load in settings" action.
      onLoadBacktestIntoForm={() => {}}
    />
  );
};

const GridBotNew = () => (
  <BotPageBoundary descriptor={gridPageDescriptor} mode="create">
    <GridBotNewWidget />
  </BotPageBoundary>
);

export default GridBotNew;
