import {
  comboBotByIdSettingsFragment,
  dcaBotSettingsFragment,
  varsFragment,
  botSettings as botSettingsFragment,
} from '@/lib/api/GraphQLQueries-fragments';
import { BotTypesEnum } from '@/types';
import { useCallback, useMemo } from 'react';
import { botQueries } from '../lib/api/GraphQLQueries-bot-queries';
import { useGraphQL } from './useGraphQL';
import { useShareContext } from './useShareContext';
// import { GraphQlQuery } from '../lib/api'; // Not needed for current implementation

export interface BotSettings {
  name: string;
  pair: string;
  exchange: string;
  exchangeUUID: string;
  strategy: 'long' | 'short' | 'both';
  enabled: boolean;
  maxActiveDeals: number;
  baseOrderSize: string;
  safetyOrderSize: string;
  targetPercent: string;
  safetyOrderVolumeScale: string;
  safetyOrderStepScale: string;
  maxSafetyOrders: number;
  step: string;
  useTp: boolean;
  tpPerc: string;
  useSl: boolean;
  slPerc: string;
  orderSize?: string;
  ordersCount?: number;
  volumeScale?: string;
  stepScale?: string;
  maxNumberOfOpenDeals?: number;
  futures?: boolean;
  coinm?: boolean;
  leverage?: number;
  marginType?: string;
  profitCurrency?: string;
  orderFixedIn?: string;
  stepPercentage?: number;
  minimumDeviation?: number;
  activeOrdersCount?: number;
  useMultiTp?: boolean;
  useSmartOrders?: boolean;
  multiTp?: Array<{
    percent: number;
    volume: number;
  }>;
  trailingSl?: boolean;
  trailingTp?: boolean;
  moveSL?: boolean;
  moveSLTrigger?: number;
  moveSLValue?: number;
  startOrderType?: string;
  useLimitPrice?: boolean;
  limitTimeout?: number;
  useLimitTimeout?: boolean;
  hodlDay?: boolean;
  hodlAt?: number;
  hodlHourly?: boolean;
  hodlNextBuy?: boolean;
  useMulti?: boolean;
  maxDealsPerPair?: number;
  useCooldown?: boolean;
  cooldown?: string;
  closeByTimer?: boolean;
  closeByTimerValue?: number;
  startCondition?: string;
  dealStartCondition?: string;
  pairs?: string[];
  type?: string;
  useDca?: boolean;
  orderSizeType?: string;
  minOpenDeal?: number;
  maxOpenDeal?: number;
  cooldownAfterDealStart?: number;
  cooldownAfterDealStartUnits?: string;
  cooldownAfterDealStartInterval?: string;
  cooldownAfterDealStop?: number;
  cooldownAfterDealStopUnits?: string;
  cooldownAfterDealStopInterval?: string;
  cooldownAfterDealStartOption?: string;
  cooldownAfterDealStopOption?: string;
}

export interface BotSettingsData {
  settings: BotSettings;
  exchange: string;
  exchangeUUID: string;
  baseAsset: string[];
  quoteAsset: string[];
  created?: string;
  updated?: string;
  vars?: {
    list: Array<{
      name: string;
      value: string;
    }>;
    paths: Array<{
      path: string;
      value: string;
    }>;
  };
}

export interface UseBotSettingsResult {
  botSettings: BotSettingsData | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to load bot settings from the backend
 * @param botId - The ID of the bot to load settings for
 * @param botType - The type of bot (dca, grid, combo, etc.)
 * @param shareId - Optional share ID for shared bots
 * @returns Bot settings data and loading state
 */
export function useBotSettings(
  botId: string | undefined,
  botType: BotTypesEnum,
  shareId?: string
): UseBotSettingsResult {
  // Fall back to the share id pulled from the URL so callers don't have
  // to thread it through every drawer / widget that mounts useBotSettings.
  const { shareId: ctxShareId } = useShareContext();
  const effectiveShareId = shareId ?? ctxShareId ?? undefined;

  // First try getDCABotSettings for detailed settings
  const getQueryForBotType = useCallback(
    (_type?: string) => {
      if (!botId) return { query: '', variables: {} };

      const input = {
        botId,
        ...(effectiveShareId && { shareId: effectiveShareId }),
      };

      // Use exact same fragment as old dashboard
      const oldDashboardQuery =
        botType === BotTypesEnum.grid
          ? `query getGridBotSettings($input: getBotSettingsInput!) { 
                    getGridBotSettings(input: $input) {
                        status
                        reason
                        data {
                            settings {
                                ${botSettingsFragment}
                            }
                            exchange
                            exchangeUUID
                            baseAsset
                            quoteAsset
                            created
                            updated
                            vars {${varsFragment}}
                        }
                    }
                }`
          : botType === BotTypesEnum.dca
            ? `query getDCABotSettings($input: getBotSettingsInput!) {
                    getDCABotSettings(input: $input) {
                        status
                        reason
                        data {
                            settings {
                                ${dcaBotSettingsFragment}
                            }
                            exchange
                            exchangeUUID
                            baseAsset
                            quoteAsset
                            created
                            updated
                            vars {${varsFragment}}
                        }
                    }
                }`
            : `query getComboBotSettings($input: getBotSettingsInput!) {
                    getComboBotSettings(input: $input) {
                        status
                        reason
                        data {
                            ${comboBotByIdSettingsFragment}
                        }
                    }
                }`;

      return { query: oldDashboardQuery, variables: { input } };
    },
    [botId, effectiveShareId, botType]
  );

  const { query, variables } = useMemo(
    () => getQueryForBotType(botType),
    [getQueryForBotType, botType]
  );

  // Always use getDCABotSettings query key since it's the only available endpoint
  const queryKey = botId
    ? botType === BotTypesEnum.dca
      ? 'getDCABotSettings'
      : botType === BotTypesEnum.grid
        ? 'getGridBotSettings'
        : 'getComboBotSettings'
    : 'dummy';

  // Use the GraphQL hook directly - only when botId is available
  // Add botId to query key to ensure cache invalidation on navigation
  const settingsResult = useGraphQL<BotSettingsData>(
    `${queryKey}_${botId}`,
    {
      query,
      variables,
    },
    {
      enabled: !!botId, // Only execute query when botId is present
      shareId: effectiveShareId ?? null,
    }
  );

  // As fallback, also try getDCABot for basic bot data
  const botQuery = botId
    ? botType === BotTypesEnum.dca
      ? botQueries.getDCABot({
          id: botId,
          ...(effectiveShareId && { shareId: effectiveShareId }),
        })
      : botType === BotTypesEnum.grid
        ? botQueries.getBot({
            id: botId,
            ...(effectiveShareId && { shareId: effectiveShareId }),
          })
        : botQueries.getComboBot({
            id: botId,
            ...(effectiveShareId && { shareId: effectiveShareId }),
          })
    : { query: '', variables: {} };
  const botResult = useGraphQL<unknown>(`getDCABot_${botId}`, botQuery, {
    enabled: !!botId, // Only execute query when botId is present
    shareId: effectiveShareId ?? null,
  });
  // Log errors only
  if (settingsResult.error) {
    console.error(
      '[useBotSettings] getDCABotSettings error:',
      settingsResult.error.message
    );
  }
  if (botResult.error) {
    console.error('[useBotSettings] getDCABot error:', botResult.error.message);
  }

  // Extract bot settings - prefer detailed settings, fallback to basic bot data.
  // Memoize on the two source payloads so the returned reference is stable
  // across renders where nothing changed. The fallback branch builds a brand-new
  // object literal; without memoization that unstable identity defeats the
  // downstream useMemo in useBotFormDataQuery, which BotFormQueryProvider spreads
  // into its context value → every consumer re-renders → this hook runs again →
  // infinite render loop that hard-freezes the bot-edit page.
  const botSettings: BotSettingsData | null = useMemo(() => {
    // Try getDCABotSettings first
    if (settingsResult.data?.status === 'OK') {
      return settingsResult.data.data;
    }

    // Fallback to getDCABot if settings not available
    if (botResult.data?.status === 'OK' && botResult.data.data) {
      const botData = botResult.data.data as {
        settings?: Record<string, unknown>;
        exchange?: string;
        exchangeUUID?: string;
        symbol?: { value?: { baseAsset?: string; quoteAsset?: string } };
        created?: string;
        updated?: string;
      };
      // Convert basic bot data to BotSettingsData format
      return {
        settings: (botData.settings || {}) as unknown as BotSettings,
        exchange: botData.exchange || '',
        exchangeUUID: botData.exchangeUUID || '',
        baseAsset: botData.symbol?.value?.baseAsset
          ? [botData.symbol.value.baseAsset]
          : [],
        quoteAsset: botData.symbol?.value?.quoteAsset
          ? [botData.symbol.value.quoteAsset]
          : [],
        created: botData.created || '',
        updated: botData.updated || '',
      };
    }

    return null;
  }, [settingsResult.data, botResult.data]);

  return {
    botSettings,
    isLoading: settingsResult.isLoading || botResult.isLoading,
    isError: settingsResult.isError && botResult.isError,
    error: settingsResult.error || botResult.error,
    refetch: () => {
      settingsResult.refetch();
      botResult.refetch();
    },
  };
}
