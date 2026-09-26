import { useEffect, useMemo } from 'react';

import type { BotFormMode } from '@/contexts/bots/form/BotFormProvider';
import { useBotFormRegistryContext } from '@/features/bots/widgets/BotForm';
import { useBotSettings } from '@/hooks/useBotSettings';
import { useSharedBot } from '@/hooks/useSharedBot';
import { useComboBotsStore } from '@/stores/live/comboBotsStore';
import { useDcaBotsStore } from '@/stores/live/dcaBotsStore';
import { useGridBotsStore } from '@/stores/live/gridBotsStore';
import {
  BotTypesEnum,
  type ComboBot,
  type DCABot,
  type ExchangeInUser,
} from '@/types';
import type { GridBot } from '@/types/gridBot';
import { useExchangesFromContext } from '@/contexts/ExchangeDataContext';

// Stable module-level empty so the result keeps a constant identity when the
// exchange list is absent.
const EMPTY_EXCHANGES: ExchangeInUser[] = [];

export interface UseBotFormDataQueryOptions {
  botId?: string;
  mode: BotFormMode;
  debug?: boolean;
}

export interface UseBotFormDataQueryResult {
  bot: DCABot | GridBot | ComboBot | null;
  botSettings: ReturnType<typeof useBotSettings>['botSettings'];
  botSettingsLoading: boolean;
  exchanges: ExchangeInUser[];
  exchangesLoading: boolean;
  refetchExchanges: () => Promise<void>;
}

/**
 * What the bot form loads for itself: the edited bot (edit mode only), its
 * saved settings, and the user's exchanges.
 *
 * It used to load EVERY DCA, Grid and Combo bot of the account — in create mode
 * too — only to `find` the edited one, and every live update to any of those
 * bots rebuilt the result and re-rendered the whole form. Now the edited bot is
 * read by id from its live store (so it still tracks status / deals in real
 * time), with a single by-id fetch that refreshes it or seeds it when the store
 * does not hold it yet (the edit page opened directly).
 */
export const useBotFormDataQuery = (
  options: UseBotFormDataQueryOptions
): UseBotFormDataQueryResult => {
  const { botId, mode } = options;
  const { botExperience } = useBotFormRegistryContext();
  const wantsBot = mode === 'edit' && !!botId;
  const botType =
    botExperience.id === BotTypesEnum.grid
      ? BotTypesEnum.grid
      : botExperience.id === BotTypesEnum.combo
        ? BotTypesEnum.combo
        : BotTypesEnum.dca;

  // By-id selectors: re-render only when THIS bot changes, never on updates
  // to the account's other bots.
  const dcaStoreBot = useDcaBotsStore((s) =>
    wantsBot && botType === BotTypesEnum.dca ? (s.bots[botId] ?? null) : null
  );
  const comboStoreBot = useComboBotsStore((s) =>
    wantsBot && botType === BotTypesEnum.combo ? (s.bots[botId] ?? null) : null
  );
  const gridStoreBot = useGridBotsStore((s) =>
    wantsBot && botType === BotTypesEnum.grid
      ? ((s.bots[botId] as GridBot | undefined) ?? null)
      : null
  );
  const storeBot: DCABot | GridBot | ComboBot | null =
    dcaStoreBot ?? comboStoreBot ?? gridStoreBot;

  // One authenticated by-id fetch of the edited bot (same query the drawer uses
  // for a bot outside the loaded list).
  const fetched = useSharedBot({
    botId: botId ?? '',
    type: botType,
    shareId: null,
    enabled: wantsBot,
  });
  const fetchedBot = fetched.bot as DCABot | GridBot | ComboBot | null;

  // Put the fetched bot into its live store so socket updates (status, deals)
  // and status toggles reach it exactly as they did when the whole list was
  // loaded. `updateBot` keeps the store's own staleness / tombstone rules.
  useEffect(() => {
    if (!fetchedBot || !botId || fetchedBot._id !== botId) return;
    const store =
      botType === BotTypesEnum.combo
        ? useComboBotsStore
        : botType === BotTypesEnum.grid
          ? useGridBotsStore
          : useDcaBotsStore;
    const state = store.getState() as {
      bots: Record<string, unknown>;
      addBot: (b: never) => void;
      updateBot: (b: never) => void;
    };
    if (state.bots[botId]) {
      state.updateBot(fetchedBot as never);
    } else {
      state.addBot(fetchedBot as never);
    }
  }, [fetchedBot, botId, botType]);

  const bot = wantsBot ? (storeBot ?? fetchedBot ?? null) : null;

  const { botSettings, isLoading: botSettingsLoading } = useBotSettings(
    botId,
    botExperience.id
  );

  const { data, loading, refresh } = useExchangesFromContext();

  const exchanges = useMemo(
    () => data.data.exchanges || EMPTY_EXCHANGES,
    [data.data.exchanges]
  );

  return useMemo(
    () => ({
      bot,
      botSettings,
      botSettingsLoading,
      exchanges,
      exchangesLoading: loading,
      refetchExchanges: refresh,
    }),
    [bot, botSettings, botSettingsLoading, exchanges, loading, refresh]
  );
};
